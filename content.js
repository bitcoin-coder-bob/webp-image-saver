const DONE_VISIBLE_MS = 1500;

let host;
let label;
let spinner;
let cursorStyle;
let hideTimer;
let busyCount = 0;

// Chrome has no event before the context menu opens, so the menu item for an image is picked on hover.
document.addEventListener(
  "mouseover",
  (event) => {
    if (!(event.target instanceof HTMLImageElement) || !chrome.runtime?.id) {
      return;
    }
    const src = event.target.currentSrc || event.target.src;
    if (src) {
      chrome.runtime.sendMessage({ type: "imageHovered", src }).catch(() => {});
    }
  },
  { capture: true, passive: true }
);

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "progress") {
    showProgress(message.state);
  }
});

function showProgress(state) {
  if (state === "busy") {
    busyCount += 1;
    render("Removing background…", true);
    return;
  }

  busyCount = Math.max(0, busyCount - 1);
  if (busyCount > 0) {
    return;
  }
  if (state === "saved") {
    render("Saved", false);
    hideTimer = setTimeout(hide, DONE_VISIBLE_MS);
  } else {
    hide();
  }
}

function render(text, working) {
  clearTimeout(hideTimer);
  if (!host) {
    build();
  }
  label.textContent = text;
  spinner.style.visibility = working ? "visible" : "hidden";
  cursorStyle.textContent = working ? "*{cursor:progress!important}" : "";
}

function build() {
  host = document.createElement("div");
  host.dataset.bgpoofProgress = "";
  host.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:2147483647";
  const style = document.createElement("style");
  style.textContent = `
    .pill { display:flex; align-items:center; gap:8px; padding:8px 13px; border-radius:999px;
            background:#1f2430; color:#fff; box-shadow:0 2px 10px rgba(0,0,0,.35);
            font:13px system-ui, -apple-system, sans-serif; white-space:nowrap; }
    .spinner { width:12px; height:12px; border:2px solid rgba(255,255,255,.35); border-top-color:#fff;
               border-radius:50%; animation:spin .7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }`;
  spinner = document.createElement("span");
  spinner.className = "spinner";
  label = document.createElement("span");
  const pill = document.createElement("div");
  pill.className = "pill";
  pill.append(spinner, label);
  host.attachShadow({ mode: "closed" }).append(style, pill);
  cursorStyle = document.createElement("style");
  document.documentElement.append(host, cursorStyle);
}

function hide() {
  clearTimeout(hideTimer);
  host?.remove();
  cursorStyle?.remove();
  host = undefined;
  cursorStyle = undefined;
}
