const API = "https://api.jikan.moe/v4";
const STORE = "sync.watchlist.v1";
const genres = ["All", "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Romance", "Sci-Fi"];
const states = ["All", "Watching", "Planned", "Completed", "Dropped"];
const fallback = [
  [16498,"Attack on Titan","Action, Drama",8.55,"2013"], [5114,"Fullmetal Alchemist: Brotherhood","Action, Adventure",9.1,"2009"],
  [9253,"Steins;Gate","Drama, Sci-Fi",9.07,"2011"], [38000,"Demon Slayer: Kimetsu no Yaiba","Action, Fantasy",8.46,"2019"],
  [11061,"Hunter x Hunter","Action, Adventure",9.03,"2011"], [21,"One Piece","Action, Adventure",9.22,"1999"]
].map(([mal_id,title,genre,score,year]) => ({ mal_id, title, genres:genre.split(", ").map(name => ({name})), score, year, images:{ jpg:{ large_image_url:"placeholder.svg" } } }));

const $ = (selector) => document.querySelector(selector);
const grid = $("#trending-grid");
const watchlistEl = $("#watchlist");
const searchDialog = $("#search-dialog");
const detailDialog = $("#detail-dialog");
let trending = [];
let selectedGenre = "All";
let selectedState = "All";
let searchTimer;

function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char])); }
function imageOf(anime) { return anime?.images?.jpg?.large_image_url || anime?.images?.jpg?.image_url || "placeholder.svg"; }
function titleOf(anime) { return anime.title_english || anime.title || "Untitled"; }
function genreNames(anime) { return (anime.genres || []).slice(0, 2).map(genre => genre.name).join(" · ") || "Anime"; }
function getList() { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch { return []; } }
function saveList(list) { localStorage.setItem(STORE, JSON.stringify(list)); updateListCount(); }
function updateListCount() { $("#list-count").textContent = getList().length; }
function isSaved(id) { return getList().some(item => item.mal_id === id); }

