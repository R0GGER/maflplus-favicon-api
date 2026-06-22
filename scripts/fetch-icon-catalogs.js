const fs = require('fs');
const https = require('https');
const path = require('path');

const DASHBOARD_METADATA_URL =
  'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/metadata.json';
const SELFHST_INDEX_URL =
  'https://raw.githubusercontent.com/selfhst/icons/main/index.json';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'FaviconProxy/1.0' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

(async () => {
  const [dashboard, selfhst] = await Promise.all([
    fetchJson(DASHBOARD_METADATA_URL),
    fetchJson(SELFHST_INDEX_URL),
  ]);

  const dashEntries = Object.entries(dashboard)
    .map(([slug, info]) => ({
      slug,
      aliases: info?.aliases || [],
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const selfEntries = Object.values(selfhst)
    .filter((value) => value && value.Reference)
    .map((value) => ({
      slug: value.Reference,
      name: value.Name || value.Reference,
      tags: value.Tags || '',
      light: value.Light === 'Yes',
      dark: value.Dark === 'Yes',
      svg: value.SVG === 'Yes',
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const out = {
    generatedAt: new Date().toISOString(),
    sources: {
      dashboardicons: {
        cdn: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/{slug}.png',
        metadata: DASHBOARD_METADATA_URL,
        count: dashEntries.length,
        entries: dashEntries,
      },
      selfhst: {
        cdn: 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/png/{slug}.png',
        metadata: SELFHST_INDEX_URL,
        count: selfEntries.length,
        entries: selfEntries,
      },
    },
  };

  const outPath = path.join(__dirname, '..', 'icon-catalogs.json');
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${outPath}`);
  console.log(`  dashboardicons: ${dashEntries.length} icons`);
  console.log(`  selfhst: ${selfEntries.length} icons`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
