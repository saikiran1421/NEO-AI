# NEO — Student Problem-Solving Companion

NEO includes a static HTML/CSS/JavaScript frontend and a Node.js/Express backend. The backend has a demo response mode and can call the OpenAI API when a server-side API key is configured.

## Project structure

```text
neo-project/
├── frontend/
│   └── index.html
├── backend/
│   ├── server.js
│   ├── package.json
│   └── .env.example
├── .gitignore
└── README.md
```

## 1. Run locally

Requirements: Node.js 18 or newer.

1. Open a terminal in the `backend` folder.
2. Run `npm install`
3. Run `npm start`
4. Open `frontend/index.html` in a browser, or use VS Code Live Server.
5. The frontend defaults to `http://localhost:3000`.

Without an AI key, chat runs in demo mode. To enable AI answers, set `OPENAI_API_KEY` in your terminal/session or hosting environment. Never put the key in `frontend/index.html`.

Example for PowerShell (current terminal only):

```powershell
$env:OPENAI_API_KEY="your-real-key"
npm start
```

## 2. Deploy the frontend on GitHub Pages

GitHub Pages serves static files only; it cannot run the Node backend.

1. Create a GitHub repository, for example `neo-student-project`.
2. Upload the contents of this project.
3. In the repository, open **Settings → Pages**.
4. Choose **Deploy from a branch**, select `main`, and select `/(root)` only if you move/copy `frontend/index.html` to the repository root. Alternatively, use a GitHub Actions static deployment or put the frontend in the root.
5. After Pages gives you a website URL, copy it.

**Important:** Before publishing, edit `frontend/index.html` and change:
`const API_BASE_URL = "http://localhost:3000";`
to the HTTPS URL of your deployed backend, for example:
`const API_BASE_URL = "https://your-neo-api.onrender.com";`

Do not leave `localhost` in a live website.

## 3. Deploy the backend on Render

1. Push the repository to GitHub.
2. In Render, create a **New Web Service** and connect the repository.
3. Set **Root Directory** to `backend`.
4. Set **Build Command** to `npm install`.
5. Set **Start Command** to `npm start`.
6. Deploy. Open `https://YOUR-SERVICE.onrender.com/api/health`; it should return `{"ok":true}`.
7. In the service's **Environment** settings, add:
   - `OPENAI_API_KEY` = your private API key (optional; without it, demo mode is used)
   - `OPENAI_MODEL` = `gpt-4o-mini` (optional)
   - `FRONTEND_ORIGIN` = your exact GitHub Pages origin, e.g. `https://YOUR-USERNAME.github.io`
8. Copy the backend HTTPS URL into `API_BASE_URL` in the frontend and commit the change.

If your provider uses a different backend host, use that provider's URL instead.

## Security notes

- Never commit `.env`, API keys, passwords, or private student information.
- Configure `FRONTEND_ORIGIN` to your published frontend origin after deployment rather than leaving it open to every origin.
- This starter has basic input validation, but it is not a production-grade multi-user service. Before public launch, add rate limiting, abuse monitoring, stronger logging controls, and privacy/retention rules.
- The current starter does not save chat history or collect student records.
