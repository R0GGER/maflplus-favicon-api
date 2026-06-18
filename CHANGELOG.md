# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **HTML scraper provider** (`/s/{domain}`)
  - Parses the target site's HTML for `<link rel="icon">`, `shortcut icon`, `apple-touch-icon`, `apple-touch-icon-precomposed`, and `fluid-icon`.
  - Reads the web app manifest (`<link rel="manifest">`) and merges its declared icons into the candidate list.
  - Honours `<base href>` and follows redirects to resolve relative URLs against the final document URL.
  - Adds standard fallbacks: `/favicon.ico`, `/apple-touch-icon.png`, `/apple-touch-icon-precomposed.png`.
  - Probes well-known larger size variants on CDN paths that follow an `NxN` naming pattern (e.g. `64x64.png` → `128x128.png`, `256x256.png`, `512x512.png`) to recover hi-res icons that SPAs only inject client-side.
  - Score-ranks candidates by declared `sizes` attribute and format (SVG > PNG > WebP > ICO), then verifies real image dimensions via `sharp` and picks the largest valid result.
  - Skips non-display icon types when ranking: Safari `mask-icon` / pinned-tab SVGs, and web-app-manifest icons with `purpose: monochrome` (or matching URL patterns).
  - New `cheerio` dependency for HTML parsing.
  - Scraper cache bypass: `/s/{domain}?refresh=1` (or `?nocache=1`) clears the cached entry and re-scrapes.
- **Google v2 provider** (`/g2/{size}/{domain}`)
  - Uses `t0.gstatic.com/faviconV2` for higher-resolution Google icons.
  - Supported sizes: 16, 32, 64, 128, 256.
- **Faviconkit provider** (`/k/{size}/{domain}`)
  - Uses `ico.faviconkit.net`. Supported sizes: 16, 32, 64, 128, 256.
- **logo.dev provider** (`/l/{domain}`)
  - Optional, gated by the new `LOGODEV_TOKEN` environment variable.
  - Returns HTTP 503 when the token is not configured.
