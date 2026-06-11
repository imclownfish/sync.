const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID || '';

// Serve static files from the site root
app.use(express.static(path.join(__dirname)));

// In-memory cache for trending movies to reduce requests
let traktCache = null;
let traktCacheTs = 0;
const TRAKT_CACHE_TTL = 1000 * 60 * 5; // 5 minutes
const TRAKT_CACHE_FILE = path.join(__dirname, 'trakt_cache.json');

// Try to load persisted cache on startup
try {
  if (fs.existsSync(TRAKT_CACHE_FILE)) {
    const raw = fs.readFileSync(TRAKT_CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.data && parsed.ts) {
      traktCache = parsed.data;
      traktCacheTs = parsed.ts;
    }
  }
} catch (err) {
  console.warn('Could not read persisted trakt cache:', err && err.message);
}

async function fetchTraktWithRetry(limit = 80, retries = 2) {
  if (!TRAKT_CLIENT_ID) throw new Error('Trakt client id not configured');

  const endpoint = `https://api.trakt.tv/movies/trending?limit=${limit}&extended=images`;
  let attempt = 0;
  let lastErr = null;

  while (attempt <= retries) {
    try {
      const response = await fetch(endpoint, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'trakt-api-version': '2',
          'trakt-api-key': TRAKT_CLIENT_ID,
          'User-Agent': 'Aneria/1.0 (+https://aneria.onrender.com)'
        }
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Trakt ${response.status}: ${text}`);
      }
      const data = await response.json();
      return data;
    } catch (err) {
      lastErr = err;
      const backoff = 200 * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, backoff));
      attempt++;
    }
  }
  throw lastErr || new Error('Unknown Trakt error');
}

// Proxy endpoint for Trakt trending movies with cache and retry
app.get('/api/trakt/movies/trending', async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 80;

  // Serve from cache when fresh
  const now = Date.now();
  if (traktCache && (now - traktCacheTs) < TRAKT_CACHE_TTL) {
    return res.json(traktCache.slice(0, limit));
  }

  try {
    const data = await fetchTraktWithRetry(limit);
    traktCache = data;
    traktCacheTs = Date.now();
    // persist cache to disk
    try {
      fs.writeFileSync(TRAKT_CACHE_FILE, JSON.stringify({ data: traktCache, ts: traktCacheTs }), 'utf8');
    } catch (err) {
      console.warn('Failed to persist trakt cache:', err && err.message);
    }
    res.json(data.slice(0, limit));
  } catch (err) {
    console.error('Trakt proxy error:', err);
    res.status(502).json({ error: 'Failed to fetch from Trakt', detail: String(err) });
  }
});

// Refresh endpoint: forces a fresh fetch and updates cache
app.get('/api/trakt/refresh', async (req, res) => {
  try {
    const data = await fetchTraktWithRetry(80, 3);
    traktCache = data;
    traktCacheTs = Date.now();
    try {
      fs.writeFileSync(TRAKT_CACHE_FILE, JSON.stringify({ data: traktCache, ts: traktCacheTs }), 'utf8');
    } catch (err) {
      console.warn('Failed to persist trakt cache on refresh:', err && err.message);
    }
    res.json({ ok: true, count: (data || []).length });
  } catch (err) {
    console.error('Trakt refresh error:', err);
    res.status(502).json({ ok: false, error: String(err) });
  }
});

// Jikan anime proxy with cache
let jikanCache = null;
let jikanCacheTs = 0;
const JIKAN_CACHE_TTL = 1000 * 60 * 5;
app.get('/api/jikan/top/anime', async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 80;
  const now = Date.now();
  if (jikanCache && (now - jikanCacheTs) < JIKAN_CACHE_TTL) {
    return res.json(jikanCache.slice(0, limit));
  }
  try {
    const endpoint = `https://api.jikan.moe/v4/top/anime?limit=${limit}`;
    const response = await fetch(endpoint, { headers: { 'Accept': 'application/json', 'User-Agent': 'Aneria/1.0' } });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Jikan ${response.status}: ${text}`);
    }
    const data = await response.json();
    const arr = (data.data || []).slice(0, limit);
    jikanCache = arr;
    jikanCacheTs = Date.now();
    res.json(arr);
  } catch (err) {
    console.error('Jikan proxy error:', err);
    res.status(502).json({ error: 'Failed to fetch from Jikan', detail: String(err) });
  }
});

// TVmaze proxy with cache (returns combined pages)
let tvCache = null;
let tvCacheTs = 0;
const TV_CACHE_TTL = 1000 * 60 * 5;
app.get('/api/tvmaze/shows', async (req, res) => {
  const pages = req.query.pages ? req.query.pages.split(',').map(Number) : [0,1,2];
  const now = Date.now();
  if (tvCache && (now - tvCacheTs) < TV_CACHE_TTL) {
    return res.json(tvCache.slice(0, 120));
  }
  try {
    const results = [];
    for (const p of pages) {
      const endpoint = `https://api.tvmaze.com/shows?page=${p}`;
      const response = await fetch(endpoint, { headers: { 'Accept': 'application/json', 'User-Agent': 'Aneria/1.0' } });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`TVmaze ${response.status}: ${text}`);
      }
      const data = await response.json();
      results.push(...data);
    }
    const shows = results.slice(0, 120);
    tvCache = shows;
    tvCacheTs = Date.now();
    res.json(shows);
  } catch (err) {
    console.error('TVmaze proxy error:', err);
    res.status(502).json({ error: 'Failed to fetch from TVmaze', detail: String(err) });
  }
});

// Status endpoint so the client can detect whether proxy is configured
app.get('/api/proxy/status', (req, res) => {
  res.json({ traktConfigured: Boolean(TRAKT_CLIENT_ID) });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
