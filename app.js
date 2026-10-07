const API = "https://graphql.anilist.co";
const STORE = "sync.watchlist.v2";
const genres = ["All", "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Romance", "Sci-Fi"];
const states = ["All", "Watching", "Planned", "Completed", "Dropped"];
const CARD_FIELDS = `id idMal title { userPreferred english romaji native } coverImage { large medium color } averageScore popularity seasonYear season format episodes genres description(asHtml: false) siteUrl studios(isMain: true) { nodes { name } }`;
const $ = (selector) => document.querySelector(selector);
const grid = $("#trending-grid"), watchlistEl = $("#watchlist"), searchDialog = $("#search-dialog"), detailDialog = $("#detail-dialog");
let trending = [], selectedGenre = "All", selectedState = "All", searchTimer, memoryList = [];

function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
function titleOf(anime) { return anime?.title?.userPreferred || anime?.title?.english || anime?.title?.romaji || anime?.title || "Untitled"; }
function imageOf(anime) { return anime?.coverImage?.large || anime?.coverImage?.medium || anime?.image || "placeholder.svg"; }
function genreNames(anime) { return (anime.genres || anime.genre?.split(" · ") || []).slice(0, 2).join(" · ") || "Anime"; }
function yearOf(anime) { return anime?.seasonYear || anime?.year || "TBA"; }
function scoreOf(anime) { return Number.isFinite(anime?.averageScore) ? `${anime.averageScore}%` : "—"; }
function cleanDescription(value = "") { return String(value).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim(); }
function studioOf(anime) { return anime?.studios?.nodes?.map(studio => studio.name).join(", ") || anime?.studio || "Studio not listed"; }
function getList() { try { return JSON.parse(localStorage.getItem(STORE)) || memoryList; } catch { return memoryList; } }
function saveList(list) { memoryList = list; try { localStorage.setItem(STORE, JSON.stringify(list)); } catch { /* keeps working for this visit when storage is restricted */ } updateListCount(); }
function updateListCount() { $("#list-count").textContent = getList().length; }
function isSaved(id) { return getList().some(item => item.id === id); }

