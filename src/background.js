/**
 * WhatsItGot — Background service worker
 * Inspects HTTP headers, cookies, and API endpoints.
 * Merges results, manages badge and storage.
 */
importScripts('technologies.js', 'descriptions.js', 'detector.js');

// --- Storage helpers ---

function getTabKey(tabId) {
  return 'tab_' + tabId;
}

async function getTabData(tabId) {
  var key = getTabKey(tabId);
  var data = await chrome.storage.session.get(key);
  return data[key] || null;
}

async function setTabData(tabId, tabData) {
  var key = getTabKey(tabId);
  var obj = {};
  obj[key] = tabData;
  await chrome.storage.session.set(obj);
}

// --- Badge ---

function updateBadge(tabId, count) {
  if (tabId < 0) return;
  chrome.action.setBadgeText({
    text: count > 0 ? String(count) : '',
    tabId: tabId
  });
  chrome.action.setBadgeBackgroundColor({
    color: '#2563eb',
    tabId: tabId
  });
}

// --- Parse Set-Cookie headers into {name: value} ---

function parseCookies(setCookieHeaders) {
  var cookies = {};
  if (!setCookieHeaders) return cookies;

  // Set-Cookie can appear multiple times; we may get them as one joined string
  // or as separate header entries. Handle both.
  var entries = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];

  for (var i = 0; i < entries.length; i++) {
    // Each Set-Cookie value: "name=value; Path=/; HttpOnly; ..."
    // We only need the name=value part (before the first ;)
    var parts = entries[i].split(';');
    var nameValue = parts[0].trim();
    var eq = nameValue.indexOf('=');
    if (eq > 0) {
      var name = nameValue.substring(0, eq).trim();
      var value = nameValue.substring(eq + 1).trim();
      cookies[name] = value;
    }
  }
  return cookies;
}

// --- API endpoint URL patterns for server-side inference ---

