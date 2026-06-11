const TMDB_API_KEY = ""; // Add your TMDb API key here to enable live movie updates (optional).
const TMDB_BASE = "https://api.themoviedb.org/3";
// Free movie provider: Trakt.tv (requires a free Client ID).
// IMPORTANT: Do NOT put your Trakt Client ID in client-side code. Leave empty — server proxy uses an environment variable instead.
const TRAKT_CLIENT_ID = "";

const dataFallback = {
  movies: [
    {
      title: "Inception",
      genre: "Sci-Fi, Thriller",
      year: "2010",
      rating: "8.8/10",
      description: "A mind-bending heist film directed by Christopher Nolan, following a team of specialists who enter dreams to steal and plant ideas.",
      image: "/assets/placeholder.svg",
      link: "https://www.imdb.com/title/tt1375666/"
    },
    {
      title: "Parasite",
      genre: "Drama, Thriller",
      year: "2019",
      rating: "8.6/10",
      description: "Bong Joon-ho's Oscar-winning social thriller about two families from different economic worlds whose lives become dangerously intertwined.",
      image: "/assets/placeholder.svg",
      link: "https://www.imdb.com/title/tt6751668/"
    },
    {
      title: "The Grand Budapest Hotel",
      genre: "Comedy, Drama",
      year: "2014",
      rating: "8.1/10",
      description: "A whimsical story of a legendary concierge and a lobby boy on an adventure through a fictional European kingdom in the 1930s.",
      image: "/assets/placeholder.svg",
      link: "https://www.imdb.com/title/tt2278388/"
    }
  ],
  anime: [
    {
      title: "Attack on Titan",
      genre: "Action, Dark Fantasy",
      studio: "MAPPA / Wit Studio",
      synopsis: "Humanity fights for survival behind massive walls as mysterious Titans threaten destruction and secrets emerge from the ruins.",
      image: "/assets/placeholder.svg",
      link: "https://attackontitan.fandom.com/wiki/Attack_on_Titan"
    },
    {
      title: "Demon Slayer: Kimetsu no Yaiba",
      genre: "Action, Fantasy",
      studio: "Ufotable",
      synopsis: "A young swordsman joins the Demon Slayer Corps to avenge his family and cure his sister after a demon attack transforms her into one of them.",
      image: "/assets/placeholder.svg",
      link: "https://kimetsu-no-yaiba.fandom.com/wiki/Demon_Slayer:_Kimetsu_no_Yaiba"
    },
    {
      title: "My Hero Academia",
      genre: "Superhero, School",
      studio: "Bones",
      synopsis: "In a world where most people have superpowers, a powerless boy trains at a hero academy after inheriting the ability of the world's greatest hero.",
      image: "/assets/placeholder.svg",
      link: "https://myheroacademia.fandom.com/wiki/My_Hero_Academia"
    }
  ],
  tvShows: [
    {
      title: "Stranger Things",
      genre: "Sci-Fi, Horror",
      seasons: "4",
      synopsis: "A group of friends in the 1980s uncovers supernatural threats in their town while trying to rescue a missing boy.",
      image: "/assets/placeholder.svg",
      link: "https://www.imdb.com/title/tt4574334/"
    },
    {
      title: "The Crown",
      genre: "Historical Drama",
      seasons: "6",
      synopsis: "A dramatized history of the reign of Queen Elizabeth II and the political and personal events that shaped the modern British monarchy.",
      image: "/assets/placeholder.svg",
      link: "https://www.imdb.com/title/tt4786824/"
    },
    {
      title: "Black Mirror",
      genre: "Sci-Fi, Anthology",
      seasons: "6",
      synopsis: "A collection of standalone episodes exploring dark and often dystopian consequences of modern technology.",
      image: "/assets/placeholder.svg",
      link: "https://www.imdb.com/title/tt2085059/"
    }
  ]
};

const pageKey = document.body.dataset.page;
const contentContainer = document.getElementById("content");
const statusContainer = document.getElementById("status");

let currentItems = [];
let filteredItems = [];
let lastLiveError = null;

