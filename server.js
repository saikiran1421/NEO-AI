const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";

app.use(cors({
  origin: FRONTEND_ORIGIN === "*" ? true : FRONTEND_ORIGIN.split(",").map(x => x.trim()),
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json({ limit: "20kb" }));

app.get("/", (_req, res) => res.json({ name: "NEO API", status: "online" }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/chat", async (req, res) => {
  try {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message) return res.status(400).json({ error: "Please enter a question." });
    if (message.length > 4000) return res.status(413).json({ error: "Please keep your question under 4,000 characters." });

    // Demo fallback lets the frontend work before an AI key is configured.
    if (!process.env.OPENAI_API_KEY) {
      return res.json({
        reply: `NEO demo mode: I received your question:\n\n“${message}”\n\nTo enable AI-generated answers, the project owner must add OPENAI_API_KEY to the backend environment variables. Meanwhile, try breaking the question into smaller steps and identify what you already know.`
      });
    }

    const apiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are NEO, a friendly student learning assistant. Explain concepts clearly, use step-by-step reasoning suitable for a student, encourage learning, and be honest when uncertain. Do not claim to be a human teacher." },
          { role: "user", content: message }
        ],
        temperature: 0.5
      })
    });

    const result = await apiResponse.json();
    if (!apiResponse.ok) {
      console.error("AI provider error:", result?.error?.message || apiResponse.status);
      return res.status(502).json({ error: "The AI service could not answer. Check the backend API key and provider settings." });
    }
    const reply = result.choices?.[0]?.message?.content;
    if (!reply) return res.status(502).json({ error: "The AI service returned an empty answer." });
    res.json({ reply });
  } catch (error) {
    console.error("Chat route error:", error.message);
    res.status(500).json({ error: "Unexpected server error. Please try again." });
  }
});

app.listen(PORT, () => console.log(`NEO backend listening on port ${PORT}`));