var API_PATTERNS = [
  { pattern: /\/wp-json\//i, tech: 'WordPress' },
  { pattern: /\/wp-admin\//i, tech: 'WordPress' },
  { pattern: /\/wp-content\//i, tech: 'WordPress' },
  { pattern: /\/wp-includes\//i, tech: 'WordPress' },
  { pattern: /\/graphql/i, tech: 'GraphQL' },
  { pattern: /\/api\/.*\.php/i, tech: 'PHP' },
  { pattern: /\.php(?:\?|$)/i, tech: 'PHP' },
  { pattern: /\.aspx?(?:\?|$)/i, tech: 'ASP.NET' },
  { pattern: /\.jsp(?:\?|$)/i, tech: 'Java' },
  { pattern: /\/django[-_]?admin/i, tech: 'Django' },
  { pattern: /\/rest\/api\//, tech: 'Atlassian Jira' },
  { pattern: /\/__next\//i, tech: 'Next.js' },
  { pattern: /\/_next\//i, tech: 'Next.js' },
  { pattern: /\/nuxt\//i, tech: 'Nuxt.js' },
  { pattern: /\/_nuxt\//i, tech: 'Nuxt.js' },
  { pattern: /\/api\/2\.0\/.*storefront/i, tech: 'Shopify' },
  { pattern: /\/cart\.js/i, tech: 'Shopify' }
];

function detectFromUrl(url) {
  var detected = {};
  for (var i = 0; i < API_PATTERNS.length; i++) {
    if (API_PATTERNS[i].pattern.test(url)) {
      var techName = API_PATTERNS[i].tech;
      if (typeof WIG_TECHNOLOGIES !== 'undefined' && WIG_TECHNOLOGIES[techName]) {
        var tech = WIG_TECHNOLOGIES[techName];
        detected[techName] = {
          version: '',
          confidence: 75,
          cats: tech.cats || [],
          icon: tech.icon || '',
          website: tech.website || '',
          implies: tech.implies || [],
          excludes: tech.excludes || []
        };
      }
    }
  }
  return detected;
}

// --- Merge detected results into tab data ---

async function mergeDetected(tabId, newDetected, url) {
  var existing = await getTabData(tabId);
  var tabData = existing || { url: url || '', detected: {}, headers: {} };

  var names = Object.keys(newDetected);
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    if (!tabData.detected[name]) {
      tabData.detected[name] = newDetected[name];
    } else {
      if (newDetected[name].version && !tabData.detected[name].version) {
        tabData.detected[name].version = newDetected[name].version;
      }
      if (newDetected[name].confidence > tabData.detected[name].confidence) {
        tabData.detected[name].confidence = newDetected[name].confidence;
      }
    }
  }

  // Resolve implies on the merged set
  tabData.detected = WIG_DETECTOR.resolveImplies(tabData.detected);

  await setTabData(tabId, tabData);
  updateBadge(tabId, Object.keys(tabData.detected).length);
  return tabData;
}

// --- Main frame header + cookie detection ---

chrome.webRequest.onHeadersReceived.addListener(
  function (details) {
    if (details.type !== 'main_frame') return;

    var headers = {};
    var setCookieValues = [];

    if (details.responseHeaders) {
      for (var i = 0; i < details.responseHeaders.length; i++) {
        var h = details.responseHeaders[i];
        var lname = h.name.toLowerCase();
        if (lname === 'set-cookie') {
          // Collect all Set-Cookie headers (there can be many)
          setCookieValues.push(h.value || '');
        } else {
          headers[lname] = h.value || '';
        }
      }
    }

    // Parse HttpOnly cookies from Set-Cookie headers
    var cookies = parseCookies(setCookieValues);

    var evidence = {
      headers: headers,
      html: '',
      scriptSrcs: [],
      metaTags: {},
      cookies: cookies,
      jsResults: {},
      url: details.url,
      dom: {},
      css: []
    };

    var detected = WIG_DETECTOR.detect(evidence);
    detected = WIG_DETECTOR.resolveImplies(detected);

    var tabData = {
      url: details.url,
      detected: detected,
      headers: headers
    };

    setTabData(details.tabId, tabData).then(function () {
      updateBadge(details.tabId, Object.keys(detected).length);
    });
  },
  { urls: ['*://*/*'], types: ['main_frame'] },
  ['responseHeaders', 'extraHeaders']
);

// --- Sub-resource monitoring (XHR, fetch, scripts) ---
// Watches API calls and sub-resource loads for server-side clues

chrome.webRequest.onHeadersReceived.addListener(
  function (details) {
    // Skip main_frame (handled above)
    if (details.type === 'main_frame') return;
    if (details.tabId < 0) return;

    // For images, only check CDN-relevant headers (skip full detection)
    var imageOnly = (details.type === 'image');

    var headers = {};
    var setCookieValues = [];

    if (details.responseHeaders) {
      for (var i = 0; i < details.responseHeaders.length; i++) {
        var h = details.responseHeaders[i];
        var lname = h.name.toLowerCase();
        if (lname === 'set-cookie') {
          setCookieValues.push(h.value || '');
        } else {
          headers[lname] = h.value || '';
        }
      }
    }

    var cookies = parseCookies(setCookieValues);

    // Only run detection if we have interesting headers or cookies
    var hasInteresting = headers['x-powered-by'] || headers['server'] ||
      headers['x-aspnet-version'] || headers['x-drupal-cache'] ||
      headers['x-generator'] || headers['x-shopify-stage'] ||
      headers['x-wordpress'] || headers['x-litespeed-cache'] ||
      // CDN headers
      headers['cf-ray'] || headers['cf-cache-status'] ||
      headers['x-amz-cf-id'] || headers['x-fastly-request-id'] ||
      headers['x-vercel-id'] || headers['x-vercel-cache'] ||
      headers['x-nf-request-id'] || headers['x-sucuri-id'] ||
      headers['x-cdn'] || headers['x-cache'] ||
      headers['x-akamai-transformed'] ||
      headers['x-edgeconnect-midmile-rtt'] ||
      Object.keys(cookies).length > 0;

    var detected = {};

    // For images, only bother with CDN header detection
    if (imageOnly) {
      var hasCdnHeader = headers['cf-ray'] || headers['cf-cache-status'] ||
        headers['x-amz-cf-id'] || headers['x-fastly-request-id'] ||
        headers['x-vercel-id'] || headers['x-vercel-cache'] ||
        headers['x-nf-request-id'] || headers['x-sucuri-id'] ||
        headers['x-cdn'] || headers['x-cache'] || headers['server'] ||
        headers['x-akamai-transformed'] ||
        headers['x-edgeconnect-midmile-rtt'];
      if (hasCdnHeader) {
        var evidence = {
          headers: headers, html: '', scriptSrcs: [], metaTags: {},
          cookies: {}, jsResults: {}, url: '', dom: {}, css: []
        };
        detected = WIG_DETECTOR.detect(evidence);
      }
    } else {
      // Detect from API URL patterns
      var urlDetected = detectFromUrl(details.url);
      Object.assign(detected, urlDetected);

      // Detect from sub-resource headers (only if interesting)
      if (hasInteresting) {
        var evidence = {
          headers: headers,
          html: '',
          scriptSrcs: [],
          metaTags: {},
          cookies: cookies,
          jsResults: {},
          url: details.url,
          dom: {},
          css: []
        };
        var headerDetected = WIG_DETECTOR.detect(evidence);
        Object.assign(detected, headerDetected);
      }
    }

    if (Object.keys(detected).length > 0) {
      mergeDetected(details.tabId, detected, details.url);
    }
  },
  { urls: ['*://*/*'], types: ['xmlhttprequest', 'script', 'stylesheet', 'sub_frame', 'image', 'other'] },
  ['responseHeaders', 'extraHeaders']
);

// --- Content script results ---

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg.type !== 'CONTENT_RESULTS' || !sender.tab) return;

  var tabId = sender.tab.id;

  getTabData(tabId).then(function (existing) {
    var tabData = existing || { url: msg.url, detected: {}, headers: {} };

    var contentDetected = msg.detected || {};
    var names = Object.keys(contentDetected);
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      if (!tabData.detected[name]) {
        tabData.detected[name] = contentDetected[name];
      } else {
        if (contentDetected[name].version && !tabData.detected[name].version) {
          tabData.detected[name].version = contentDetected[name].version;
        }
        if (contentDetected[name].confidence > tabData.detected[name].confidence) {
          tabData.detected[name].confidence = contentDetected[name].confidence;
        }
      }
    }

    tabData.url = msg.url;
    tabData.detected = WIG_DETECTOR.resolveImplies(tabData.detected);

    return setTabData(tabId, tabData).then(function () {
      updateBadge(tabId, Object.keys(tabData.detected).length);
    });
  });

  sendResponse({ ok: true });
});

// --- Tab lifecycle ---

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
  if (changeInfo.status === 'loading') {
    chrome.storage.session.remove(getTabKey(tabId));
    updateBadge(tabId, 0);
  }
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  chrome.storage.session.remove(getTabKey(tabId));
});
