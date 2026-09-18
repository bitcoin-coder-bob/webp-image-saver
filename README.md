# bgpoof Image Saver

A Chrome extension for saving images and background removed copies of them. Right-click any image and open the **bgpoof Image Saver** menu to save the original file, a transparent PNG cutout made by [bgpoof](https://bgpoof.com/), or both. Images are saved in their true format, so a GIF that a site serves as WebP still lands on your machine as a GIF.

## Demo

![Demo](Recording%202026-03-27%20at%2011.15.41.gif)

_The recording is from the original WebP saver, before the background removal options were added._

## Features

- **Save original image** saves the image in its original format, detected from the file itself instead of the URL
- **Save background removed image** saves only a transparent PNG cutout at full size
- **Save both** saves the original and the cutout as a matching pair, like `cat.jpg` and `cat-no-bg.png`
- The background removal options only show for JPG, PNG, and WebP, since those are the types bgpoof handles
- No tab ever opens, bgpoof runs out of sight
- While a removal runs, the page shows a small spinner in the corner and a busy cursor
- Grabs the original GIF on GIPHY instead of the WebP preview

## Installation

1. Clone this repo or download the files
2. Open `chrome://extensions/` (or `brave://extensions/`)
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select this folder

Tabs that were already open need a reload before the menu can hide options for unsupported types.

## How It Works

Chrome can't change a menu at the moment it opens. So when you hover over an image, the extension reads the first few bytes of the file to learn its real type and sets the menu options then. If you right-click before that check finishes and pick a background removal option for an unsupported file, a notification tells you why no cutout was saved.

The extension downloads the image once and works from those exact bytes. To remove the background it loads bgpoof.com in a hidden frame inside an offscreen document and hands the image to bgpoof's own background removal worker. This is the same code that runs when you drop a photo on the site, so the cutout matches what the site produces, but nothing appears on screen. The hidden frame is dropped after a minute without a removal.

If bgpoof fails or rate limits you, a notification tells you why. With **Save both** the original is still saved.

## Why isn't this on the Chrome Web Store?

I'd love to publish this as a proper Chrome Web Store extension, but Google makes the process unnecessarily painful. Too many hoops to jump through for a simple tool. [I'm not doing all that.](https://x.com/BitcoinCoderBob/status/1870323467117097215)
