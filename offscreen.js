const BGPOOF_URL = "https://bgpoof.com/";
const BGPOOF_ORIGIN = "https://bgpoof.com";
const FRAME_LOAD_TIMEOUT_MS = 30000;
const REMOVAL_TIMEOUT_MS = 60000;
const FRAME_IDLE_MS = 60000;

let framePromise;
let idleTimer;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "removeBackground") {
    return;
  }
  removeBackground(message.dataUrl)
    .then(sendResponse, (error) => sendResponse({ error: error.message }))
    .finally(scheduleFrameRemoval);
  return true;
});

async function removeBackground(dataUrl) {
  const frame = await bgpoofFrame();
  const source = await (await fetch(dataUrl)).blob();
  const id = crypto.randomUUID();
  const cutout = await new Promise((resolve, reject) => {
    const onMessage = (event) => {
      if (event.source !== frame.contentWindow || event.data?.type !== "backgroundRemoved" || event.data.id !== id) {
        return;
      }
      cleanup();
      if (event.data.error) {
        reject(new Error(event.data.error));
      } else {
        resolve(event.data.blob);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("bgpoof took too long to remove the background."));
    }, REMOVAL_TIMEOUT_MS);
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    };
    window.addEventListener("message", onMessage);
    frame.contentWindow.postMessage({ type: "removeBackground", id, source, timeoutMs: REMOVAL_TIMEOUT_MS }, BGPOOF_ORIGIN);
  });
  return { dataUrl: await blobToDataUrl(cutout) };
}

function bgpoofFrame() {
  clearTimeout(idleTimer);
  framePromise ??= new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    const onMessage = (event) => {
      if (event.source === frame.contentWindow && event.data?.type === "bgpoofFrameReady") {
        cleanup();
        resolve(frame);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      frame.remove();
      framePromise = undefined;
      reject(new Error("bgpoof.com took too long to load."));
    }, FRAME_LOAD_TIMEOUT_MS);
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    };
    window.addEventListener("message", onMessage);
    frame.src = BGPOOF_URL;
    document.body.append(frame);
  });
  return framePromise;
}

// The embedded bgpoof page keeps running as long as it is loaded, so drop it once removals stop.
function scheduleFrameRemoval() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    const frame = await framePromise?.catch(() => null);
    frame?.remove();
    framePromise = undefined;
  }, FRAME_IDLE_MS);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
