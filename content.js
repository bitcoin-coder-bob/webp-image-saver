chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "convertImage") {
    fetch(request.imageUrl)
      .then(response => response.blob())
      .then(blob => {
        // Create object URL for the blob
        const url = URL.createObjectURL(blob);

        // Create temporary link and trigger download
        const a = document.createElement('a');
        a.href = url;

        // Get original filename without .webp extension
        const filename = request.imageUrl.split('/').pop().replace('.webp', '');
        a.download = filename;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
  }
});