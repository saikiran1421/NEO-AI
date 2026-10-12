'use strict';
/* NEO backend — keeps the AI key on the server, validates input, rate-limits, streams chat, stores feedback. */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.NEO_MODEL || 'claude-sonnet-5-5';
const CORS_ORIGIN = (process.env.CORS_ORIGIN || '*').split(',').map(s => s.trim()).filter(Boolean);
const DATA_DIR = path.join(__dirname, 'data');
const API_URL = 'https://api.anthropic.com/v1/messages';

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: CORS_ORIGIN.includes('*') ? true : CORS_ORIGIN }));
app.use(express.json({ limit: '20kb' }));

/* ---------- tiny in-memory rate limiter (per IP) ---------- */
function limiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now(), k = req.ip;
    let h = hits.get(k);
    if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; hits.set(k, h); }
    if (++h.n > max) {
      res.set('Retry-After', String(Math.ceil((h.reset - now) / 1000)));
      return res.status(429).json({ error: 'rate_limited', message: 'Too many requests — please wait a moment.' });
    }
    next();
  };
}
const aiLimit = limiter(20, 60 * 1000);
const feedbackLimit = limiter(5, 10 * 60 * 1000);

/* ---------- helpers ---------- */
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const bad = (res, message, code = 'bad_request', status = 400) => res.status(status).json({ error: code, message });

function mapUpstream(status) {
  if (status === 401 || status === 403) return { status: 502, error: 'ai_auth', message: 'The server AI key was rejected. Check ANTHROPIC_API_KEY.' };
  if (status === 429) return { status: 503, error: 'ai_busy', message: 'The AI is busy right now. Try again in a few seconds.' };
  if (status === 400 || status === 404) return { status: 502, error: 'ai_config', message: 'AI request was rejected. Check NEO_MODEL.' };
  return { status: 502, error: 'ai_error', message: 'The AI service had a problem. Please retry.' };
}

async function callAI(body, signal) {
  return fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, ...body }),
    signal
  });
}
const needKey = (req, res, next) => API_KEY ? next() : bad(res, 'The server has no ANTHROPIC_API_KEY set.', 'ai_not_configured', 503);

/* ---------- routes ---------- */
app.get('/api/health', (req, res) => res.json({ ok: true, ai: !!API_KEY, model: API_KEY ? MODEL : null }));

/* Step-by-step solver → structured JSON */
app.post('/api/solve', aiLimit, needKey, async (req, res) => {
  const question = clean(req.body && req.body.question, 2000);
  const subject = clean(req.body && req.body.subject, 40) || 'General';
  if (question.length < 2) return bad(res, 'Please enter a question.');
  try {
    const up = await callAI({
      max_tokens: 1200,
      system: 'You are NEO, a friendly AI tutor for students. Teach the idea instead of only giving the answer. ' +
        'Reply with ONLY a JSON object, no markdown fences and no other text, in exactly this shape: ' +
        '{"concept":"short concept explanation","steps":["step 1","step 2"],"answer":"final answer","explanation":"why it works","more":["related topic","related topic","related topic"]}',
      messages: [{ role: 'user', content: `Subject: ${subject}\nStudent question: ${question}` }]
    }, AbortSignal.timeout(60000));
    if (!up.ok) { const m = mapUpstream(up.status); return bad(res, m.message, m.error, m.status); }
    const data = await up.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return bad(res, 'The AI reply was not in the expected format. Please retry.', 'bad_reply', 502);
    let r; try { r = JSON.parse(m[0]); } catch { return bad(res, 'The AI reply could not be read. Please retry.', 'bad_reply', 502); }
    const steps = Array.isArray(r.steps) ? r.steps.map(x => clean(x, 600)).filter(Boolean).slice(0, 12) : [];
    if (!r.concept || !steps.length) return bad(res, 'The AI reply was incomplete. Please retry.', 'bad_reply', 502);
    res.json({
      concept: clean(r.concept, 1000), steps, answer: clean(r.answer, 1000),
      explanation: clean(r.explanation, 1500),
      more: Array.isArray(r.more) ? r.more.map(x => clean(x, 80)).filter(Boolean).slice(0, 5) : []
    });
  } catch (e) {
    bad(res, e.name === 'TimeoutError' ? 'The AI took too long. Please retry.' : 'Could not reach the AI service.', 'ai_unreachable', 504);
  }
});

/* Tutor chat → streamed plain text */
const CHAT_SYSTEM = 'You are NEO, a friendly AI tutor for students. Explain concepts simply and step by step, helping the student understand rather than just giving answers. Keep replies under 180 words, plain text without markdown.';
app.post('/api/chat', aiLimit, needKey, async (req, res) => {
  const raw = Array.isArray(req.body && req.body.messages) ? req.body.messages.slice(-20) : [];
  let messages = raw
    .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
    .map(m => ({ role: m.role, content: clean(m.content, 2000) }))
    .filter(m => m.content);
  while (messages.length && messages[0].role !== 'user') messages.shift();       // must start with user
  messages = messages.reduce((a, m) => {                                          // merge same-role runs
    if (a.length && a[a.length - 1].role === m.role) a[a.length - 1].content += '\n' + m.content; else a.push(m); return a;
  }, []);
  if (!messages.length || messages[messages.length - 1].role !== 'user') return bad(res, 'Send a message first.');

  const ac = new AbortController();
  res.on('close', () => ac.abort());                                              // client left → stop upstream
  try {
    const up = await callAI({ max_tokens: 700, stream: true, system: CHAT_SYSTEM, messages }, ac.signal);
    if (!up.ok) { const m = mapUpstream(up.status); return bad(res, m.message, m.error, m.status); }
    res.status(200).set({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
    const dec = new TextDecoder(); let buf = '';
    for await (const chunk of up.body) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        try {
          const ev = JSON.parse(line.slice(5));
          if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') res.write(ev.delta.text);
        } catch { /* ignore keep-alive / partial lines */ }
      }
    }
    res.end();
  } catch (e) {
    if (res.headersSent) return res.end();
    bad(res, 'Could not reach the AI service.', 'ai_unreachable', 504);
  }
});

/* Feedback form → data/feedback.jsonl */
app.post('/api/feedback', feedbackLimit, (req, res) => {
  const b = req.body || {};
  const entry = { name: clean(b.name, 80), email: clean(b.email, 120), subject: clean(b.subject, 120), message: clean(b.message, 2000) };
  if (entry.name.length < 2) return bad(res, 'Enter your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email)) return bad(res, 'Enter a valid email.');
  if (!entry.subject) return bad(res, 'Enter a subject.');
  if (entry.message.length < 10) return bad(res, 'Message needs 10+ characters.');
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(path.join(DATA_DIR, 'feedback.jsonl'), JSON.stringify({ ...entry, at: new Date().toISOString() }) + '\n');
    res.json({ ok: true });
  } catch { bad(res, 'Could not save feedback.', 'server_error', 500); }
});

/* ---------- frontend + fallbacks ---------- */
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (req, res) => bad(res, 'Unknown API route.', 'not_found', 404));
app.use((err, req, res, next) => {                                                 // bad JSON etc.
  if (res.headersSent) return next(err);
  bad(res, err.type === 'entity.too.large' ? 'Request too large.' : 'Invalid request.', 'bad_request', err.status || 400);
});

app.listen(PORT, () => {
  console.log(`NEO running at http://localhost:${PORT}`);
  console.log(API_KEY ? `AI enabled (model: ${MODEL})` : 'AI DISABLED — set ANTHROPIC_API_KEY in .env (site will run in demo mode)');
});
