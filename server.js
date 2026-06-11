const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID || '';
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';

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

  const endpoint = `https://api.trakt.tv/movies/trending?limit=${limit}&extended=images,full`;
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

// Trakt movie search proxy
app.get('/api/trakt/search/movie', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = parseInt(req.query.limit, 10) || 20;
  if (!q) return res.status(400).json({ error: 'query required' });
  if (!TRAKT_CLIENT_ID) return res.status(502).json({ error: 'Trakt proxy not configured' });
  try {
    const endpoint = `https://api.trakt.tv/search/movie?query=${encodeURIComponent(q)}&limit=${limit}&extended=images`;
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
      throw new Error(`Trakt search ${response.status}: ${text}`);
    }
    const data = await response.json();
    res.json(data.slice(0, limit));
  } catch (err) {
    console.error('Trakt search error:', err);
    res.status(502).json({ error: 'Failed to search Trakt', detail: String(err) });
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

let kitsuCache = null;
let kitsuCacheTs = 0;
const KITSU_CACHE_TTL = 1000 * 60 * 5;
app.get('/api/anime/trending', async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 80;
  const now = Date.now();
  if (kitsuCache && (now - kitsuCacheTs) < KITSU_CACHE_TTL) {
    return res.json(kitsuCache);
  }

  try {
    const endpoint = `https://kitsu.io/api/edge/trending/anime?limit=${limit}`;
    const response = await fetch(endpoint, { headers: { 'Accept': 'application/vnd.api+json', 'User-Agent': 'Aneria/1.0' } });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Kitsu ${response.status}: ${text}`);
    }
    const data = await response.json();
    kitsuCache = data;
    kitsuCacheTs = Date.now();
    res.json(data);
  } catch (err) {
    console.error('Kitsu anime proxy error:', err);
    res.status(502).json({ error: 'Failed to fetch from Kitsu', detail: String(err) });
  }
});

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

app.get('/api/watch/providers', async (req, res) => {
  if (!TMDB_API_KEY) {
    return res.status(502).json({ error: 'TMDb API key not configured on the server.' });
  }

  const query = String(req.query.query || '').trim();
  const tmdbId = req.query.tmdbId ? parseInt(req.query.tmdbId, 10) : null;
  const type = String(req.query.type || 'movie').toLowerCase();
  const region = String(req.query.region || 'US').toUpperCase();

  try {
    let providerType = type === 'tv' ? 'tv' : 'movie';
    let id = tmdbId;

    if (!id) {
      if (!query) {
        return res.status(400).json({ error: 'tmdbId or query parameter is required.' });
      }

      const searchType = type === 'tv' ? 'tv' : type === 'multi' ? 'multi' : 'movie';
      const endpoint = `${TMDB_BASE}/search/${searchType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=1&include_adult=false`;
      const response = await fetch(endpoint, { headers: { 'Accept': 'application/json', 'User-Agent': 'Aneria/1.0' } });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`TMDb search ${response.status}: ${text}`);
      }
      const data = await response.json();
      const result = Array.isArray(data.results) ? data.results.find(r => r.media_type !== 'person') || data.results[0] : null;
      if (!result) {
        return res.status(404).json({ error: 'No TMDb entry found for that query.' });
      }
      id = result.id;
      providerType = result.media_type === 'tv' ? 'tv' : 'movie';
    }

    const providerUrl = `${TMDB_BASE}/${providerType}/${id}/watch/providers?api_key=${TMDB_API_KEY}`;
    const providerRes = await fetch(providerUrl, { headers: { 'Accept': 'application/json', 'User-Agent': 'Aneria/1.0' } });
    if (!providerRes.ok) {
      const text = await providerRes.text().catch(() => '');
      throw new Error(`TMDb providers ${providerRes.status}: ${text}`);
    }

    const providerData = await providerRes.json();
    const regionData = providerData.results && (providerData.results[region] || providerData.results.US || Object.values(providerData.results)[0]);
    const providers = [];
    if (regionData) {
      ['flatrate', 'rent', 'buy', 'free', 'ads'].forEach((group) => {
        if (Array.isArray(regionData[group])) {
          regionData[group].forEach(provider => {
            providers.push({
              provider_id: provider.provider_id,
              provider_name: provider.provider_name,
              logo_path: provider.logo_path,
              type: group,
              display_priority: provider.display_priority,
              url: regionData.link || null
            });
          });
        }
      });
    }

    res.json({ success: true, region: region, type: providerType, providers, link: (regionData && regionData.link) || null });
  } catch (err) {
    console.error('Watch provider lookup error:', err);
    res.status(502).json({ error: 'Failed to fetch watch providers', detail: String(err) });
  }
});

// Status endpoint so the client can detect whether proxy is configured
app.get('/api/proxy/status', (req, res) => {
  res.json({ traktConfigured: Boolean(TRAKT_CLIENT_ID) });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
