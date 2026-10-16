let deferredInstall = null;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(error => console.warn("Offline mode could not start.", error)));
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstall = event;
});

function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

window.syncInstall = {
  installed: isInstalled,
  async prompt() {
    if (isInstalled()) return alert("sync. is already installed on this device.");
    if (deferredInstall) {
      deferredInstall.prompt();
      await deferredInstall.userChoice;
      deferredInstall = null;
      return;
    }
    alert("To install sync. on iPhone: open this page in Safari, tap Share, then choose Add to Home Screen. Open it from that new home-screen icon instead of a bookmark.");
  }
};
