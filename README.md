# Aneria Website — Render deployment

This repository contains a static website plus a small Node proxy server used to fetch Trakt data (to avoid CORS). The server also provides caching and a refresh endpoint.

Quick start (local):

1. Install dependencies and start the server locally:

```bash
cd website
npm install
TRAKT_CLIENT_ID=your_trakt_client_id npm start
```

2. Open http://localhost:3000/movies.html to verify.

Deploying to Render (recommended):

1. Push this repository to GitHub.
2. Create a new **Web Service** on Render and connect your GitHub repo.
   - Build Command: `npm install`
   - Start Command: `npm start`
3. Under Environment, add a new Environment Variable:
   - Key: `TRAKT_CLIENT_ID`
   - Value: your Trakt Client ID (create at https://trakt.tv/oauth/applications)
4. Deploy. Render will run `npm install` and `npm start` and serve the site on a public URL.

Notes
- The client-side code intentionally does not contain the Trakt Client ID; the server uses the environment variable so the key stays secret.
- The server persists a short cache in `trakt_cache.json` to reduce API calls.
- If you want a serverless approach instead, I can convert the proxy into a Render cron+function or a serverless function for Vercel/Netlify.
