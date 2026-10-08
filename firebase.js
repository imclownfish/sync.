import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="auth.css?v=1">');

const firebaseConfig = {
  apiKey: "AIzaSyAx0rbsgK71_lMcGhm34LzwuZ4u7Aa1unY",
  authDomain: "pls-sync.firebaseapp.com",
  projectId: "pls-sync",
  storageBucket: "pls-sync.firebasestorage.app",
  messagingSenderId: "255520177901",
  appId: "1:255520177901:web:c9b8ca79f7ba6a5bb956e4",
  measurementId: "G-9MZCEVX9MM"
};

const STORE = "sync.watchlist.v2";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
let user = null;
let saveTimer = null;

function getLocalList() {
  try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch { return []; }
}

function setLocalList(items) {
  const list = Array.isArray(items) ? items : [];
  localStorage.setItem(STORE, JSON.stringify(list));
  const count = document.querySelector("#list-count");
  if (count) count.textContent = list.length;
  window.dispatchEvent(new CustomEvent("sync:watchlist", { detail: list }));
}

function mergeLists(remote, local) {
  const byId = new Map((Array.isArray(remote) ? remote : []).map(item => [item.id, item]));
  (Array.isArray(local) ? local : []).forEach(item => byId.set(item.id, item));
  return [...byId.values()];
}

function accountButton() {
  return document.querySelector("#account-button");
}

function renderAccount() {
  if (!accountButton()) {
    const header = document.querySelector(".topbar");
    if (!header) return;
    header.insertAdjacentHTML("beforeend", '<button id="account-button" class="account-button" type="button">Sign in</button>');
  }
  const button = accountButton();
  if (!button) return;
  if (!user) {
    button.classList.remove("is-signed-in");
    button.textContent = "Sign in";
    button.title = "Sign in with Google";
    return;
  }
  const initial = (user.displayName || user.email || "?").trim().charAt(0).toUpperCase();
  const name = (user.displayName || "Account").split(" ")[0];
  button.classList.add("is-signed-in");
  button.innerHTML = `<span class="account-initial">${initial}</span><span>${name}</span><small>Sign out</small>`;
  button.title = `Signed in as ${user.email}. Click to sign out.`;
}

async function saveRemote(items) {
  if (!user) return;
  await setDoc(doc(db, "users", user.uid), { watchlist: items, updatedAt: serverTimestamp() }, { merge: true });
}

window.syncAccount = {
  saveList(items) {
    if (!user) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveRemote(items).catch(error => console.warn("Could not sync your list.", error));
    }, 350);
  },
  signedIn: () => Boolean(user)
};

document.addEventListener("click", async event => {
  const button = event.target.closest("#account-button");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  button.disabled = true;
  button.textContent = user ? "Signing out…" : "Opening Google…";
  try {
    if (user) await signOut(auth);
    else await signInWithPopup(auth, provider);
  } catch (error) {
    console.warn("Google sign-in was not completed.", error);
    alert("Sign-in did not finish. Check that this site is listed in Firebase's authorized domains, then try again.");
  } finally {
    button.disabled = false;
    renderAccount();
  }
});

onAuthStateChanged(auth, async nextUser => {
  user = nextUser;
  renderAccount();
  if (!user) return;
  try {
    const userRef = doc(db, "users", user.uid);
    const remote = (await getDoc(userRef)).data()?.watchlist || [];
    const combined = mergeLists(remote, getLocalList());
    setLocalList(combined);
    await saveRemote(combined);
  } catch (error) {
    console.warn("Account is signed in, but list sync is unavailable.", error);
  }
});

renderAccount();
