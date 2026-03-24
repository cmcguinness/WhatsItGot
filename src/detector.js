/**
 * WhatsItGot Detection Engine
 * Pure detection logic — no DOM, no Chrome APIs, no async.
 * Loaded as a global IIFE in both content script and service worker contexts.
 */
var WIG_DETECTOR = (function () {
  'use strict';

  /**
   * Parse a Wappalyzer pattern string into { regex, version, confidence }.
   * Pattern format: "regex_part\;version:\1\;confidence:50"
   */
  function parsePattern(raw) {
    if (!raw && raw !== '') return null;
    if (typeof raw !== 'string') {
      raw = String(raw);
    }

    var parts = raw.split('\\;');
    var regexStr = parts[0];
    var version = '';
    var confidence = 100;

    for (var i = 1; i < parts.length; i++) {
      var part = parts[i];
      if (part.indexOf('version:') === 0) {
        version = part.substring(8);
      } else if (part.indexOf('confidence:') === 0) {
        confidence = parseInt(part.substring(11), 10) || 100;
      }
    }

    var regex;
    try {
      regex = new RegExp(regexStr, 'i');
    } catch (e) {
      return null;
    }

    return { regex: regex, version: version, confidence: confidence };
  }

  /**
   * Extract version string from a regex match using a version template.
   */
  function extractVersion(match, versionTemplate) {
    if (!versionTemplate || !match) return '';
    var version = versionTemplate;
    for (var i = 1; i < match.length; i++) {
      version = version.replace('\\' + i, match[i] || '');
    }
    version = version.replace(/\\[0-9]/g, '');
    version = version.replace(/^[.\s]+|[.\s]+$/g, '');
    return version;
  }

  /**
   * Test a value against a pattern (string or array of strings).
   */
  function testPatterns(value, patterns) {
    if (!patterns && patterns !== '') return { matched: false };
    if (!Array.isArray(patterns)) patterns = [patterns];

    var bestVersion = '';
    var totalConfidence = 0;
    var matched = false;

    for (var i = 0; i < patterns.length; i++) {
      var patStr = patterns[i];

      // Empty string means "exists" check
      if (patStr === '' || patStr === undefined) {
        if (value !== undefined && value !== null) {
          matched = true;
          totalConfidence = Math.max(totalConfidence, 100);
        }
        continue;
      }

      var parsed = parsePattern(patStr);
      if (!parsed) continue;

      var m = parsed.regex.exec(typeof value === 'string' ? value : String(value));
      if (m) {
        matched = true;
        totalConfidence = Math.max(totalConfidence, parsed.confidence);
        var ver = extractVersion(m, parsed.version);
        if (ver && (!bestVersion || ver.length > bestVersion.length)) {
          bestVersion = ver;
        }
      }
    }

    return { matched: matched, version: bestVersion, confidence: totalConfidence };
  }

  function toArray(val) {
    if (!val && val !== '') return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') return [val];
    if (typeof val === 'object') return Object.values(val);
    return [val];
  }

  /**
   * Main detection function.
   */
  function detect(evidence) {
    if (typeof WIG_TECHNOLOGIES === 'undefined') return {};

    var detected = {};
    var techs = WIG_TECHNOLOGIES;
    var techNames = Object.keys(techs);

    for (var t = 0; t < techNames.length; t++) {
      var name = techNames[t];
      var tech = techs[name];
      var totalConfidence = 0;
      var bestVersion = '';
      var matchFound = false;

      // --- headers ---
      if (tech.headers && evidence.headers) {
        var headerKeys = Object.keys(tech.headers);
        for (var h = 0; h < headerKeys.length; h++) {
          var hKey = headerKeys[h].toLowerCase();
          if (evidence.headers[hKey] !== undefined) {
            var res = testPatterns(evidence.headers[hKey], tech.headers[headerKeys[h]]);
            if (res.matched) {
              matchFound = true;
              totalConfidence = Math.max(totalConfidence, res.confidence);
              if (res.version) bestVersion = res.version;
            }
          }
        }
      }

      // --- cookies ---
      if (tech.cookies && evidence.cookies) {
        var cookieKeys = Object.keys(tech.cookies);
        for (var c = 0; c < cookieKeys.length; c++) {
          if (evidence.cookies[cookieKeys[c]] !== undefined) {
            var res = testPatterns(evidence.cookies[cookieKeys[c]], tech.cookies[cookieKeys[c]]);
            if (res.matched) {
              matchFound = true;
              totalConfidence = Math.max(totalConfidence, res.confidence);
              if (res.version) bestVersion = res.version;
            }
          }
        }
      }

      // --- meta tags ---
      if (tech.meta && evidence.metaTags) {
        var metaKeys = Object.keys(tech.meta);
        for (var m = 0; m < metaKeys.length; m++) {
          var mKey = metaKeys[m].toLowerCase();
          if (evidence.metaTags[mKey] !== undefined) {
            var res = testPatterns(evidence.metaTags[mKey], tech.meta[metaKeys[m]]);
            if (res.matched) {
              matchFound = true;
              totalConfidence = Math.max(totalConfidence, res.confidence);
              if (res.version) bestVersion = res.version;
            }
          }
        }
      }

      // --- html ---
      if (tech.html && evidence.html) {
        var htmlPatterns = toArray(tech.html);
        var res = testPatterns(evidence.html, htmlPatterns);
        if (res.matched) {
          matchFound = true;
          totalConfidence = Math.max(totalConfidence, res.confidence);
          if (res.version) bestVersion = res.version;
        }
      }

      // --- scriptSrc ---
      if (tech.scriptSrc && evidence.scriptSrcs) {
        var scriptPatterns = toArray(tech.scriptSrc);
        for (var s = 0; s < evidence.scriptSrcs.length; s++) {
          var res = testPatterns(evidence.scriptSrcs[s], scriptPatterns);
          if (res.matched) {
            matchFound = true;
            totalConfidence = Math.max(totalConfidence, res.confidence);
            if (res.version) bestVersion = res.version;
            break;
          }
        }
      }

      // --- scripts (older format) ---
      if (tech.scripts && evidence.scriptSrcs) {
        var scriptPatterns2 = toArray(tech.scripts);
        for (var s = 0; s < evidence.scriptSrcs.length; s++) {
          var res = testPatterns(evidence.scriptSrcs[s], scriptPatterns2);
          if (res.matched) {
            matchFound = true;
            totalConfidence = Math.max(totalConfidence, res.confidence);
            if (res.version) bestVersion = res.version;
            break;
          }
        }
      }

      // --- js globals ---
      if (tech.js && evidence.jsResults) {
        var jsKeys = Object.keys(tech.js);
        for (var j = 0; j < jsKeys.length; j++) {
          if (evidence.jsResults[jsKeys[j]] !== undefined) {
            var res = testPatterns(evidence.jsResults[jsKeys[j]], tech.js[jsKeys[j]]);
            if (res.matched) {
              matchFound = true;
              totalConfidence = Math.max(totalConfidence, res.confidence);
              if (res.version) bestVersion = res.version;
            }
          }
        }
      }

      // --- url ---
      if (tech.url && evidence.url) {
        var urlPatterns = toArray(tech.url);
        var res = testPatterns(evidence.url, urlPatterns);
        if (res.matched) {
          matchFound = true;
          totalConfidence = Math.max(totalConfidence, res.confidence);
          if (res.version) bestVersion = res.version;
        }
      }

      // --- dom ---
      if (tech.dom && evidence.dom) {
        var domEntries = Array.isArray(tech.dom) ? tech.dom :
          typeof tech.dom === 'string' ? [{ [tech.dom]: { exists: '' } }] :
          [tech.dom];

        for (var d = 0; d < domEntries.length; d++) {
          var domEntry = domEntries[d];
          if (typeof domEntry === 'string') {
            domEntry = { [domEntry]: { exists: '' } };
          }
          var selectors = Object.keys(domEntry);
          for (var ds = 0; ds < selectors.length; ds++) {
            var sel = selectors[ds];
            var checks = domEntry[sel];
            if (typeof checks === 'string') {
              checks = { exists: checks };
            }
            var domEvidence = evidence.dom[sel];
            if (!domEvidence) continue;

            if (domEvidence.exists) {
              if (checks.exists !== undefined) {
                var res = testPatterns('', checks.exists);
                if (res.matched) {
                  matchFound = true;
                  totalConfidence = Math.max(totalConfidence, res.confidence);
                }
              }
              if (checks.text && domEvidence.text) {
                var res = testPatterns(domEvidence.text, checks.text);
                if (res.matched) {
                  matchFound = true;
                  totalConfidence = Math.max(totalConfidence, res.confidence);
                  if (res.version) bestVersion = res.version;
                }
              }
              if (checks.attributes && domEvidence.attributes) {
                var attrKeys = Object.keys(checks.attributes);
                for (var a = 0; a < attrKeys.length; a++) {
                  if (domEvidence.attributes[attrKeys[a]] !== undefined) {
                    var res = testPatterns(domEvidence.attributes[attrKeys[a]], checks.attributes[attrKeys[a]]);
                    if (res.matched) {
                      matchFound = true;
                      totalConfidence = Math.max(totalConfidence, res.confidence);
                      if (res.version) bestVersion = res.version;
                    }
                  }
                }
              }
              if (checks.properties && domEvidence.properties) {
                var propKeys = Object.keys(checks.properties);
                for (var p = 0; p < propKeys.length; p++) {
                  if (domEvidence.properties[propKeys[p]] !== undefined) {
                    var res = testPatterns(domEvidence.properties[propKeys[p]], checks.properties[propKeys[p]]);
                    if (res.matched) {
                      matchFound = true;
                      totalConfidence = Math.max(totalConfidence, res.confidence);
                      if (res.version) bestVersion = res.version;
                    }
                  }
                }
              }
            }
          }
        }
      }

      // --- css ---
      if (tech.css && evidence.css) {
        var cssPatterns = toArray(tech.css);
        for (var cs = 0; cs < evidence.css.length; cs++) {
          var res = testPatterns(evidence.css[cs], cssPatterns);
          if (res.matched) {
            matchFound = true;
            totalConfidence = Math.max(totalConfidence, res.confidence);
            if (res.version) bestVersion = res.version;
            break;
          }
        }
      }

      if (matchFound && totalConfidence >= 50) {
        var desc = tech.description || '';
        if (!desc && typeof WIG_DESCRIPTIONS !== 'undefined' && WIG_DESCRIPTIONS[name]) {
          desc = WIG_DESCRIPTIONS[name];
        }
        detected[name] = {
          version: bestVersion,
          confidence: totalConfidence,
          cats: tech.cats || [],
          icon: tech.icon || '',
          website: tech.website || '',
          description: desc,
          implies: tech.implies || [],
          excludes: tech.excludes || []
        };
      }
    }

    return detected;
  }

  /**
   * Resolve implies chains.
   */
  function resolveImplies(detected) {
    if (typeof WIG_TECHNOLOGIES === 'undefined') return detected;

    var techs = WIG_TECHNOLOGIES;
    var iterations = 0;
    var changed = true;

    while (changed && iterations < 8) {
      changed = false;
      iterations++;

      var currentNames = Object.keys(detected);
      for (var i = 0; i < currentNames.length; i++) {
        var entry = detected[currentNames[i]];
        var implies = entry.implies;
        if (!implies) continue;

        var impliesList = Array.isArray(implies) ? implies : [implies];
        for (var j = 0; j < impliesList.length; j++) {
          var raw = impliesList[j];
          if (typeof raw !== 'string') continue;

          var parts = raw.split('\\;');
          var impliedName = parts[0].trim();
          var impliedVersion = '';
          var impliedConfidence = 100;

          for (var k = 1; k < parts.length; k++) {
            if (parts[k].indexOf('version:') === 0) {
              impliedVersion = parts[k].substring(8);
            } else if (parts[k].indexOf('confidence:') === 0) {
              impliedConfidence = parseInt(parts[k].substring(11), 10) || 100;
            }
          }

          if (!detected[impliedName] && techs[impliedName]) {
            var implDesc = techs[impliedName].description || '';
            if (!implDesc && typeof WIG_DESCRIPTIONS !== 'undefined' && WIG_DESCRIPTIONS[impliedName]) {
              implDesc = WIG_DESCRIPTIONS[impliedName];
            }
            detected[impliedName] = {
              version: impliedVersion,
              confidence: impliedConfidence,
              cats: techs[impliedName].cats || [],
              icon: techs[impliedName].icon || '',
              website: techs[impliedName].website || '',
              description: implDesc,
              implies: techs[impliedName].implies || [],
              excludes: techs[impliedName].excludes || []
            };
            changed = true;
          }
        }
      }
    }

    // Process excludes
    var finalNames = Object.keys(detected);
    for (var i = 0; i < finalNames.length; i++) {
      var entry = detected[finalNames[i]];
      if (!entry || !entry.excludes) continue;
      var excludesList = Array.isArray(entry.excludes) ? entry.excludes : [entry.excludes];
      for (var j = 0; j < excludesList.length; j++) {
        var excludedName = typeof excludesList[j] === 'string' ? excludesList[j].trim() : '';
        if (excludedName && detected[excludedName]) {
          delete detected[excludedName];
        }
      }
    }

    return detected;
  }

  return {
    detect: detect,
    resolveImplies: resolveImplies,
    parsePattern: parsePattern,
    extractVersion: extractVersion,
    testPatterns: testPatterns
  };
})();
