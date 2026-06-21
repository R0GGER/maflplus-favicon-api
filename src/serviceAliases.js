const { upstreamFetch } = require('./upstreamFetch');

const DASHBOARD_METADATA_URL =
  'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/metadata.json';
const SELFHST_INDEX_URL =
  'https://raw.githubusercontent.com/selfhst/icons/main/index.json';
const METADATA_TTL_MS = 24 * 60 * 60 * 1000;

const STATIC_PROVIDER_ALIASES = {
  selfhst: {
    onedrive: 'microsoft-onedrive',
    kdrive: 'ksuite-kdrive',
  },
  dashboardicons: {
    onedrive: 'microsoft-onedrive',
    kdrive: 'infomaniak-kdrive',
  },
};

let dashboardCache = { loadedAt: 0, aliasToSlug: null, slugs: null, entries: null };
let selfhstCache = { loadedAt: 0, entries: null };

function normalizeServiceAliasKey(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildDashboardAliasIndex(metadata) {
  const aliasToSlug = new Map();
  const slugs = new Set();
  const entries = new Map();

  for (const [slug, info] of Object.entries(metadata || {})) {
    const key = normalizeServiceAliasKey(slug);
    if (!key) continue;
    slugs.add(key);
    aliasToSlug.set(key, slug);
    entries.set(slug, { slug, label: slug, aliases: info?.aliases || [] });

    for (const alias of info?.aliases || []) {
      const aliasKey = normalizeServiceAliasKey(alias);
      if (aliasKey) aliasToSlug.set(aliasKey, slug);
    }

    const parts = key.split('-');
    if (parts.length > 1) {
      const last = parts[parts.length - 1];
      if (last.length >= 3 && !aliasToSlug.has(last)) {
        aliasToSlug.set(last, slug);
      }
    }
  }

  for (const [from, to] of Object.entries(STATIC_PROVIDER_ALIASES.dashboardicons)) {
    aliasToSlug.set(from, to);
  }

  return { aliasToSlug, slugs, entries };
}

function parseSelfhstIndex(raw) {
  const entries = [];
  for (const value of Object.values(raw || {})) {
    if (!value || typeof value !== 'object' || !value.Reference) continue;
    entries.push({
      slug: value.Reference,
      label: value.Name || value.Reference,
      tags: value.Tags || '',
      hasLight: value.Light === 'Yes',
      hasDark: value.Dark === 'Yes',
    });
  }
  return entries;
}

function ensureDashboardSyncIndex() {
  if (!dashboardCache.aliasToSlug) {
    dashboardCache = { loadedAt: 0, ...buildDashboardAliasIndex({}) };
  }
  return dashboardCache;
}

async function ensureDashboardIndex() {
  const now = Date.now();
  if (dashboardCache.aliasToSlug && now - dashboardCache.loadedAt < METADATA_TTL_MS) {
    return dashboardCache;
  }

  try {
    const res = await upstreamFetch(DASHBOARD_METADATA_URL, {
      headers: { 'User-Agent': 'FaviconProxy/1.0' },
    });
    if (res.ok) {
      const metadata = await res.json();
      dashboardCache = { loadedAt: now, ...buildDashboardAliasIndex(metadata) };
      return dashboardCache;
    }
  } catch {
    /* use stale or static fallback */
  }

  ensureDashboardSyncIndex();
  if (!dashboardCache.loadedAt) dashboardCache.loadedAt = now;
  return dashboardCache;
}

async function ensureSelfhstIndex() {
  const now = Date.now();
  if (selfhstCache.entries && now - selfhstCache.loadedAt < METADATA_TTL_MS) {
    return selfhstCache;
  }

  try {
    const res = await upstreamFetch(SELFHST_INDEX_URL, {
      headers: { 'User-Agent': 'FaviconProxy/1.0' },
    });
    if (res.ok) {
      const raw = await res.json();
      selfhstCache = { loadedAt: now, entries: parseSelfhstIndex(raw) };
      return selfhstCache;
    }
  } catch {
    /* use stale cache if available */
  }

  if (!selfhstCache.entries) selfhstCache = { loadedAt: now, entries: [] };
  return selfhstCache;
}

function collectDashboardCandidates(key, aliasToSlug, slugs) {
  if (!key) return [];

  const candidates = [key];
  const resolved = aliasToSlug.get(key);
  if (resolved && resolved !== key) candidates.push(resolved);

  if (slugs) {
    for (const slug of slugs) {
      if (slug !== key && slug.endsWith(`-${key}`)) candidates.push(slug);
    }
  }

  return [...new Set(candidates)];
}

function scoreSelfhstEntry(entry, queryKey) {
  const refKey = normalizeServiceAliasKey(entry.slug);
  const nameKey = normalizeServiceAliasKey(entry.label);
  const tagsKey = normalizeServiceAliasKey(entry.tags);
  let score = 0;

  if (refKey === queryKey) score += 100;
  if (refKey.endsWith(`-${queryKey}`)) score += 80;
  if (refKey.includes(queryKey)) score += 60;
  if (queryKey.includes(refKey) && refKey.length >= 4) score += 40;
  if (nameKey === queryKey) score += 70;
  if (nameKey.includes(queryKey)) score += 35;
  if (tagsKey.includes(queryKey)) score += 15;

  const queryParts = queryKey.split('-').filter(Boolean);
  for (const part of queryParts) {
    if (part.length < 3) continue;
    if (refKey.includes(part)) score += 10;
    if (nameKey.includes(part)) score += 8;
  }

  return score;
}

function searchSelfhstMatches(slug, entries, limit = 8) {
  const queryKey = normalizeServiceAliasKey(slug);
  if (!queryKey) return [];

  const staticResolved = STATIC_PROVIDER_ALIASES.selfhst[queryKey];
  const scored = entries
    .map((entry) => ({ ...entry, score: scoreSelfhstEntry(entry, queryKey) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));

  const seen = new Set();
  const matches = [];

  function addMatch(entry, score) {
    if (!entry?.slug || seen.has(entry.slug)) return;
    seen.add(entry.slug);
    matches.push({
      slug: entry.slug,
      label: entry.label || entry.slug,
      score,
    });
  }

  if (staticResolved) {
    const hit = entries.find((entry) => entry.slug === staticResolved);
    addMatch(hit || { slug: staticResolved, label: staticResolved }, 1000);
  } else {
    addMatch({ slug: queryKey, label: queryKey }, 90);
  }

  for (const entry of scored) {
    addMatch(entry, entry.score);
    if (matches.length >= limit) break;
  }

  return matches.slice(0, limit);
}

function searchDashboardMatches(slug, index, limit = 8) {
  const queryKey = normalizeServiceAliasKey(slug);
  if (!queryKey) return [];

  const { aliasToSlug, slugs, entries } = index;
  const slugList = collectDashboardCandidates(queryKey, aliasToSlug, slugs);
  const staticResolved = STATIC_PROVIDER_ALIASES.dashboardicons[queryKey];
  const seen = new Set();
  const matches = [];

  function addMatch(candidate, score) {
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    const meta = entries?.get(candidate);
    matches.push({
      slug: candidate,
      label: meta?.label || candidate,
      score,
    });
  }

  if (staticResolved) addMatch(staticResolved, 1000);

  for (const candidate of slugList) {
    if (candidate === queryKey && staticResolved && candidate !== staticResolved) continue;
    if (candidate === queryKey) addMatch(candidate, 100);
    else if (aliasToSlug.get(queryKey) === candidate) addMatch(candidate, 900);
    else if (candidate.endsWith(`-${queryKey}`)) addMatch(candidate, 80);
    else addMatch(candidate, 70);
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

function pickResolvedSlug(matches, fallback) {
  return matches[0]?.slug || fallback;
}

async function getSelfhstSlugCandidates(slug) {
  const queryKey = normalizeServiceAliasKey(slug);
  const { entries } = await ensureSelfhstIndex();
  return searchSelfhstMatches(slug, entries).map((match) => match.slug);
}

async function getDashboardIconsSlugCandidates(slug) {
  const queryKey = normalizeServiceAliasKey(slug);
  const index = await ensureDashboardIndex();
  return collectDashboardCandidates(queryKey, index.aliasToSlug, index.slugs);
}

async function getServiceSlugCandidates(slug) {
  const [selfhst, dashboardicons] = await Promise.all([
    getSelfhstSlugCandidates(slug),
    getDashboardIconsSlugCandidates(slug),
  ]);
  return [...new Set([...selfhst, ...dashboardicons])];
}

async function resolveServiceSlug(slug) {
  const queryKey = normalizeServiceAliasKey(slug);
  if (!queryKey) return '';
  const index = await ensureDashboardIndex();
  return index.aliasToSlug.get(queryKey) || queryKey;
}

function resolveServiceSlugSync(slug) {
  const queryKey = normalizeServiceAliasKey(slug);
  if (!queryKey) return '';
  const { aliasToSlug } = ensureDashboardSyncIndex();
  return aliasToSlug.get(queryKey) || queryKey;
}

function getServiceSlugCandidatesSync(slug) {
  const queryKey = normalizeServiceAliasKey(slug);
  const { aliasToSlug, slugs } = ensureDashboardSyncIndex();
  return collectDashboardCandidates(queryKey, aliasToSlug, slugs);
}

async function resolveServiceMatches(slug) {
  const input = normalizeServiceAliasKey(slug);
  const [selfhstIndex, dashboardIndex] = await Promise.all([
    ensureSelfhstIndex(),
    ensureDashboardIndex(),
  ]);

  const selfhstCandidates = searchSelfhstMatches(input, selfhstIndex.entries);
  const dashboardCandidates = searchDashboardMatches(input, dashboardIndex);
  const allCandidates = [
    ...new Set([
      input,
      ...selfhstCandidates.map((match) => match.slug),
      ...dashboardCandidates.map((match) => match.slug),
    ]),
  ];

  return {
    input,
    resolved: pickResolvedSlug(dashboardCandidates, input),
    candidates: allCandidates,
    providers: {
      selfhst: {
        resolved: pickResolvedSlug(selfhstCandidates, input),
        candidates: selfhstCandidates,
      },
      dashboardicons: {
        resolved: pickResolvedSlug(dashboardCandidates, input),
        candidates: dashboardCandidates,
      },
    },
  };
}

function resolveServiceSlugForProviderSync(slug, provider) {
  const queryKey = normalizeServiceAliasKey(slug);
  if (!queryKey) return '';
  const staticHit = STATIC_PROVIDER_ALIASES[provider]?.[queryKey];
  if (staticHit) return staticHit;
  if (provider === 'dashboardicons') return resolveServiceSlugSync(slug);
  return queryKey;
}

module.exports = {
  normalizeServiceAliasKey,
  resolveServiceSlug,
  resolveServiceSlugSync,
  resolveServiceSlugForProviderSync,
  resolveServiceMatches,
  getServiceSlugCandidates,
  getServiceSlugCandidatesSync,
  getSelfhstSlugCandidates,
  getDashboardIconsSlugCandidates,
  ensureDashboardIndex,
  ensureSelfhstIndex,
};