function showProxyNotice(status) {
  // Simplified: add a subtle refresh button (no proxy messaging exposed)
  let btn = document.getElementById('refresh-live-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'refresh-live-btn';
    btn.textContent = 'Refresh live data';
    btn.className = 'refresh-btn';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const prev = btn.textContent;
      btn.textContent = 'Refreshing...';
      try {
        const res = await fetch('/api/trakt/refresh');
        if (!res.ok) throw new Error(`Refresh ${res.status}`);
        await res.json();
        const liveItems = await loadLiveData(pageKey);
        if (liveItems && liveItems.length) {
          currentItems = liveItems;
          filteredItems = currentItems;
          renderItems(filteredItems, pageKey);
          setStatus('Live content refreshed.');
        } else {
          setStatus('Refresh completed but no live items returned.', true);
        }
      } catch (err) {
        setStatus('Refresh failed: ' + (err.message || String(err)), true);
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });

    if (statusContainer && statusContainer.parentNode) {
      statusContainer.parentNode.insertBefore(btn, statusContainer);
    } else {
      document.body.insertBefore(btn, document.body.firstChild);
    }
  }
}

async function checkProxyStatus() {
  try {
    const res = await fetch('/api/proxy/status');
    if (!res.ok) throw new Error(`status ${res.status}`);
    const status = await res.json();
    showProxyNotice(status);
    return status;
  } catch (err) {
    // If the status endpoint is unreachable, assume proxy not available
    lastLiveError = err.message || String(err);
    showProxyNotice({ traktConfigured: false });
    return { traktConfigured: false };
  }
}

function setStatus(message, isError = false) {
  if (!statusContainer) return;
  statusContainer.textContent = message;
  statusContainer.style.color = isError ? "#ff7b72" : "#8b949e";
}

function sanitizeText(text) {
  if (!text) return "";
  return text.replace(/<[^>]+>/g, "").trim();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.json();
}

async function fetchTmdbGenres() {
  if (!TMDB_API_KEY) return {};
  try {
    const data = await fetchJson(`${TMDB_BASE}/genre/movie/list?api_key=${TMDB_API_KEY}&language=en-US`);
    return (data.genres || []).reduce((map, genre) => {
      map[genre.id] = genre.name;
      return map;
    }, {});
  } catch (error) {
    console.warn("TMDb genre list unavailable.", error);
    lastLiveError = error.message || String(error);
    return {};
  }
}

function formatRating(value) {
  if (value === undefined || value === null || value === '') return 'N/A';
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(num)) return String(value).trim() || 'N/A';
  if (num > 10) return `${num.toFixed(0)}/100`;
  return `${num.toFixed(1)}/10`;
}

function getRatingFromMovie(m) {
  if (!m) return 'N/A';
  const candidates = [m.rating, m.vote_average, m.score, (m.ratings && (m.ratings.rating || m.ratings.average)), (m.stats && m.stats.rating)];
  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    const num = typeof c === 'number' ? c : parseFloat(c);
    if (!isNaN(num)) return formatRating(num);
    if (String(c).trim()) return String(c);
  }
  return 'N/A';
}

function getMovieImage(m) {
  if (!m || !m.images) return null;
  const raw =
    (m.images.poster && (m.images.poster.full || m.images.poster.thumb)) ||
    (m.images.fanart && (m.images.fanart.full || m.images.fanart.thumb)) ||
    (m.images.banner && (m.images.banner.full || m.images.banner.thumb)) ||
    (m.images.screenshot && (m.images.screenshot.full || m.images.screenshot.thumb));
  return raw ? String(raw).replace(/^http:\/\//i, 'https://') : null;
}

function mapMovie(movie, genreMap = {}) {
  const genreNames = (movie.genre_ids || []).map(id => genreMap[id]).filter(Boolean);
  return {
    title: movie.title || movie.name || 'Untitled',
    genre: genreNames.length ? genreNames.slice(0, 3).join(', ') : 'Movie',
    year: movie.release_date ? movie.release_date.slice(0, 4) : 'N/A',
    rating: movie.vote_average ? `${movie.vote_average.toFixed(1)}/10` : 'N/A',
    description: movie.overview || 'No summary available.',
    link: `https://www.themoviedb.org/movie/${movie.id}`
  };
}

async function fetchExternalMovies() {
  // Try server-side proxy first (avoids CORS issues)
  try {
    const proxyRes = await fetch(`/api/trakt/movies/trending?limit=80`);
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      return (data || []).map(entry => {
        const m = entry.movie || entry;
        return {
          title: m.title || "Untitled",
          genre: (m.genres || []).slice(0, 3).join(", ") || "Movie",
          year: m.year || "N/A",
          rating: getRatingFromMovie(m),
          description: sanitizeText(m.overview || m.synopsis || m.description) || "No summary available.",
          image: getMovieImage(m),
          link: m.ids && m.ids.slug ? `https://trakt.tv/movies/${m.ids.slug}` : (m.ids && m.ids.tmdb ? `https://www.themoviedb.org/movie/${m.ids.tmdb}` : "#")
        };
      });
    } else {
      const errText = await proxyRes.text().catch(() => '');
      lastLiveError = `Proxy ${proxyRes.status} ${errText}`;
    }
  } catch (err) {
    lastLiveError = err.message || String(err);
  }

  // Optional: fall back to TMDb if API key is present
  if (TMDB_API_KEY) {
    try {
      const genreMap = await fetchTmdbGenres();
      const data = await fetchJson(`${TMDB_BASE}/trending/movie/week?api_key=${TMDB_API_KEY}`);
      return (data.results || []).slice(0, 80).map(movie => mapMovie(movie, genreMap));
    } catch (error) {
      console.warn("Unable to fetch live movie data from TMDb.", error);
      lastLiveError = error.message || String(error);
      return null;
    }
  }

  // No external movie provider available
  return null;
}

