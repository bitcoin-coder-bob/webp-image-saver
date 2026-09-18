const PARENT_MENU_ID = "bgpoofImageSaver";
const SAVE_ORIGINAL_MENU_ID = "saveOriginal";
const SAVE_CUTOUT_MENU_ID = "saveCutout";
const SAVE_BOTH_MENU_ID = "saveBoth";
const BGPOOF_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_CACHED_TYPES = 500;
const PROGRESS_DELAY_MS = 300;

const MENU_ACTIONS = {
  [SAVE_ORIGINAL_MENU_ID]: { title: "Save original image", run: saveOriginalImage },
  [SAVE_CUTOUT_MENU_ID]: { title: "Save background removed image", run: saveCutoutImage },
  [SAVE_BOTH_MENU_ID]: { title: "Save both", run: saveImageAndCutout }
};

const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico"
};

const imageTypeCache = new Map();
let hoveredSrc;
let bgpoofItemsShown;
let offscreenReady;

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: PARENT_MENU_ID,
    title: "Browser Image Saver",
    contexts: ["image"]
  });
  for (const [id, { title }] of Object.entries(MENU_ACTIONS)) {
    chrome.contextMenus.create({
      id,
      parentId: PARENT_MENU_ID,
      title,
      contexts: ["image"]
    });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const action = MENU_ACTIONS[info.menuItemId];
  if (action) {
    runWithProgress(() => action.run(info.srcUrl), tab?.id).catch((error) => notify(error.message));
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "imageHovered") {
    updateMenuForImage(message.src);
  }
});

async function updateMenuForImage(src) {
  hoveredSrc = src;
  const supported = await isBgpoofType(src);
  if (src === hoveredSrc) {
    setBgpoofItemsShown(supported);
  }
}

// An unknown type keeps the bgpoof items, since removeImageBackground checks the real bytes anyway.
function isBgpoofType(src) {
  if (!imageTypeCache.has(src)) {
    if (imageTypeCache.size >= MAX_CACHED_TYPES) {
      imageTypeCache.clear();
    }
    imageTypeCache.set(src, fetchImageType(src).catch(() => null));
  }
  return imageTypeCache.get(src).then((mimeType) => !mimeType || BGPOOF_TYPES.includes(mimeType));
}

function setBgpoofItemsShown(shown) {
  if (shown === bgpoofItemsShown) {
    return;
  }
  bgpoofItemsShown = shown;
  Promise.all([
    chrome.contextMenus.update(SAVE_CUTOUT_MENU_ID, { visible: shown }),
    chrome.contextMenus.update(SAVE_BOTH_MENU_ID, { visible: shown })
  ]).catch(() => {
    bgpoofItemsShown = undefined;
  });
}

// Saves that finish quickly should not flash an indicator, so it only appears once the work drags on.
async function runWithProgress(work, tabId) {
  if (tabId === undefined) {
    return work();
  }
  let showing = false;
  const timer = setTimeout(() => {
    showing = true;
    sendProgress(tabId, "busy");
  }, PROGRESS_DELAY_MS);
  try {
    const result = await work();
    if (showing) {
      sendProgress(tabId, "saved");
    }
    return result;
  } catch (error) {
    if (showing) {
      sendProgress(tabId, "idle");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function sendProgress(tabId, state) {
  chrome.tabs.sendMessage(tabId, { type: "progress", state }, { frameId: 0 }).catch(() => {});
}

async function saveOriginalImage(srcUrl) {
  const image = await fetchOriginalImage(srcUrl);
  const downloadId = await download(image.dataUrl, `${image.baseName}.${image.extension}`);
  return { ...image, downloadId };
}

async function saveCutoutImage(srcUrl) {
  const image = await fetchOriginalImage(srcUrl);
  const cutoutDataUrl = await removeImageBackground(image);
  await download(cutoutDataUrl, `${image.baseName}-no-bg.png`);
}

async function saveImageAndCutout(srcUrl) {
  const image = await saveOriginalImage(srcUrl);
  let cutoutDataUrl;
  try {
    cutoutDataUrl = await removeImageBackground(image);
  } catch (error) {
    throw new Error(`Saved the original, but ${error.message}`);
  }

  const savedName = await savedBaseName(image.downloadId, image.baseName);
  await download(cutoutDataUrl, `${savedName}-no-bg.png`);
}

// A right-click faster than the hover check can pick a bgpoof item for an unsupported type.
async function removeImageBackground(image) {
  if (!BGPOOF_TYPES.includes(image.mimeType)) {
    throw new Error(`bgpoof doesn't support ${image.extension.toUpperCase()} files.`);
  }
  try {
    return await removeBackground(image.dataUrl);
  } catch (error) {
    throw new Error(`bgpoof couldn't remove the background. ${error.message}`);
  }
}

async function removeBackground(imageDataUrl) {
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({ type: "removeBackground", dataUrl: imageDataUrl });
  if (!response?.dataUrl) {
    throw new Error(response?.error ?? "bgpoof didn't return an image.");
  }
  return response.dataUrl;
}

// bgpoof runs in a hidden frame in the offscreen document, so no tab opens.
function ensureOffscreenDocument() {
  offscreenReady ??= chrome.runtime
    .getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })
    .then((contexts) => contexts.length > 0 || chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["IFRAME_SCRIPTING"],
      justification: "Run bgpoof's background remover in a hidden bgpoof.com frame"
    }))
    .catch((error) => {
      offscreenReady = undefined;
      throw error;
    });
  return offscreenReady;
}