function renderGenres() { $("#genre-filters").innerHTML = genres.map(genre => `<button class="filter ${genre === selectedGenre ? "selected" : ""}" data-genre="${genre}" type="button">${genre}</button>`).join(""); }
function renderStateTabs() { $("#list-tabs").innerHTML = states.map(state => `<button class="status-tab ${state === selectedState ? "selected" : ""}" data-state="${state}" type="button">${state}</button>`).join(""); }
function card(anime) {
  const score = anime.score ? anime.score.toFixed(1) : "—";
  const year = anime.year || anime.aired?.from?.slice(0, 4) || "TBA";
  return `<button class="anime-card" data-id="${anime.mal_id}" type="button" aria-label="Open ${escapeHtml(titleOf(anime))}">
    <img class="poster" src="${escapeHtml(imageOf(anime))}" alt="" loading="lazy" />
    <span class="score">★ ${score}</span><div class="card-copy"><h3>${escapeHtml(titleOf(anime))}</h3><p>${escapeHtml(genreNames(anime))}</p><p class="year">${year}</p></div></button>`;
}
function renderTrending() {
  const visible = selectedGenre === "All" ? trending : trending.filter(anime => (anime.genres || []).some(genre => genre.name === selectedGenre));
  grid.innerHTML = visible.length ? visible.map(card).join("") : `<p class="empty">Nothing here yet. Try another genre.</p>`;
}
function renderWatchlist() {
  const list = getList().filter(item => selectedState === "All" || item.status === selectedState);
  if (!list.length) { watchlistEl.innerHTML = `<div class="empty"><strong>${selectedState === "All" ? "Your list is empty." : `No ${selectedState.toLowerCase()} anime.`}</strong>Save something from Discover and it will appear here.</div>`; return; }
  watchlistEl.innerHTML = list.map(item => `<article class="watch-row">
    <img src="${escapeHtml(item.image)}" alt="" /><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.genre)} · ${item.episodes || "?"} eps</p></div>
    <select class="watch-select" data-status="${item.mal_id}" aria-label="Status for ${escapeHtml(item.title)}">${states.slice(1).map(state => `<option ${item.status === state ? "selected" : ""}>${state}</option>`).join("")}</select>
    <button class="remove" data-remove="${item.mal_id}" type="button" aria-label="Remove ${escapeHtml(item.title)}">Remove</button></article>`).join("");
}
function loading(message) { grid.innerHTML = `<p class="loading">${message}</p>`; }
async function apiFetch(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try { return await fetch(url, { signal: controller.signal }); } finally { clearTimeout(timeout); }
}
async function fetchTrending() {
  loading("Finding what people are into right now...");
  try {
    const response = await apiFetch(`${API}/top/anime?filter=bypopularity&limit=20`);
    if (!response.ok) throw new Error("Request failed");
    trending = (await response.json()).data || fallback;
  } catch { trending = fallback; }
  renderTrending();
}
async function getDetail(id) {
  const known = [...trending, ...getList()].find(item => item.mal_id === Number(id));
  if (known?.synopsis) return known;
  try { const response = await apiFetch(`${API}/anime/${id}/full`); if (response.ok) return (await response.json()).data; } catch { /* use available card data */ }
  return known || fallback.find(item => item.mal_id === Number(id));
}
async function openDetail(id) {
  detailDialog.innerHTML = `<div class="loading">Loading anime...</div>`; detailDialog.showModal();
  const anime = await getDetail(id); if (!anime) { detailDialog.close(); return; }
  const saved = isSaved(anime.mal_id);
  const type = anime.type || "TV"; const episodes = anime.episodes || "?";
  detailDialog.innerHTML = `<article class="detail"><img class="detail-poster" src="${escapeHtml(imageOf(anime))}" alt="${escapeHtml(titleOf(anime))} poster" />
    <div class="detail-copy"><div class="detail-top"><p class="eyebrow">${escapeHtml(type)} · ${episodes} EPS</p><button class="close-detail" aria-label="Close">×</button></div>
      <h2>${escapeHtml(titleOf(anime))}</h2><p class="detail-meta">★ ${anime.score?.toFixed?.(1) || "—"} &nbsp; ${anime.year || anime.aired?.from?.slice(0,4) || "TBA"}</p>
      <p class="detail-description">${escapeHtml(anime.synopsis || "No synopsis available yet.")}</p>
      <div class="tag-list">${(anime.genres || []).slice(0,5).map(genre => `<span class="tag">${escapeHtml(genre.name)}</span>`).join("")}</div>
      <div class="detail-actions"><button class="button primary save-detail" data-id="${anime.mal_id}" type="button">${saved ? "In my list" : "Add to my list"}</button><a class="button ghost external" href="${escapeHtml(anime.url || `https://myanimelist.net/anime/${anime.mal_id}`)}" target="_blank" rel="noopener">More info</a></div>
    </div></article>`;
  detailDialog.querySelector(".close-detail").addEventListener("click", () => detailDialog.close());
  detailDialog.querySelector(".save-detail").addEventListener("click", event => { addToList(anime); event.currentTarget.textContent = "In my list"; });
}
function addToList(anime) { if (isSaved(anime.mal_id)) return; const list = getList(); list.unshift({ mal_id:anime.mal_id, title:titleOf(anime), image:imageOf(anime), genre:genreNames(anime), episodes:anime.episodes, status:"Planned" }); saveList(list); renderWatchlist(); }
function openSearch() { searchDialog.showModal(); $("#search-input").focus(); }
async function search(query) {
  const target = $("#search-results"); if (query.length < 2) { target.innerHTML = ""; return; }
  target.innerHTML = `<p class="search-hint">Searching...</p>`;
  try { const response = await apiFetch(`${API}/anime?q=${encodeURIComponent(query)}&limit=8&sfw`); if (!response.ok) throw new Error(); const data = (await response.json()).data || [];
    target.innerHTML = data.map(anime => `<button class="result" type="button" data-search-id="${anime.mal_id}"><img src="${escapeHtml(imageOf(anime))}" alt="" /><span><strong>${escapeHtml(titleOf(anime))}</strong><span>${escapeHtml(genreNames(anime))}</span></span><span>${anime.year || ""}</span></button>`).join("") || `<p class="search-hint">No anime found.</p>`;
  } catch { target.innerHTML = `<p class="search-hint">Search is unavailable right now. Try again in a moment.</p>`; }
}

$("#open-search").addEventListener("click", openSearch); $("#hero-search").addEventListener("click", openSearch); $("#refresh").addEventListener("click", fetchTrending);
$("#genre-filters").addEventListener("click", event => { const genre = event.target.dataset.genre; if (!genre) return; selectedGenre = genre; renderGenres(); renderTrending(); });
$("#list-tabs").addEventListener("click", event => { const state = event.target.dataset.state; if (!state) return; selectedState = state; renderStateTabs(); renderWatchlist(); });
grid.addEventListener("click", event => { const cardEl = event.target.closest(".anime-card"); if (cardEl) openDetail(cardEl.dataset.id); });
watchlistEl.addEventListener("change", event => { const id = Number(event.target.dataset.status); if (!id) return; const list = getList().map(item => item.mal_id === id ? {...item,status:event.target.value} : item); saveList(list); renderWatchlist(); });
watchlistEl.addEventListener("click", event => { const id = Number(event.target.dataset.remove); if (!id) return; saveList(getList().filter(item => item.mal_id !== id)); renderWatchlist(); });
$("#search-input").addEventListener("input", event => { clearTimeout(searchTimer); searchTimer = setTimeout(() => search(event.target.value.trim()), 300); });
$("#search-results").addEventListener("click", event => { const result = event.target.closest("[data-search-id]"); if (!result) return; searchDialog.close(); openDetail(result.dataset.searchId); });
document.addEventListener("keydown", event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openSearch(); } });
detailDialog.addEventListener("click", event => { if (event.target === detailDialog) detailDialog.close(); });
renderGenres(); renderStateTabs(); updateListCount(); renderWatchlist(); fetchTrending();
