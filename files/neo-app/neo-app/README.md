# NEO — frontend + backend

The website (`public/index.html`) talks to a small Node server (`server.js`).
The server holds your AI key, so **no API key ever appears in the browser code**.

## Run it locally
1. Install Node 18 or newer.
2. In this folder run: `npm install`
3. Copy `.env.example` to `.env` and put your key in `ANTHROPIC_API_KEY`.
4. Run: `npm start`
5. Open http://localhost:3000

The badge in the Solver and Chat sections turns green ("AI connected") when the backend is working.
If the key is missing or the server is off, NEO falls back to its built-in demo answers.

## What the backend provides
| Route | What it does |
|---|---|
| `GET /api/health` | Tells the site whether AI is configured |
| `POST /api/solve` | Step-by-step solver; returns concept, steps, answer, explanation, related topics |
| `POST /api/chat` | Tutor chat; streams the reply as it is written |
| `POST /api/feedback` | Validates the feedback form and saves it to `data/feedback.jsonl` |

Built in: input validation and length limits, per-IP rate limiting (20 AI requests/min, 5 feedback/10 min),
safe error messages (the key is never exposed), and CORS control.

## Putting it online
1. Deploy this folder to a Node host (Render, Railway, Fly.io, etc.). Start command: `npm start`.
2. Set `ANTHROPIC_API_KEY` (and optionally `NEO_MODEL`) as environment variables on the host. Do not upload `.env`.
3. Visit the host URL; the site is served by the same server, so nothing else needs configuring.

**If the frontend is hosted somewhere else** (for example Netlify):
- In `public/index.html`, add this line just before the big `<script>` near the end:
  `<script>window.NEO_BACKEND='https://your-backend-url';</script>`
- On the backend set `CORS_ORIGIN=https://your-site-url` so only your site can call it.

## Notes
- Feedback is stored in a file on the server. Many hosts wipe local files on redeploy, so use a database or a persistent disk if you need to keep it long term.
- The dashboard progress and recent questions still live in the browser session (not saved to the server).
