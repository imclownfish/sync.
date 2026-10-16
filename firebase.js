import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="auth.css?v=2">');

const firebaseConfig = {
  apiKey: "AIzaSyAx0rbsgK71_lMcGhm34LzwuZ4u7Aa1unY",
  authDomain: "pls-sync.firebaseapp.com",
  projectId: "pls-sync",
  storageBucket: "pls-sync.firebasestorage.app",
  messagingSenderId: "255520177901",
  appId: "1:255520177901:web:c9b8ca79f7ba6a5bb956e4",
  measurementId: "G-9MZCEVX9MM"
};

const STORE = "sync.watchlist.v2", SETTINGS = "sync.visibility.v1";
const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app), provider = new GoogleAuthProvider();
let user = null, saveTimer = null;
const getLocalList = () => { try { return (JSON.parse(localStorage.getItem(STORE)) || []).map(item => item.status === "Dropped" ? { ...item, status: "Planned" } : item); } catch { return []; } };
function setLocalList(items) { const list = Array.isArray(items) ? items : []; localStorage.setItem(STORE, JSON.stringify(list)); document.querySelectorAll("#list-count").forEach(count => count.textContent = list.length); window.dispatchEvent(new CustomEvent("sync:watchlist", { detail: list })); }
const getSettings = () => { try { return { Planned:false, Watching:false, Completed:false, ...JSON.parse(localStorage.getItem(SETTINGS)) }; } catch { return { Planned:false, Watching:false, Completed:false }; } };
function saveSettings(settings) { localStorage.setItem(SETTINGS, JSON.stringify(settings)); window.dispatchEvent(new CustomEvent("sync:settings", { detail: settings })); }
function mergeLists(remote, local) { const byId = new Map((Array.isArray(remote) ? remote : []).map(item => [item.id, item])); (Array.isArray(local) ? local : []).forEach(item => byId.set(item.id, item)); return [...byId.values()]; }
const accountButton = () => document.querySelector("#account-button");

function ensureDialog(id) { let dialog = document.querySelector(`#${id}`); if (!dialog) { dialog = document.createElement("dialog"); dialog.id = id; dialog.className = "account-dialog"; document.body.appendChild(dialog); } return dialog; }
function stats() { const list = getLocalList(); return { total:list.length, Planned:list.filter(item => item.status === "Planned").length, Watching:list.filter(item => item.status === "Watching").length, Completed:list.filter(item => item.status === "Completed").length }; }
function showAccountMenu() { const dialog = ensureDialog("account-menu"), data = stats(); dialog.innerHTML = `<button class="dialog-close" aria-label="Close account menu">×</button><p class="eyebrow">YOUR ACCOUNT</p><h2>${user?.displayName || "Account"}</h2><p class="dialog-muted">${user?.email || ""}</p><div class="account-stats"><span><b>${data.total}</b> Total</span><span><b>${data.Planned}</b> Planned</span><span><b>${data.Watching}</b> In progress</span><span><b>${data.Completed}</b> Completed</span></div><button class="dialog-secondary" id="account-settings" type="button">Settings</button><button class="dialog-danger" id="confirm-sign-out" type="button">Sign out</button>`; dialog.querySelector(".dialog-close").onclick = () => dialog.close(); dialog.querySelector("#account-settings").onclick = () => { dialog.close(); showSettings(); }; dialog.querySelector("#confirm-sign-out").onclick = async () => { if (!confirm("Sign out of sync.? Your saved list will remain safely in your account.")) return; await signOut(auth); dialog.close(); }; if (!dialog.open) dialog.showModal(); }
function showSettings() { const dialog = ensureDialog("settings-menu"), settings = getSettings(); dialog.innerHTML = `<button class="dialog-close" aria-label="Close settings">×</button><p class="eyebrow">BROWSING SETTINGS</p><h2>Hide saved anime</h2><p class="dialog-muted">Choose what should stay out of Discover and the catalog. Nothing is deleted from My list.</p><div class="settings-options"><label><input type="checkbox" data-status="Planned" ${settings.Planned ? "checked" : ""}> Planning to watch</label><label><input type="checkbox" data-status="Watching" ${settings.Watching ? "checked" : ""}> In progress</label><label><input type="checkbox" data-status="Completed" ${settings.Completed ? "checked" : ""}> Completed</label></div>`; dialog.querySelector(".dialog-close").onclick = () => dialog.close(); dialog.querySelectorAll("input[data-status]").forEach(input => input.onchange = () => saveSettings({ ...getSettings(), [input.dataset.status]: input.checked })); if (!dialog.open) dialog.showModal(); }

function renderAccount() { if (!accountButton()) { const header = document.querySelector(".topbar"); if (!header) return; header.insertAdjacentHTML("beforeend", '<button id="settings-button" class="header-icon-button" type="button" aria-label="Open settings">⚙</button><button id="account-button" class="account-button" type="button">Sign in</button>'); } const button = accountButton(), settingsButton = document.querySelector("#settings-button"); if (settingsButton) settingsButton.onclick = showSettings; if (!button) return; button.onclick = handleAccountClick; if (!user) { button.classList.remove("is-signed-in"); button.textContent = "Sign in"; button.title = "Sign in with Google"; return; } const initial = (user.displayName || user.email || "?").trim().charAt(0).toUpperCase(), name = (user.displayName || "Account").split(" ")[0]; button.classList.add("is-signed-in"); button.innerHTML = `<span class="account-initial">${initial}</span><span>${name}</span>`; button.title = "Open account menu"; }
async function saveRemote(items) { if (user) await setDoc(doc(db, "users", user.uid), { watchlist:items, updatedAt:serverTimestamp() }, { merge:true }); }
window.syncAccount = { saveList(items) { if (!user) return; clearTimeout(saveTimer); saveTimer = setTimeout(() => saveRemote(items).catch(error => console.warn("Could not sync your list.", error)), 350); }, signedIn: () => Boolean(user), getSettings };
setLocalList(getLocalList());
async function handleAccountClick(event) { event.preventDefault(); event.stopImmediatePropagation(); if (user) { showAccountMenu(); return; } const button = event.currentTarget; button.disabled = true; button.textContent = "Opening Google…"; try { await signInWithPopup(auth, provider); } catch (error) { console.warn("Google sign-in was not completed.", error); alert("Sign-in did not finish. Check that this site is listed in Firebase's authorized domains, then try again."); } finally { button.disabled = false; renderAccount(); } }
onAuthStateChanged(auth, async nextUser => { user = nextUser; renderAccount(); if (!user) return; try { const userRef = doc(db, "users", user.uid), remote = (await getDoc(userRef)).data()?.watchlist || [], combined = mergeLists(remote, getLocalList()); setLocalList(combined); await saveRemote(combined); } catch (error) { console.warn("Account is signed in, but list sync is unavailable.", error); } });
renderAccount();
