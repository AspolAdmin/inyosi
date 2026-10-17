# inyosi.com

Static home page for inyosi.com ("Hello B ♥" + mailto b@inyosi.com), styled after aspol.com (warm off-white, Satoshi + JetBrains Mono).

## Pipeline
Claude Code (edit locally) -> GitHub `AspolAdmin/inyosi` (public, branch `main`) -> Cloudflare Workers Builds (connected to the repo in the dashboard; builds on every push to main) -> Cloudflare Worker `inyosi` (static assets from `public/`) -> custom domains inyosi.com, www.inyosi.com (see `wrangler.jsonc`).

## Layout
- `public/` – the site (index.html, style.css, favicon.svg)
- `wrangler.jsonc` – Worker name, assets dir, custom domains

## External references
- Style reference: https://aspol.com (style.css there; palette --color-bg #fbf6f1, text #333638)
- Cloudflare account: C@aspol.com's Account, id 76d33d8a4f557eeec75b7d7f38586d7a; zone inyosi.com id 0dd8e9b3d7de5d3f0e07cefac94dbd61
- Deploy: Cloudflare dashboard -> Workers & Pages -> inyosi -> Settings -> Builds. No tokens/secrets needed in GitHub.
- Local deploy tooling is not installed (no node/wrangler); deploy happens in Cloudflare Workers Builds.
- Cloudflare skill for dashboard-driven deploys: rcc-cloudflare-deploy

## Status / notes
- First deploy done 2026-10-17 via Cloudflare API (no token available locally). Removed GoDaddy parking DNS: A 3.33.251.168, A 15.197.225.128, CNAME www -> inyosi.com. MX (secureserver.net), TXT and _domainconnect/ftp records left intact.
- GitHub Actions workflow removed 2026-10-17 in favour of Workers Builds.
