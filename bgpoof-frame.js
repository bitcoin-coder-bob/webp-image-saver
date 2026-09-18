// Runs inside the hidden bgpoof.com frame owned by the extension's offscreen document. It drives the
// same worker the site uses for a dropped photo, which keeps uploads same-origin and the output identical.
const EXTENSION_ORIGIN = new URL(chrome.runtime.getURL("")).origin;

if (window.parent !== window) {
  window.addEventListener("message", (event) => {
    if (event.origin === EXTENSION_ORIGIN && event.source === window.parent && event.data?.type === "removeBackground") {
      removeBackground(event.data);
    }
  });
  window.parent.postMessage({ type: "bgpoofFrameReady" }, EXTENSION_ORIGIN);
}

async function removeBackground({ id, source, timeoutMs }) {
  let worker;
  try {
    const bitmap = await createImageBitmap(source);
    worker = new Worker("/removal.worker.mjs", { type: "module" });
    const cutout = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("bgpoof took too long to remove the background.")), timeoutMs);
      worker.onerror = () => {
        clearTimeout(timer);
        reject(new Error("bgpoof's background remover couldn't start."));
      };
      worker.onmessage = ({ data }) => {
        if (data.type === "result") {
          clearTimeout(timer);
          resolve(data.blob);
        } else if (data.type === "error") {
          clearTimeout(timer);
          reject(new Error(data.message));
        }
      };
      worker.postMessage({ bitmap, source }, [bitmap]);
    });
    window.parent.postMessage({ type: "backgroundRemoved", id, blob: cutout }, EXTENSION_ORIGIN);
  } catch (error) {
    window.parent.postMessage({ type: "backgroundRemoved", id, error: error?.message ?? String(error) }, EXTENSION_ORIGIN);
  } finally {
    worker?.terminate();
  }
}
