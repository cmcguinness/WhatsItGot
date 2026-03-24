/**
 * Fetches Wappalyzer fingerprint data and generates src/technologies.js
 * Source: https://github.com/dochne/wappalyzer (MIT license)
 */
const fs = require('fs/promises');
const path = require('path');

const BASE_URL = 'https://raw.githubusercontent.com/dochne/wappalyzer/main/src';
const LETTERS = ['_', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i))];

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

async function main() {
  const outDir = path.join(__dirname, '..', 'src');
  await fs.mkdir(outDir, { recursive: true });

  // Fetch categories
  console.log('Fetching categories...');
  const categories = await fetchJSON(`${BASE_URL}/categories.json`);
  console.log(`  ${Object.keys(categories).length} categories`);

  // Fetch all technology files
  console.log('Fetching technologies...');
  const allTechs = {};
  let totalCount = 0;

  const results = await Promise.allSettled(
    LETTERS.map(async (letter) => {
      const url = `${BASE_URL}/technologies/${letter}.json`;
      try {
        const data = await fetchJSON(url);
        return { letter, data };
      } catch (e) {
        console.warn(`  Warning: could not fetch ${letter}.json: ${e.message}`);
        return { letter, data: {} };
      }
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.data) {
      const techs = result.value.data;
      const count = Object.keys(techs).length;
      totalCount += count;
      Object.assign(allTechs, techs);
    }
  }

  console.log(`  ${totalCount} technologies loaded`);

  // Write the output file
  const timestamp = new Date().toISOString();
  const output = `// AUTO-GENERATED — run \`npm run fetch-fingerprints\` to update
// Source: https://github.com/AliasIO/wappalyzer (MIT license)
// Generated: ${timestamp}
// Technologies: ${totalCount}

var WIG_TECHNOLOGIES = ${JSON.stringify(allTechs)};

var WIG_CATEGORIES = ${JSON.stringify(categories)};
`;

  const outPath = path.join(outDir, 'technologies.js');
  await fs.writeFile(outPath, output, 'utf-8');
  console.log(`Written to ${outPath} (${(Buffer.byteLength(output) / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
