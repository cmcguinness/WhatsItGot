# What's It Got (WIG)

A Chrome extension that detects what technologies a website is built with — from CMS platforms like WordPress down to JavaScript frameworks like React.

Powered by the [Wappalyzer](https://github.com/dochne/wappalyzer) open-source fingerprint database (3,900+ technologies) with a supplemental hand-curated description database.

## Features

- **Comprehensive detection** across CMS, frameworks, CDNs, analytics, payment processors, programming languages, web servers, and 100+ other categories
- **Multiple detection methods**: HTTP response headers, cookies (including HttpOnly), meta tags, DOM patterns, JavaScript globals, script URLs, CSS references, and API endpoint monitoring
- **CDN detection**: Cloudflare, Fastly, Akamai, CloudFront, Vercel, Netlify, and more — from both page and sub-resource response headers
- **Server-side inference**: Detects PHP, Node.js, Django, Rails, ASP.NET, and others via session cookies, API URL patterns, and response headers
- **Dark-themed popup UI** with technologies grouped by category, version badges, confidence indicators, and hover descriptions
- **Badge count** showing the number of detected technologies on each tab

## Installation

1. Clone this repository
2. Run `npm run build` to fetch the latest fingerprint database (requires Node.js 18+)
3. Open `chrome://extensions` in Chrome
4. Enable **Developer mode**
5. Click **Load unpacked** and select the project folder

## Updating Fingerprints

```bash
npm run build
```

This fetches the latest technology definitions from the Wappalyzer repository and regenerates `src/technologies.js`. Reload the extension in Chrome afterward.

## How It Works

The extension uses three detection layers that run in parallel and merge results:

1. **Background service worker** intercepts HTTP response headers and Set-Cookie values on every request (pages, API calls, images) to detect server technologies, CDNs, and backend frameworks
2. **Content script** analyzes the page DOM — HTML patterns, meta tags, script sources, CSS links, cookies, and DOM selectors
3. **Injected page script** probes JavaScript globals in the real page context (e.g., `window.React`, `window.Vue`, `window.__NEXT_DATA__`) since content scripts run in an isolated world

Results from all three layers are merged per tab, implied technology chains are resolved (e.g., WordPress implies PHP), and the final list is displayed in the popup grouped by category.

## Adding Descriptions

When a technology is missing a description from the Wappalyzer database, add it to `src/descriptions.js`:

```js
var WIG_DESCRIPTIONS = {
  // ...existing entries...
  "New Technology": "One-line description of what it does.",
};
```

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE), consistent with the [Wappalyzer](https://github.com/dochne/wappalyzer) fingerprint data it incorporates.