- **selfhst icons lookup** (`/sh/{service}`)
  - Service-name lookup against the [selfhst icons](https://github.com/selfhst/icons) catalog via `cdn.jsdelivr.net`.
  - Supports `?variant=color|light|dark`.
  - Service slug validation: lowercase alphanumerics with `.`, `_`, `-`.
- **Provider configuration endpoint** (`/providers`)
  - Reports which optional providers are enabled (currently `logoDev`) and exposes the publishable logo.dev token to the UI for direct image references.
  - Reports `upstreamIpv4: true` when upstream fetches are forced over IPv4 (datacenter/VPS compatibility).
- **`/{domain}/json` endpoint expansion**
  - Now includes Google v2, Faviconkit (sized variants), Vemetric (default + sized + format variants), logo.dev, HTML scraper and selfhst entries (with `color`/`light`/`dark` variants).
  - Each endpoint exposes both a `proxy` URL (this server) and a `source` URL (upstream provider) for transparency.
- **Best-pick cascade** (`/{domain}`) updated to include the new providers
  - New default fallback order: scraper → Google v2 → DuckDuckGo → Google → Faviconkit → Favicon.so → Vemetric → Favicon-3j1 → Yandex.
  - When `LOGODEV_TOKEN` is set, logo.dev is inserted near the top of the cascade.
- **Web UI**
  - New cards for HTML Scraper, Faviconkit (with size buttons 16–256), logo.dev (only shown when the server reports it as configured) and selfhst icons (with color/light/dark variant buttons).
  - Search input now accepts both a domain (e.g. `example.com`) and a bare service name without a TLD (e.g. `radarr`, `sonarr`); when no dot is present the input is treated as a selfhst service name and only the selfhst card is shown.
  - "Also include selfhst icon lookup when searching a domain" toggle to additionally probe a derived service slug for any domain query.
  - Quick-link suggestions extended with self-hosted service examples (`firefox`, `immich`, `jellyfin`).
  - Front-end fetches `/providers` on load to conditionally show or hide the logo.dev card.
  - Favicon preview images append a cache-busting query parameter so browser cache does not show stale scraper results after redeploy.
  - HTML Scraper card shows the **proxy URL** (`/s/{domain}`) under the icon — the URL to use in apps — not the scraped site's homepage.
- **`upstreamFetch` module** (`src/upstreamFetch.js`)
  - Shared IPv4-only undici `fetch` wrapper with an optional HTTP/1.1 dispatcher (`allowH2: false`) for scraper retries against origins that reject HTTP/2 from datacenter IPs.
- **Configuration**
  - New `LOGODEV_TOKEN` environment variable, documented in `README.md`, `.env.example` and `docker-compose.yml`.
- **Documentation**
  - `README.md` rewritten to cover all new endpoints, the size matrix per provider, the selfhst lookup, the `/providers` endpoint, and the `LOGODEV_TOKEN` variable.
  - Endpoint table consolidated to use parameterised paths (e.g. `/g/{size}/{domain}`) instead of one row per size.
  - Documented scraper cache bypass: `/s/{domain}?refresh=1` (alias `?nocache=1`).
- **Response headers**
  - Favicon responses may include `X-Favicon-Url` with the upstream asset URL when known (e.g. after HTML scraper fetch).

### Changed

- `docker-compose.yml` supports local development via `build: .` (comment out for the published `ghcr.io/r0gger/maflplus-favicon-api:latest` image).
- Best-pick (`/{domain}`) now scrapes the source site first, falling back to network providers only when scraping does not yield a usable icon — typically improving icon quality and resilience for self-hosted/private domains.
- Node process sets `dns.setDefaultResultOrder('ipv4first')` at startup; Docker image passes `--dns-result-order=ipv4first` for additional IPv4 preference on upstream DNS resolution.
- **`/{domain}/json` scraper `source` field** — reports the cached upstream asset URL when available, instead of always `https://{domain}/`.
- Static `index.html` is served with `Cache-Control: no-cache` so UI fixes apply immediately after redeploy without a hard browser refresh.

### Fixed

- **HTML scraper on VPS/datacenter hosts** — upstream fetches now use a dedicated IPv4-only undici dispatcher (`src/upstreamFetch.js`), fixing broken IPv6 egress that caused CDN assets (e.g. `redditstatic.com`) to fail while same-origin fallbacks still worked.
- **HTML scraper icon probing** — CDN/cross-origin icon URLs are fetched with a bare `upstreamFetch` (no extra headers) before retrying with browser-like headers; extra headers were rejected by some CDNs from datacenter IPs.
- **HTML scraper homepage fetch** — retries across `https://{domain}/` and `https://www.{domain}/` with bare, HTTP/1.1, curl and Chrome user-agents when the initial HTML request fails or returns an empty body.
- **HTML scraper fallback ordering** — standard `/apple-touch-icon-precomposed.png` fallbacks are only used when all HTML/CDN candidates fail, preventing a wrong 128×128 icon from winning over a reachable CDN hi-res variant.
- **HTML scraper embedded icon discovery** — scans raw HTML for favicon URLs in inline scripts/JSON when `<link rel="icon">` tags are absent.
- **HTML scraper static CDN hints** — when homepage HTML is blocked entirely (e.g. `reddit.com` from datacenter IPs), known CDN entry points are probed and expanded to larger `NxN` variants (`STATIC_CDN_HINTS` in `providers.js`).
- **HTML scraper variant probing** — when probing `NxN` CDN paths, stops before a sharp size jump (e.g. Reddit serves a full-body marketing PNG at 512×512 while 64–192 are the actual logo favicons).
- **HTML scraper mask-icon exclusion** — ignores Safari `rel="mask-icon"` / `safari-pinned-tab.svg` assets; these are monochrome pinned-tab silhouettes, not display favicons (e.g. `proton.me` showed a solid black “P” instead of the purple gradient logo).
- **HTML scraper manifest monochrome icons** — skips web-app-manifest icons with `purpose: monochrome` (and known monochrome URL patterns); sites like YouTube expose a white logo at 512×512 alongside the red favicon set.
- **Web UI HTML Scraper URL** — card no longer showed `https://{domain}/` under the icon; it now always displays and copies the proxy URL (`{origin}/s/{domain}`), matching how other providers expose usable API URLs.

### Internal

- `services.txt` added to `.gitignore` (local notes file).
- `cache.del()` added for per-entry cache invalidation (used by `/s/{domain}?refresh=1`).
- HTML scraper upstream requests routed through `src/upstreamFetch.js` instead of global `fetch`.
- Disk cache metadata now persists the upstream `url` for scraper entries (used by `X-Favicon-Url` and `/{domain}/json`).

---

## [1.0.0] — Initial public release

### Added

- Express-based favicon proxy with two-tier (memory + disk) caching.
- Domain-based providers:
  - Google (`/g/{size}/{domain}`) — sizes 16, 32, 64, 128.
  - DuckDuckGo (`/d/{domain}`).
  - Yandex (`/y/{domain}`).
  - Favicon.so (`/f/{domain}`).
  - Vemetric (`/v/{domain}`) with optional `?size=` and `?format=png|jpg|webp`.
  - Favicon-3j1 (`/p/{domain}`).
- Best-pick endpoint (`/{domain}`) cascading through all providers and scoring results with `sharp`.
- `/{domain}/json` endpoint listing every favicon URL for a given domain.
- Web UI (`src/public/index.html`):
  - Per-provider cards with click-to-copy URL behaviour.
  - Top navigation bar linking to MAFL+, the Favicon API repo and the Wiki.
  - Bookmarklet ("Mafl+ Favicon Copy") that copies the favicon URL of the current page.
  - "Show source" indicator displaying which upstream provider returned the favicon.
- Configuration via environment variables: `PORT`, `CACHE_DIR`, `MEMORY_CACHE_MAX`, `MEMORY_CACHE_TTL`, `DISK_CACHE_TTL`, `UPSTREAM_TIMEOUT`.
- Dockerfile, `docker-entrypoint.sh` and `docker-compose.yml` for container deployment, plus a GitHub Actions workflow that publishes images to `ghcr.io/r0gger/maflplus-favicon-api`.
- `.gitattributes` enforcing LF line endings.
