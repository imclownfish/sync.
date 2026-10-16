/* Personal progress and ratings stay inside the existing synced watchlist. */
(() => {
  const STORE = "sync.watchlist.v2";
  const read = () => { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch { return []; } };
  const write = items => {
    localStorage.setItem(STORE, JSON.stringify(items));
    window.syncAccount?.saveList(items);
    window.dispatchEvent(new CustomEvent("sync:watchlist", { detail: items }));
  };
  const update = (id, changes) => write(read().map(item => item.id === Number(id) ? { ...item, ...changes } : item));
  const itemForTitle = title => read().find(item => item.title === title);
  const episodeLabel = item => item.episodes ? `${item.progress || 0} / ${item.episodes} episodes` : `${item.progress || 0} episodes watched`;

  document.head.insertAdjacentHTML("beforeend", `<style>
    .personal-progress{display:grid;gap:.8rem;margin-top:1.15rem;padding:1rem;border:1px solid rgba(216,255,94,.24);border-radius:12px;background:rgba(216,255,94,.045)}
    .personal-progress h3{margin:0!important;font-size:.78rem!important;color:var(--lime);letter-spacing:.1em;text-transform:uppercase}.progress-row{display:flex;align-items:center;gap:.65rem;flex-wrap:wrap}.progress-row strong{font-size:.82rem;min-width:132px}.progress-step{display:inline-grid;place-items:center;width:2rem;height:2rem;border:1px solid var(--line);border-radius:50%;color:var(--text);background:#222735;font:inherit;font-weight:800}.progress-step:hover{border-color:var(--lime);color:var(--lime)}.rating-row{display:flex;align-items:center;gap:.65rem;color:var(--muted);font-size:.76rem}.rating-row input{accent-color:var(--lime);width:min(190px,45vw)}.rating-row output{color:var(--text);font-weight:800;min-width:2.8rem}.watch-progress{grid-column:2/4;display:flex;align-items:center;gap:.55rem;flex-wrap:wrap;margin-top:-.2rem}.watch-progress .track{width:140px;height:5px;overflow:hidden;border-radius:99px;background:#2a2e3a}.watch-progress .track i{display:block;height:100%;border-radius:inherit;background:var(--lime)}.watch-progress small{color:var(--muted);font-size:.7rem}.watch-progress .progress-step{width:1.65rem;height:1.65rem;font-size:.85rem}@media(max-width:620px){.watch-progress{grid-column:2/4}.watch-progress .track{width:95px}}
  </style>`);

  function detailEnhancement() {
    const dialog = document.querySelector("#detail-dialog");
    const article = dialog?.querySelector(".detail-rich");
    const title = article?.querySelector(".detail-hero h2")?.textContent?.trim();
    const item = itemForTitle(title);
    if (!article || !item || article.querySelector(".personal-progress")) return;
    const host = article.querySelector(".status-picker") || article.querySelector(".save-detail")?.parentElement;
    if (!host) return;
    const card = document.createElement("section");
    card.className = "personal-progress";
    card.innerHTML = `<h3>Your progress</h3><div class="progress-row"><button class="progress-step" data-progress-change="-1" data-progress-id="${item.id}" type="button" aria-label="One less watched episode">−</button><strong>${episodeLabel(item)}</strong><button class="progress-step" data-progress-change="1" data-progress-id="${item.id}" type="button" aria-label="One more watched episode">+</button></div><label class="rating-row">Your rating <input data-rating-id="${item.id}" type="range" min="0" max="10" step="0.5" value="${item.personalRating || 0}"><output>${item.personalRating ? `${item.personalRating}/10` : "Not rated"}</output></label>`;
    host.after(card);
  }

  function listEnhancement() {
    document.querySelectorAll(".watch-row").forEach(row => {
      if (row.querySelector(".watch-progress")) return;
      const id = row.querySelector("[data-status]")?.dataset.status;
      const item = read().find(entry => entry.id === Number(id));
      if (!item) return;
      const total = Number(item.episodes) || 0, progress = Math.min(Number(item.progress) || 0, total || Number.MAX_SAFE_INTEGER);
      const percent = total ? Math.round((progress / total) * 100) : 0;
      const ui = document.createElement("div");
      ui.className = "watch-progress";
      ui.innerHTML = `<button class="progress-step" data-progress-change="-1" data-progress-id="${item.id}" type="button">−</button><div class="track" aria-label="${episodeLabel(item)}"><i style="width:${percent}%"></i></div><small>${episodeLabel(item)}</small><button class="progress-step" data-progress-change="1" data-progress-id="${item.id}" type="button">+</button>${item.personalRating ? `<small>★ ${item.personalRating}</small>` : ""}`;
      row.append(ui);
    });
  }

  function refresh() { detailEnhancement(); listEnhancement(); }
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-progress-change]");
    if (!button) return;
    const item = read().find(entry => entry.id === Number(button.dataset.progressId));
    if (!item) return;
    const ceiling = Number(item.episodes) || Number.MAX_SAFE_INTEGER;
    const progress = Math.max(0, Math.min(ceiling, (Number(item.progress) || 0) + Number(button.dataset.progressChange)));
    const status = item.episodes && progress >= item.episodes ? "Completed" : progress > 0 && item.status === "Planned" ? "Watching" : item.status;
    const changes = { progress, status };
    update(item.id, changes);
    const label = button.parentElement?.querySelector("strong");
    if (label) label.textContent = episodeLabel({ ...item, ...changes });
    const listLabel = button.parentElement?.querySelector("small");
    if (listLabel) listLabel.textContent = episodeLabel({ ...item, ...changes });
    const fill = button.parentElement?.querySelector(".track i");
    if (fill && item.episodes) fill.style.width = `${Math.round((progress / item.episodes) * 100)}%`;
  });
  document.addEventListener("input", event => {
    const input = event.target.closest("[data-rating-id]");
    if (!input) return;
    const value = Number(input.value) || null;
    update(input.dataset.ratingId, { personalRating: value });
    const output = input.parentElement.querySelector("output");
    if (output) output.textContent = value ? `${value}/10` : "Not rated";
  });
  window.addEventListener("sync:watchlist", () => {
    document.querySelectorAll(".personal-progress,.watch-progress").forEach(node => node.remove());
    setTimeout(refresh, 0);
  });
  new MutationObserver(() => requestAnimationFrame(refresh)).observe(document.body, { childList:true, subtree:true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh); else refresh();
})();
