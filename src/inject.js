/**
 * WhatsItGot — Page context injection script
 * Runs in the REAL page JS context (not isolated content script world).
 * Probes window globals and DOM element properties.
 */
(function () {
  'use strict';

  if (window.__WIG_INJECTED__) return;
  window.__WIG_INJECTED__ = true;

  var results = {};

  function probe(dotPath) {
    var parts = dotPath.split('.');
    var obj = window;
    for (var i = 0; i < parts.length; i++) {
      if (obj == null) return undefined;
      if (typeof obj !== 'object' && typeof obj !== 'function') return undefined;
      try {
        obj = obj[parts[i]];
      } catch (e) {
        return undefined;
      }
    }
    return obj;
  }

  var scriptEl = document.currentScript;
  var keysJson = scriptEl ? scriptEl.getAttribute('data-keys') : null;
  var keys = [];
  try {
    keys = keysJson ? JSON.parse(keysJson) : [];
  } catch (e) {}

  for (var i = 0; i < keys.length; i++) {
    try {
      var val = probe(keys[i]);
      if (val !== undefined && val !== null) {
        results[keys[i]] = typeof val === 'string' ? val :
          typeof val === 'number' ? String(val) :
          typeof val === 'boolean' ? String(val) : 'true';
      }
    } catch (e) {}
  }

  // DOM property checks
  var domResults = {};
  var domChecksJson = scriptEl ? scriptEl.getAttribute('data-dom-checks') : null;
  var domChecks = [];
  try {
    domChecks = domChecksJson ? JSON.parse(domChecksJson) : [];
  } catch (e) {}

  for (var i = 0; i < domChecks.length; i++) {
    try {
      var el = document.querySelector(domChecks[i].selector);
      if (el) {
        var propVal = el[domChecks[i].property];
        if (propVal !== undefined && propVal !== null) {
          domResults[domChecks[i].selector + '||' + domChecks[i].property] = String(propVal);
        }
      }
    } catch (e) {}
  }

  window.postMessage({
    type: 'WIG_INJECT_RESULTS',
    js: results,
    dom: domResults
  }, '*');
})();
