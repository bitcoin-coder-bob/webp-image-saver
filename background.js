chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "saveOriginalFormat",
    title: "Save in original format",
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "saveOriginalFormat") {
    const url = info.srcUrl;

    // Handle GIPHY URLs
    if (url.includes('giphy.com') || url.includes('gph.is')) {
      // Convert WebP URL to original GIF URL
      const gifUrl = url.replace(/\/webp\//, '/gif/')
        .replace(/\.webp$/, '.gif');

      // Download original GIF
      chrome.downloads.download({
        url: gifUrl,
        filename: `giphy-${Date.now()}.gif`
      });
    } else {
      // Handle other image types
      const response = await fetch(url);
      const contentType = response.headers.get('content-type');
      const extension = contentType.split('/')[1];

      chrome.downloads.download({
        url: url,
        filename: `image-${Date.now()}.${extension}`
      });
    }
  }
});