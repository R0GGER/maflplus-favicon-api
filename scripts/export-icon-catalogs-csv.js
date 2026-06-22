const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const data = require(path.join(root, 'icon-catalogs.json'));
const outDir = path.join(root, 'exports');
fs.mkdirSync(outDir, { recursive: true });

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(filePath, headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) lines.push(row.map(csvEscape).join(','));
  fs.writeFileSync(filePath, `${lines.join('\r\n')}\r\n`, 'utf8');
}

const dash = data.sources.dashboardicons.entries;
const self = data.sources.selfhst.entries;

writeCsv(
  path.join(outDir, 'dashboardicons.csv'),
  ['slug', 'aliases', 'alias_count', 'cdn_png'],
  dash.map((e) => [
    e.slug,
    e.aliases.join(' | '),
    e.aliases.length,
    `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/${e.slug}.png`,
  ])
);

const dashAliasRows = [];
for (const e of dash) {
  if (e.aliases.length === 0) {
    dashAliasRows.push([e.slug, '']);
  } else {
    for (const alias of e.aliases) dashAliasRows.push([e.slug, alias]);
  }
}
writeCsv(path.join(outDir, 'dashboardicons-aliases.csv'), ['slug', 'alias'], dashAliasRows);

writeCsv(
  path.join(outDir, 'selfhst.csv'),
  ['slug', 'name', 'tags', 'light', 'dark', 'svg', 'cdn_png'],
  self.map((e) => [
    e.slug,
    e.name,
    e.tags,
    e.light ? 'yes' : '',
    e.dark ? 'yes' : '',
    e.svg ? 'yes' : '',
    `https://cdn.jsdelivr.net/gh/selfhst/icons@main/png/${e.slug}.png`,
  ])
);

const selfTagRows = [];
for (const e of self) {
  const tags = e.tags.split(',').map((t) => t.trim()).filter(Boolean);
  if (tags.length === 0) {
    selfTagRows.push(['', e.slug, e.name]);
  } else {
    for (const tag of tags) selfTagRows.push([tag, e.slug, e.name]);
  }
}
writeCsv(path.join(outDir, 'selfhst-by-tag.csv'), ['tag', 'slug', 'name'], selfTagRows);

const dashSlugs = new Set(dash.map((e) => e.slug));
const selfBySlug = new Map(self.map((e) => [e.slug, e]));
const dashBySlug = new Map(dash.map((e) => [e.slug, e]));
const overlapRows = [];
for (const slug of [...dashSlugs].sort()) {
  if (!selfBySlug.has(slug)) continue;
  const d = dashBySlug.get(slug);
  const s = selfBySlug.get(slug);
  overlapRows.push([slug, d.aliases.join(' | '), s.name, s.tags]);
}
writeCsv(
  path.join(outDir, 'overlap-both-catalogs.csv'),
  ['slug', 'dashboard_aliases', 'selfhst_name', 'selfhst_tags'],
  overlapRows
);

console.log(`Written to ${outDir}:`);
for (const f of fs.readdirSync(outDir)) {
  const stat = fs.statSync(path.join(outDir, f));
  console.log(`  ${f} (${stat.size} bytes)`);
}
