const detailDialog = document.querySelector("#detail-dialog");
const VISIBILITY_KEY = "sync.visibility.v1";

document.head.insertAdjacentHTML("beforeend", '<style>body.detail-open{overflow:hidden;height:100vh}.status-picker{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:1rem}.status-choice{border:1px solid var(--line);border-radius:999px;padding:.52rem .75rem;color:var(--text);background:#242937;font:inherit;font-size:.75rem;font-weight:750}.status-choice:hover,.status-choice.selected{color:#161909;background:var(--lime);border-color:var(--lime)}</style>');

function visibilitySettings(){try{return{Planned:false,Watching:false,Completed:false,...JSON.parse(localStorage.getItem(VISIBILITY_KEY))}}catch{return{Planned:false,Watching:false,Completed:false}}}
function visibleCards(){const settings=visibilitySettings(),items=typeof saved==="function"?saved():[];document.querySelectorAll(".anime-card[data-id]").forEach(card=>{const item=items.find(entry=>String(entry.id)===card.dataset.id);card.hidden=Boolean(item&&settings[item.status])})}
function lockDetailScroll(){document.body.classList.toggle("detail-open",Boolean(detailDialog?.open))}
function statusPicker(){const button=detailDialog?.querySelector(".save-detail");if(!button||detailDialog.querySelector(".status-picker"))return;const picker=document.createElement("div");picker.className="status-picker";picker.innerHTML='<button class="status-choice" data-list-status="Planned" type="button">Planning to watch</button><button class="status-choice" data-list-status="Watching" type="button">In progress</button><button class="status-choice" data-list-status="Completed" type="button">Completed</button>';button.after(picker);updatePicker();}
function updatePicker(){const heading=detailDialog?.querySelector(".detail-hero h2")?.textContent?.trim(),item=(typeof saved==="function"?saved():[]).find(entry=>entry.title===heading);detailDialog?.querySelectorAll(".status-choice").forEach(choice=>choice.classList.toggle("selected",choice.dataset.listStatus===item?.status))}
function setDetailStatus(status){const heading=detailDialog?.querySelector(".detail-hero h2")?.textContent?.trim(),items=typeof saved==="function"?saved():[],match=items.find(item=>item.title===heading);if(!match)return;save(items.map(item=>item.id===match.id?{...item,status}:item));updatePicker();visibleCards();}

detailDialog?.addEventListener("click",event=>{if(event.target.closest(".save-detail"))setTimeout(statusPicker,0);const choice=event.target.closest("[data-list-status]");if(choice){event.preventDefault();event.stopPropagation();setDetailStatus(choice.dataset.listStatus)}},true);
detailDialog?.addEventListener("close",lockDetailScroll);
new MutationObserver(()=>{lockDetailScroll();visibleCards();}).observe(document.body,{childList:true,subtree:true});
window.addEventListener("sync:watchlist",visibleCards);window.addEventListener("sync:settings",visibleCards);lockDetailScroll();visibleCards();
