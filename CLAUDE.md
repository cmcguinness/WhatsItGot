# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**What's It Got** (short name: **WIG**) is a Chrome Extension (Manifest V3) that detects what technologies a website is built with. It uses the Wappalyzer open-source fingerprint database (~3,900 technologies) plus a supplemental hand-curated description database.

## Build Commands

```bash
npm run build              # Fetch latest Wappalyzer fingerprints → generates src/technologies.js
npm run fetch-fingerprints # Same as build
node scripts/generate-icons.js  # Regenerate PNG icons from code
```

There is no bundler, transpiler, or test suite. The extension uses plain JavaScript with global IIFEs (no modules). To install: load unpacked at `chrome://extensions` pointing to the project root.

## Architecture

### Detection Pipeline

The extension uses three execution contexts that communicate via message passing:

1. **Background service worker** (`src/background.js`) — intercepts HTTP response headers and `Set-Cookie` via `chrome.webRequest.onHeadersReceived`. Monitors both main-frame and sub-resource requests (XHR, scripts, images) for server-side tech clues, CDN headers, and API URL patterns. Stores results per tab in `chrome.storage.session`.

2. **Content script** (`src/content.js`) — runs at `document_idle`, collects DOM evidence (HTML, script srcs, meta tags, cookies, CSS links, DOM selectors). Sends results to background via `chrome.runtime.sendMessage`.

3. **Injected page script** (`src/inject.js`) — injected into the real page context (not the isolated content script world) to probe `window.*` globals (e.g., `window.React`, `window.Vue`). Communicates back to content script via `window.postMessage`. The list of JS keys to probe is passed as `data-keys` attribute on the script tag.

### Data Flow

```
HTTP Response → background.js (headers + cookies + API URL patterns)
Page Load → content.js (DOM evidence) → inject.js (JS globals) → content.js
Both → merge in background.js → chrome.storage.session → popup.js renders
```

### Shared Code Loading

Since there's no bundler, shared code is loaded via script ordering in `manifest.json` content_scripts array and `importScripts()` in the service worker. Load order matters:
- `technologies.js` → `descriptions.js` → `detector.js` → `content.js`

### Key Globals

- `WIG_TECHNOLOGIES` — the full Wappalyzer fingerprint database (generated, ~1.2MB)
- `WIG_CATEGORIES` — category ID → name mapping (generated)
- `WIG_DESCRIPTIONS` — supplemental descriptions for techs missing them in Wappalyzer
- `WIG_DETECTOR` — detection engine IIFE with `detect()`, `resolveImplies()`, `parsePattern()`, `testPatterns()`

### Fingerprint Data

`src/technologies.js` is **auto-generated** by `scripts/fetch-fingerprints.js` from the [dochne/wappalyzer](https://github.com/dochne/wappalyzer) GitHub repo. Do not hand-edit. The Wappalyzer pattern format uses `\;` as a metadata separator (e.g., `"nginx(?:/([\\d.]+))?\\;version:\\1"`).

`src/descriptions.js` is **hand-curated** — add entries here when Wappalyzer lacks a description for a technology.

### Version Bumping

Both `manifest.json` and `package.json` versions must be kept in sync. Bump on every user-facing change.

## Important Patterns

- **Empty pattern string** (`""`) in Wappalyzer means "exists check" — match if the key is present regardless of value
- **Confidence threshold** is 50 — technologies below this aren't shown
- **`implies` chains** are resolved iteratively (max 8 passes) with cycle protection
- **`excludes`** can delete entries from detected set — guard against undefined when iterating
- **`tabId` can be -1** for requests not tied to a tab — always guard before passing to `chrome.action` APIs
- **HttpOnly cookies** are only visible from `Set-Cookie` response headers in the background service worker, not from `document.cookie` in the content script
- **`extraHeaders`** option is required in `webRequest` listeners to see `Set-Cookie` headers in MV3
- Tech icons load from the Wappalyzer GitHub CDN with a fallback letter-initial placeholder