async function fetchExternalAnime() {
  // Try the new Kitsu provider first
  try {
    const data = await fetchJson('/api/anime/trending?limit=80');
    if (data && Array.isArray(data.data) && data.data.length) {
      return data.data.map(entry => {
        const attributes = entry.attributes || {};
        const rawImage = attributes.posterImage && (attributes.posterImage.large || attributes.posterImage.medium || attributes.posterImage.small) || attributes.coverImage && attributes.coverImage.original || null;
        const image = rawImage ? String(rawImage).replace(/^http:\/\//i, 'https://') : null;
        return {
          title: attributes.titles?.en_jp || attributes.titles?.en || attributes.canonicalTitle || 'Untitled',
          genre: attributes.showType || 'Anime',
          studio: attributes.subtype || 'Unknown',
          synopsis: sanitizeText(attributes.synopsis) || 'No summary available.',
          image: image,
          rating: formatRating(attributes.averageRating),
          link: attributes.slug ? `https://kitsu.io/anime/${attributes.slug}` : `https://kitsu.io/anime/${entry.id}`
        };
      });
    }
  } catch (error) {
    console.warn('Unable to fetch live anime data from Kitsu.', error);
    lastLiveError = error.message || String(error);
  }

  // Fallback to Jikan if Kitsu is unavailable
  try {
    const data = await fetchJson('/api/jikan/top/anime?limit=80');
    return (data || []).map(anime => {
      const rawImage = (anime.images && ((anime.images.jpg && (anime.images.jpg.large_image_url || anime.images.jpg.image_url)) || (anime.images.jpg && anime.images.jpg.image_url))) || anime.image_url || null;
      const image = rawImage ? String(rawImage).replace(/^http:\/\//i, 'https://') : null;
      return {
        title: anime.title,
        genre: (anime.genres || []).slice(0, 3).map(g => g.name).join(', ') || 'Anime',
        studio: (anime.studios || []).map(s => s.name).join(', ') || 'Unknown',
        synopsis: sanitizeText(anime.synopsis || (anime.synopsis && anime.synopsis.text) || '' ) || 'No summary available.',
        image: image,
        rating: anime.score ? `${anime.score.toFixed(1)}/10` : 'N/A',
        link: anime.url || (anime.website || '#')
      };
    });
  } catch (error) {
    console.warn('Unable to fetch live anime data from Jikan.', error);
    lastLiveError = error.message || String(error);
    return null;
  }
}

async function fetchExternalTVShows() {
  try {
    const shows = await fetchJson('/api/tvmaze/shows');
    return (shows || []).slice(0, 120).map(show => {
      const rawImage = show.image && (show.image.medium || show.image.original) || null;
      const image = rawImage ? String(rawImage).replace(/^http:\/\//i, 'https://') : null;
      return {
        title: show.name,
        genre: (show.genres || []).join(', ') || 'TV',
        seasons: show.status || 'N/A',
        synopsis: sanitizeText(show.summary || show.summary_text || '' ) || 'No summary available.',
        image: image,
        link: show.url || (show._links && show._links.self && show._links.self.href) || '#'
      };
    });
  } catch (error) {
    console.warn('Unable to fetch live TV show data from TVmaze.', error);
    lastLiveError = error.message || String(error);
    return null;
  }
}

async function loadLocalData() {
  try {
    const response = await fetch("data.json");
    if (!response.ok) {
      throw new Error("Could not load local data.json");
    }
    return await response.json();
  } catch (error) {
    console.warn("Local data.json unavailable.", error);
    return dataFallback;
  }
}

async function loadLiveData(key) {
  if (key === "movies") {
    return await fetchExternalMovies();
  }
  if (key === "anime") {
    return await fetchExternalAnime();
  }
  if (key === "tvShows") {
    return await fetchExternalTVShows();
  }
  return null;
}

function renderItems(items, type) {
  if (!Array.isArray(items) || !items.length) {
    contentContainer.innerHTML = "<p class='error'>No content available yet.</p>";
    return;
  }

  contentContainer.innerHTML = "";

  items.forEach(item => {
    const imgSrc = item.image || '/assets/placeholder.svg';
    const imgHtml = `<img src="${imgSrc}" alt="${item.title}" loading="lazy" onerror="this.onerror=null;this.src='/assets/placeholder.svg'">`;
    let html = `
      <section class="item">
        ${imgHtml}
        <div style="flex:1">
          <h2>${item.title}</h2>
          <p><strong>Genre:</strong> ${item.genre}</p>
    `;

    if (type === "movies") {
      html += `
        <p><strong>Year:</strong> ${item.year}</p>
        <p><strong>Rating:</strong> ${item.rating}</p>
        <p style="margin-top:8px">${item.description || 'No summary available.'}</p>
      `;
    } else if (type === "anime") {
      html += `
        <p><strong>Rating:</strong> ${item.rating || 'N/A'}</p>
        <p style="margin-top:8px">${item.synopsis || 'No summary available.'}</p>
      `;
    } else if (type === "tvShows") {
      html += `
        <p><strong>Status:</strong> ${item.seasons || 'N/A'}</p>
        <p style="margin-top:8px">${item.synopsis || 'No summary available.'}</p>
      `;
    }

    html += `
        </div>
      </section>`;

    const el = createElementFromHTML(html);
    el.addEventListener('click', () => showDetailModal(item, type));
    contentContainer.appendChild(el);
  });
}

function showDetailModal(item, type) {
  const existing = document.getElementById('detail-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'detail-modal';
  overlay.style.position = 'fixed';
  overlay.style.left = 0;
  overlay.style.top = 0;
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.background = 'rgba(0,0,0,0.6)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = 10000;

  const card = document.createElement('div');
  card.className = 'card';

  card.innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      <div class="left"><img src="${item.image || '/assets/placeholder.svg'}" alt="${item.title}" onerror="this.onerror=null;this.src='/assets/placeholder.svg'"></div>
      <div style="flex:1;min-width:200px">
        <h2 style="margin-top:0">${item.title}</h2>
        <p class="meta"><strong>Genre:</strong> ${item.genre}</p>
        ${type === 'movies' ? `<p class="meta"><strong>Year:</strong> ${item.year}</p><p class="meta"><strong>Rating:</strong> ${item.rating || 'N/A'}</p>` : ''}
        <p style="margin-top:8px">${item.description || item.synopsis || 'No summary available.'}</p>
        <p style="margin-top:10px"><a href="${item.link || '#'}" target="_blank" rel="noopener">More on external site</a></p>
      </div>
    </div>
    <div style="text-align:right;margin-top:12px">
      <button id="detail-close" class="close-btn">Close</button>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  document.getElementById('detail-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function createElementFromHTML(html) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstChild;
}

function applySearchFilter(value) {
  const search = value.trim().toLowerCase();
  if (!search) {
    filteredItems = currentItems;
  } else {
    filteredItems = currentItems.filter(item => {
      return [item.title, item.genre, item.studio, item.seasons, item.description, item.synopsis]
        .filter(Boolean)
        .some(field => field.toLowerCase().includes(search));
    });
  }
  renderItems(filteredItems, pageKey);
}

function attachSearch() {
  const searchInput = document.getElementById("search");
  if (!searchInput) return;
  searchInput.addEventListener("input", (event) => {
    applySearchFilter(event.target.value);
  });
}

async function init() {
  if (!contentContainer || !pageKey) return;
  setStatus("Loading local content...");
  const localData = await loadLocalData();
  currentItems = localData[pageKey] || dataFallback[pageKey] || [];
  filteredItems = currentItems;
  renderItems(filteredItems, pageKey);
  setStatus("Local content loaded. Fetching live updates...");
    attachSearch();

    // Check proxy status before attempting live fetches
    const proxy = await checkProxyStatus();

  const liveItems = await loadLiveData(pageKey);
  if (liveItems && liveItems.length) {
    currentItems = liveItems;
    filteredItems = currentItems;
    renderItems(filteredItems, pageKey);
    setStatus("Live content loaded from trusted sources.");
  } else if (pageKey === "movies" && proxy && proxy.traktConfigured === false) {
    setStatus("Local movie data is shown because the server Trakt proxy is not configured.");
  } else {
    const err = lastLiveError ? ` Live error: ${lastLiveError}` : "";
    setStatus(`Showing local content. Live updates failed or are unavailable.${err}`, true);
  }
}

init();
