# Image Format Saver

A Chrome extension that lets you save images in their original format instead of WebP. Many websites (especially GIPHY) serve images as WebP even when the original is a GIF, PNG, or JPEG. This extension adds a right-click context menu option to download the image in its true format.

## Demo

![Demo](Recording%202026-03-27%20at%2011.15.41.gif)

## Features

- Right-click any image and select **"Save in original format"** to download it in its native format
- Automatically converts GIPHY WebP URLs back to their original GIF format
- Detects the correct file type from the server's content-type header for non-GIPHY images

## Installation

1. Clone this repo or download the files
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select this folder

## Why isn't this on the Chrome Web Store?

I'd love to publish this as a proper Chrome Web Store extension, but Google makes the process unnecessarily painful. Too many hoops to jump through for a simple tool. [I'm not doing all that.](https://x.com/BitcoinCoderBob/status/1870323467117097215)

## How It Works

The extension registers a context menu item on all images. When clicked, it checks if the image is from GIPHY and rewrites the URL to fetch the original GIF. For other sites, it reads the content-type header from the server response to determine the real file format and saves accordingly.
