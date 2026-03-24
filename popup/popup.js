/**
 * WhatsItGot — Popup script
 * Displays detected technologies grouped by category.
 */
(function () {
  'use strict';

  var ICON_BASE = 'https://raw.githubusercontent.com/dochne/wappalyzer/main/src/images/icons/';

  // Category display order (priority categories first)
  var CATEGORY_PRIORITY = [1, 12, 18, 22, 66, 59, 10, 6, 62, 47, 27, 31, 36, 41, 67];

  var loadingEl = document.getElementById('loading');
  var emptyEl = document.getElementById('empty');
  var techListEl = document.getElementById('tech-list');
  var urlDisplayEl = document.getElementById('url-display');
  var rescanBtn = document.getElementById('rescan-btn');

  function getCategoryName(catId) {
    // Inline category names for common ones — fetched from technologies.js won't be available here
    var names = {
      1: 'CMS', 2: 'Message boards', 3: 'Database managers', 4: 'Documentation',
      5: 'Widgets', 6: 'Ecommerce', 7: 'Photo galleries', 8: 'Wikis',
      9: 'Hosting panels', 10: 'Analytics', 11: 'Blogs', 12: 'JavaScript frameworks',
      13: 'Issue trackers', 14: 'Video players', 15: 'Comment systems',
      16: 'Security', 17: 'Font scripts', 18: 'Web frameworks', 19: 'Miscellaneous',
      20: 'Editors', 21: 'LMS', 22: 'Web servers', 23: 'Caching',
      24: 'Rich text editors', 25: 'JavaScript graphics', 26: 'Mobile frameworks',
      27: 'Programming languages', 28: 'Operating systems', 29: 'Search engines',
      30: 'Web mail', 31: 'CDN', 32: 'Marketing automation',
      33: 'Web server extensions', 34: 'Databases', 35: 'Maps',
      36: 'Advertising', 37: 'Network devices', 38: 'Media servers',
      39: 'Webcams', 40: 'Printers', 41: 'Payment processors',
      42: 'Tag managers', 43: 'Paywalls', 44: 'Build tools',
      45: 'Task management', 46: 'Customer data platform', 47: 'Live chat',
      48: 'CRM', 49: 'Accounting', 50: 'Cryptominers',
      51: 'Static site generators', 52: 'User onboarding', 53: 'Surveys',
      54: 'Consent management', 55: 'DMS', 56: 'Page builders',
      57: 'Loyalty & rewards', 58: 'Digital asset management',
      59: 'CSS frameworks', 60: 'Containers', 61: 'CI',
      62: 'JavaScript libraries', 63: 'Reverse proxies', 64: 'Accessibility',
      65: 'PaaS', 66: 'UI frameworks', 67: 'Cookie compliance',
      68: 'Performance', 69: 'Translation', 70: 'A/B testing',
      71: 'Email', 72: 'Personalisation', 73: 'Retargeting',
      74: 'RUM', 75: 'Geolocation', 76: 'Affiliate programs',
      77: 'Appointment scheduling', 78: 'Surveys', 79: 'Reviews',
      80: 'Buy now pay later', 81: 'Browser fingerprinting',
      82: 'Hosting', 83: 'Feature management', 84: 'Segment management',
      85: 'SEO', 86: 'Cart abandonment', 87: 'Cart functionality',
      88: 'Merchandising', 89: 'Cross-border ecommerce',
      90: 'Customer engagement', 91: 'Shipping', 92: 'Referral marketing',
      93: 'Ticket booking', 94: 'Social login', 95: 'Product recommendations',
      96: 'Fulfilment', 97: 'Domain parking', 98: 'Returns',
      99: 'BNPL', 100: 'Authentication', 101: 'Subscription',
      102: 'Visual builder', 103: 'Headless CMS', 104: 'Ecommerce frontends',
      105: 'Landing page builder', 106: 'Form builder', 107: 'Search',
      108: 'Data management platform'
    };
    return names[catId] || 'Other';
  }

  function getConfidenceClass(confidence) {
    if (confidence >= 80) return 'confidence-high';
    if (confidence >= 60) return 'confidence-medium';
    return 'confidence-low';
  }

  function createTechItem(name, tech) {
    var item = document.createElement('div');
    item.className = 'tech-item';

    // Confidence bar
    var confBar = document.createElement('div');
    confBar.className = 'tech-confidence ' + getConfidenceClass(tech.confidence || 100);
    confBar.title = (tech.confidence || 100) + '% confidence';
    item.appendChild(confBar);

    // Icon
    var iconWrap = document.createElement('div');
    iconWrap.className = 'tech-icon';

    if (tech.icon) {
      var img = document.createElement('img');
      img.src = ICON_BASE + tech.icon;
      img.alt = name;
      img.onerror = function () {
        this.style.display = 'none';
        iconWrap.textContent = name.charAt(0).toUpperCase();
      };
      iconWrap.appendChild(img);
    } else {
      iconWrap.textContent = name.charAt(0).toUpperCase();
    }
    item.appendChild(iconWrap);

    // Info
    var info = document.createElement('div');
    info.className = 'tech-info';

    var nameEl = document.createElement('span');
    nameEl.className = 'tech-name';
    nameEl.textContent = name;
    info.appendChild(nameEl);

    if (tech.version) {
      var versionEl = document.createElement('span');
      versionEl.className = 'tech-version';
      versionEl.textContent = tech.version;
      info.appendChild(versionEl);
    }

    if (tech.website) {
      var websiteEl = document.createElement('a');
      websiteEl.className = 'tech-website';
      websiteEl.textContent = tech.website.replace(/^https?:\/\//, '').replace(/\/$/, '');
      websiteEl.href = tech.website;
      websiteEl.target = '_blank';
      info.appendChild(websiteEl);
    }

    item.appendChild(info);

    // Tooltip with description
    if (tech.description) {
      item.title = tech.description;
    }

    return item;
  }

  function render(tabData) {
    loadingEl.hidden = true;
    techListEl.innerHTML = '';

    if (!tabData || !tabData.detected || Object.keys(tabData.detected).length === 0) {
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;
    urlDisplayEl.textContent = tabData.url || '';

    // Group by primary category
    var groups = {};
    var techNames = Object.keys(tabData.detected);

    for (var i = 0; i < techNames.length; i++) {
      var name = techNames[i];
      var tech = tabData.detected[name];
      var catId = (tech.cats && tech.cats[0]) || 19;
      if (!groups[catId]) groups[catId] = [];
      groups[catId].push({ name: name, tech: tech });
    }

    // Sort categories: priority ones first, then by name
    var catIds = Object.keys(groups).map(Number);
    catIds.sort(function (a, b) {
      var aIdx = CATEGORY_PRIORITY.indexOf(a);
      var bIdx = CATEGORY_PRIORITY.indexOf(b);
      if (aIdx === -1) aIdx = 999;
      if (bIdx === -1) bIdx = 999;
      if (aIdx !== bIdx) return aIdx - bIdx;
      return getCategoryName(a).localeCompare(getCategoryName(b));
    });

    for (var c = 0; c < catIds.length; c++) {
      var catId = catIds[c];
      var techs = groups[catId];

      // Sort techs by confidence desc, then name asc
      techs.sort(function (a, b) {
        var confDiff = (b.tech.confidence || 100) - (a.tech.confidence || 100);
        if (confDiff !== 0) return confDiff;
        return a.name.localeCompare(b.name);
      });

      var section = document.createElement('div');
      section.className = 'category-section';

      var header = document.createElement('div');
      header.className = 'category-header';
      header.textContent = getCategoryName(catId);
      section.appendChild(header);

      for (var t = 0; t < techs.length; t++) {
        section.appendChild(createTechItem(techs[t].name, techs[t].tech));
      }

      techListEl.appendChild(section);
    }
  }

  // Load results for active tab
  function loadResults() {
    loadingEl.hidden = false;
    emptyEl.hidden = true;
    techListEl.innerHTML = '';

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs || !tabs[0]) {
        render(null);
        return;
      }

      var tabId = tabs[0].id;
      urlDisplayEl.textContent = tabs[0].url || '';

      var key = 'tab_' + tabId;
      chrome.storage.session.get(key, function (data) {
        var tabData = data[key];
        if (tabData && Object.keys(tabData.detected || {}).length > 0) {
          render(tabData);
        } else {
          // Maybe still loading — wait a moment and retry once
          setTimeout(function () {
            chrome.storage.session.get(key, function (data2) {
              render(data2[key] || null);
            });
          }, 1500);
        }
      });
    });
  }

  // Re-scan button
  rescanBtn.addEventListener('click', function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs || !tabs[0]) return;
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ['src/technologies.js', 'src/descriptions.js', 'src/detector.js', 'src/content.js']
      });
      // Reload results after a delay
      setTimeout(loadResults, 2000);
    });
  });

  // Listen for storage changes to auto-update
  chrome.storage.session.onChanged.addListener(function () {
    // Don't auto-reload if popup is already showing results
    // (avoids flicker during re-scan)
  });

  loadResults();
})();