async function graphQL(query, variables = {}) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ query, variables }), signal: controller.signal });
    if (!response.ok) throw new Error(`AniList responded ${response.status}`);
    const payload = await response.json();
    if (payload.errors?.length) throw new Error(payload.errors[0].message || "AniList returned an error");
    return payload.data;
  } finally { clearTimeout(timeout); }
}
function renderGenres() { $("#genre-filters").innerHTML = genres.map(genre => `<button class="filter ${genre === selectedGenre ? "selected" : ""}" data-genre="${genre}" type="button">${genre}</button>`).join(""); }
function renderStateTabs() { $("#list-tabs").innerHTML = states.map(state => `<button class="status-tab ${state === selectedState ? "selected" : ""}" data-state="${state}" type="button">${state}</button>`).join(""); }
function card(anime) { return `<button class="anime-card" data-id="${anime.id}" type="button" aria-label="Open ${escapeHtml(titleOf(anime))}"><img class="poster" src="${escapeHtml(imageOf(anime))}" alt="${escapeHtml(titleOf(anime))} cover" loading="lazy" /><span class="score">${scoreOf(anime)}</span><div class="card-copy"><h3>${escapeHtml(titleOf(anime))}</h3><p>${escapeHtml(genreNames(anime))}</p><p class="year">${yearOf(anime)}</p></div></button>`; }
function renderTrending() { const visible = selectedGenre === "All" ? trending : trending.filter(anime => anime.genres?.includes(selectedGenre)); grid.innerHTML = visible.length ? visible.map(card).join("") : `<p class="empty">No current picks for this genre. Try another filter.</p>`; }
function showCatalogError() { grid.innerHTML = `<div class="error"><strong>Couldn’t load the anime catalog.</strong><br />Check your connection, then use “Refresh picks” to try AniList again.</div>`; }
function renderWatchlist() {
  const list = getList().filter(item => selectedState === "All" || item.status === selectedState);
  if (!list.length) { watchlistEl.innerHTML = `<div class="empty"><strong>${selectedState === "All" ? "Your list is empty." : `No ${selectedState.toLowerCase()} anime.`}</strong>Save something from Discover and it will appear here.</div>`; return; }
  watchlistEl.innerHTML = list.map(item => `<article class="watch-row"><img src="${escapeHtml(item.image)}" alt="" /><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.genre)} · ${item.episodes || "?"} eps</p></div><select class="watch-select" data-status="${item.id}" aria-label="Status for ${escapeHtml(item.title)}">${states.slice(1).map(state => `<option ${item.status === state ? "selected" : ""}>${state}</option>`).join("")}</select><button class="remove" data-remove="${item.id}" type="button" aria-label="Remove ${escapeHtml(item.title)}">Remove</button></article>`).join("");
}
function loading(message) { grid.innerHTML = `<p class="loading">${message}</p>`; }
async function fetchTrending() {
  loading("Loading real-time picks from AniList...");
  try { const data = await graphQL(`query { Page(perPage: 30) { media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { ${CARD_FIELDS} } } }`); trending = data.Page.media; renderTrending(); } catch { showCatalogError(); }
}
async function getDetail(id) {
  const known = trending.find(item => item.id === Number(id));
  if (known?.description) return known;
  const data = await graphQL(`query ($id: Int) { Media(id: $id, type: ANIME) { ${CARD_FIELDS} } }`, { id: Number(id) });
  return data.Media;
}
async function openDetail(id) {
  detailDialog.innerHTML = `<div class="loading">Loading real AniList details...</div>`; if (!detailDialog.open) detailDialog.showModal();
  try {
    const anime = await getDetail(id), saved = isSaved(anime.id);
    const extra = [anime.format, anime.episodes ? `${anime.episodes} eps` : "Episode count TBA", anime.season ? anime.season.toLowerCase() : null].filter(Boolean).join(" · ");
    detailDialog.innerHTML = `<article class="detail"><img class="detail-poster" src="${escapeHtml(imageOf(anime))}" alt="${escapeHtml(titleOf(anime))} cover" /><div class="detail-copy"><div class="detail-top"><p class="eyebrow">${escapeHtml(extra)}</p><button class="close-detail" type="button" aria-label="Close">×</button></div><h2>${escapeHtml(titleOf(anime))}</h2><p class="detail-meta">AniList score ${scoreOf(anime)} &nbsp; ${yearOf(anime)} &nbsp; ${anime.popularity?.toLocaleString() || "—"} followers</p><p class="detail-description">${escapeHtml(cleanDescription(anime.description) || "AniList has not added a description for this title yet.")}</p><p class="detail-studio"><strong>Studio</strong> ${escapeHtml(studioOf(anime))}</p><div class="tag-list">${(anime.genres || []).slice(0, 5).map(genre => `<span class="tag">${escapeHtml(genre)}</span>`).join("")}</div><div class="detail-actions"><button class="button primary save-detail" type="button">${saved ? "In my list" : "Add to my list"}</button><a class="button ghost external" href="${escapeHtml(anime.siteUrl)}" target="_blank" rel="noopener">Open AniList</a></div></div></article>`;
    detailDialog.querySelector(".close-detail").addEventListener("click", () => detailDialog.close());
    detailDialog.querySelector(".save-detail").addEventListener("click", event => { addToList(anime); event.currentTarget.textContent = "In my list"; });
  } catch { detailDialog.innerHTML = `<div class="error">Couldn’t load this anime’s details. Try again in a moment.</div>`; }
}
function addToList(anime) { if (isSaved(anime.id)) return; const list = getList(); list.unshift({ id: anime.id, title: titleOf(anime), image: imageOf(anime), genre: genreNames(anime), episodes: anime.episodes, status: "Planned" }); saveList(list); renderWatchlist(); }
function openSearch() { if (!searchDialog.open) searchDialog.showModal(); $("#search-input").focus(); }
async function search(query) {
  const target = $("#search-results"); if (query.length < 2) { target.innerHTML = ""; return; }
  target.innerHTML = `<p class="search-hint">Searching AniList...</p>`;
  try { const data = await graphQL(`query ($search: String) { Page(perPage: 10) { media(search: $search, type: ANIME, isAdult: false) { ${CARD_FIELDS} } } }`, { search: query }); const results = data.Page.media; target.innerHTML = results.map(anime => `<button class="result" type="button" data-search-id="${anime.id}"><img src="${escapeHtml(imageOf(anime))}" alt="" /><span><strong>${escapeHtml(titleOf(anime))}</strong><span>${escapeHtml(genreNames(anime))}</span></span><span>${scoreOf(anime)}</span></button>`).join("") || `<p class="search-hint">No anime found.</p>`; } catch { target.innerHTML = `<p class="search-hint">AniList search is unavailable right now. Try again in a moment.</p>`; }
}
$("#open-search").addEventListener("click", openSearch); $("#hero-search").addEventListener("click", openSearch); $("#refresh").addEventListener("click", fetchTrending);
$("#genre-filters").addEventListener("click", event => { const genre = event.target.dataset.genre; if (!genre) return; selectedGenre = genre; renderGenres(); renderTrending(); });
$("#list-tabs").addEventListener("click", event => { const state = event.target.dataset.state; if (!state) return; selectedState = state; renderStateTabs(); renderWatchlist(); });
grid.addEventListener("click", event => { const cardEl = event.target.closest(".anime-card"); if (cardEl) openDetail(cardEl.dataset.id); });
watchlistEl.addEventListener("change", event => { const id = Number(event.target.dataset.status); if (!id) return; saveList(getList().map(item => item.id === id ? { ...item, status: event.target.value } : item)); renderWatchlist(); });
watchlistEl.addEventListener("click", event => { const id = Number(event.target.dataset.remove); if (!id) return; saveList(getList().filter(item => item.id !== id)); renderWatchlist(); });
$("#search-input").addEventListener("input", event => { clearTimeout(searchTimer); searchTimer = setTimeout(() => search(event.target.value.trim()), 300); });
$("#search-results").addEventListener("click", event => { const result = event.target.closest("[data-search-id]"); if (!result) return; searchDialog.close(); openDetail(result.dataset.searchId); });
document.addEventListener("keydown", event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openSearch(); } });
detailDialog.addEventListener("click", event => { if (event.target === detailDialog) detailDialog.close(); });
renderGenres(); renderStateTabs(); updateListCount(); renderWatchlist(); fetchTrending();