async function fetchOriginalImage(srcUrl) {
  const response = await fetchOriginal(srcUrl);
  const blob = await response.blob();
  const mimeType = imageTypeOf(new Uint8Array(await blob.slice(0, 16).arrayBuffer()), response);
  return {
    mimeType,
    dataUrl: await blobToDataUrl(mimeType ? blob.slice(0, blob.size, mimeType) : blob),
    baseName: baseNameFromUrl(response.url),
    extension: extensionFor(mimeType, response.url)
  };
}

async function fetchImageType(srcUrl) {
  const response = await fetchOriginal(srcUrl, { Range: "bytes=0-15" });
  const reader = response.body?.getReader();
  const chunk = await reader?.read();
  reader?.cancel().catch(() => {});
  return imageTypeOf(chunk?.value ?? new Uint8Array(), response);
}

async function fetchOriginal(srcUrl, headers) {
  for (const url of originalImageUrls(srcUrl)) {
    const response = await fetch(url, { credentials: "include", headers }).catch(() => null);
    if (response?.ok) {
      return response;
    }
  }
  throw new Error("Couldn't download that image.");
}

// GIPHY serves WebP previews of GIFs, so the GIF is the original.
function originalImageUrls(srcUrl) {
  if (!srcUrl.includes("giphy.com") && !srcUrl.includes("gph.is")) {
    return [srcUrl];
  }
  const gifUrl = srcUrl.replace(/\/webp\//, "/gif/").replace(/\.webp(\?|$)/, ".gif$1");
  return gifUrl === srcUrl ? [srcUrl] : [gifUrl, srcUrl];
}

function imageTypeOf(bytes, response) {
  const header = String.fromCharCode(...bytes.slice(0, 16));
  return sniffImageType(header) ?? response.headers.get("content-type")?.split(";")[0].trim();
}

function sniffImageType(header) {
  if (header.startsWith("\xff\xd8\xff")) return "image/jpeg";
  if (header.startsWith("\x89PNG")) return "image/png";
  if (header.startsWith("GIF8")) return "image/gif";
  if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") return "image/webp";
  if (/^ftypavi[fs]/.test(header.slice(4))) return "image/avif";
  if (header.startsWith("BM")) return "image/bmp";
  return null;
}

function extensionFor(mimeType, url) {
  if (EXTENSIONS[mimeType]) {
    return EXTENSIONS[mimeType];
  }
  if (mimeType?.startsWith("image/")) {
    return mimeType.slice("image/".length).replace(/[^a-z0-9]/gi, "");
  }
  return new URL(url).pathname.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? "img";
}

function baseNameFromUrl(url) {
  const { protocol, pathname } = new URL(url);
  const lastSegment = protocol.startsWith("http") ? decodePathSegment(pathname.split("/").pop()) : "";
  const name = lastSegment
    .replace(/\.[^.]*$/, "")
    .replace(/[\\/:*?"<>|~\x00-\x1f]/g, "_")
    .slice(0, 100)
    .replace(/^[\s.]+|[\s.]+$/g, "");
  return name || `image-${Date.now()}`;
}

function decodePathSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

async function savedBaseName(downloadId, fallback) {
  const [item] = await chrome.downloads.search({ id: downloadId });
  const fileName = item?.filename.split(/[\\/]/).pop();
  return fileName ? fileName.replace(/\.[^.]*$/, "") : fallback;
}

function download(dataUrl, filename) {
  return chrome.downloads.download({ url: dataUrl, filename, conflictAction: "uniquify" });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function notify(message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "Browser Image Saver",
    message
  });
}
