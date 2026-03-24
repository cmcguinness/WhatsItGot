/**
 * WhatsItGot — Content script
 * Collects DOM evidence, injects page-context probe, runs detection.
 */
(function () {
  'use strict';

  // Collect DOM-based evidence
  function collectEvidence() {
    var evidence = {
      html: '',
      scriptSrcs: [],
      metaTags: {},
      cookies: {},
      url: window.location.href,
      dom: {},
      css: [],
      jsResults: {},
      headers: {}
    };

    // HTML (capped at 500KB)
    try {
      evidence.html = document.documentElement.outerHTML.substring(0, 500000);
    } catch (e) {}

    // Script sources
    try {
      var scripts = document.querySelectorAll('script[src]');
      for (var i = 0; i < scripts.length; i++) {
        evidence.scriptSrcs.push(scripts[i].src);
      }
    } catch (e) {}

    // Meta tags
    try {
      var metas = document.querySelectorAll('meta[name], meta[property], meta[http-equiv]');
      for (var i = 0; i < metas.length; i++) {
        var key = (metas[i].getAttribute('name') ||
                   metas[i].getAttribute('property') ||
                   metas[i].getAttribute('http-equiv') || '').toLowerCase();
        if (key) {
          evidence.metaTags[key] = metas[i].getAttribute('content') || '';
        }
      }
    } catch (e) {}

    // Cookies
    try {
      var pairs = document.cookie.split(';');
      for (var i = 0; i < pairs.length; i++) {
        var eq = pairs[i].indexOf('=');
        if (eq > 0) {
          var name = pairs[i].substring(0, eq).trim();
          var value = pairs[i].substring(eq + 1).trim();
          evidence.cookies[name] = value;
        }
      }
    } catch (e) {}

    // CSS link hrefs
    try {
      var links = document.querySelectorAll('link[rel="stylesheet"][href]');
      for (var i = 0; i < links.length; i++) {
        evidence.css.push(links[i].href);
      }
    } catch (e) {}

    // DOM selector checks
    try {
      var techs = typeof WIG_TECHNOLOGIES !== 'undefined' ? WIG_TECHNOLOGIES : {};
      var techNames = Object.keys(techs);
      for (var t = 0; t < techNames.length; t++) {
        var tech = techs[techNames[t]];
        if (!tech.dom) continue;

        var domEntries = Array.isArray(tech.dom) ? tech.dom :
          typeof tech.dom === 'string' ? [tech.dom] : [tech.dom];

        for (var d = 0; d < domEntries.length; d++) {
          var entry = domEntries[d];
          if (typeof entry === 'string') {
            entry = { [entry]: { exists: '' } };
          }
          var selectors = Object.keys(entry);
          for (var s = 0; s < selectors.length; s++) {
            var sel = selectors[s];
            if (evidence.dom[sel] !== undefined) continue;
            try {
              var el = document.querySelector(sel);
              if (el) {
                var domInfo = { exists: true, text: '', attributes: {}, properties: {} };
                domInfo.text = (el.textContent || '').substring(0, 1000);

                var checks = entry[sel];
                if (typeof checks === 'string') checks = { exists: checks };
                if (checks && checks.attributes) {
                  var attrKeys = Object.keys(checks.attributes);
                  for (var a = 0; a < attrKeys.length; a++) {
                    domInfo.attributes[attrKeys[a]] = el.getAttribute(attrKeys[a]) || '';
                  }
                }
                evidence.dom[sel] = domInfo;
              }
            } catch (e) {}
          }
        }
      }
    } catch (e) {}

    return evidence;
  }

  // Extract JS keys and DOM property checks needed for inject.js
  function getInjectParams() {
    var jsKeys = [];
    var domChecks = [];
    var seenKeys = {};
    var seenChecks = {};

    try {
      var techs = typeof WIG_TECHNOLOGIES !== 'undefined' ? WIG_TECHNOLOGIES : {};
      var techNames = Object.keys(techs);
      for (var t = 0; t < techNames.length; t++) {
        var tech = techs[techNames[t]];

        if (tech.js) {
          var keys = Object.keys(tech.js);
          for (var j = 0; j < keys.length; j++) {
            if (!seenKeys[keys[j]]) {
              seenKeys[keys[j]] = true;
              jsKeys.push(keys[j]);
            }
          }
        }

        if (tech.dom) {
          var domEntries = Array.isArray(tech.dom) ? tech.dom :
            typeof tech.dom === 'string' ? [] : [tech.dom];
          for (var d = 0; d < domEntries.length; d++) {
            var entry = domEntries[d];
            if (typeof entry !== 'object') continue;
            var selectors = Object.keys(entry);
            for (var s = 0; s < selectors.length; s++) {
              var checks = entry[selectors[s]];
              if (typeof checks === 'object' && checks && checks.properties) {
                var propKeys = Object.keys(checks.properties);
                for (var p = 0; p < propKeys.length; p++) {
                  var checkKey = selectors[s] + '||' + propKeys[p];
                  if (!seenChecks[checkKey]) {
                    seenChecks[checkKey] = true;
                    domChecks.push({ selector: selectors[s], property: propKeys[p] });
                  }
                }
              }
            }
          }
        }
      }
    } catch (e) {}

    return { jsKeys: jsKeys, domChecks: domChecks };
  }

  // Inject the page-context probe script
  function injectProbe(params) {
    return new Promise(function (resolve) {
      var timeout = setTimeout(function () {
        resolve({ js: {}, dom: {} });
      }, 3000);

      window.addEventListener('message', function handler(event) {
        if (event.source !== window) return;
        if (!event.data || event.data.type !== 'WIG_INJECT_RESULTS') return;
        window.removeEventListener('message', handler);
        clearTimeout(timeout);
        resolve({ js: event.data.js || {}, dom: event.data.dom || {} });
      });

      try {
        var script = document.createElement('script');
        script.src = chrome.runtime.getURL('src/inject.js');
        script.setAttribute('data-keys', JSON.stringify(params.jsKeys));
        script.setAttribute('data-dom-checks', JSON.stringify(params.domChecks));
        script.onload = function () { script.remove(); };
        (document.head || document.documentElement).appendChild(script);
      } catch (e) {
        clearTimeout(timeout);
        resolve({ js: {}, dom: {} });
      }
    });
  }

  // Main execution
  async function run() {
    var evidence = collectEvidence();
    var params = getInjectParams();

    // Run initial detection with DOM-only evidence
    var detected = WIG_DETECTOR.detect(evidence);

    // Wait for inject.js results
    var injectResults = await injectProbe(params);
    evidence.jsResults = injectResults.js;

    // Merge DOM property results from inject.js
    var domPropKeys = Object.keys(injectResults.dom);
    for (var i = 0; i < domPropKeys.length; i++) {
      var parts = domPropKeys[i].split('||');
      var sel = parts[0];
      var prop = parts[1];
      if (evidence.dom[sel]) {
        evidence.dom[sel].properties[prop] = injectResults.dom[domPropKeys[i]];
      }
    }

    // Re-run full detection with JS probe results
    detected = WIG_DETECTOR.detect(evidence);
    detected = WIG_DETECTOR.resolveImplies(detected);

    // Send to background
    chrome.runtime.sendMessage({
      type: 'CONTENT_RESULTS',
      url: evidence.url,
      detected: detected
    });
  }

  run();
})();
