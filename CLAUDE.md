# inyosi.com

See HANDOFF.md for current status, tuning knobs and open items.

Static home page for inyosi.com (a pulsing ♥ + mailto hello@inyosi.com; the "Hello B" text was removed 2026-10-18 at Cameron's request), styled after aspol.com (warm off-white, Satoshi + JetBrains Mono). An animated pencil meadow sits at the bottom: five depth rows of 16 flower species and 8 grasses (back rows smaller, paler, higher). Bees fly in depth too (they shrink/fade going away, nearer plants hide them) and land flower to flower; moving the pointer over the field (or tapping it on a phone) calls the nearest bee, which lands on the flower nearest the pointer.

## Pipeline
Claude Code (edit locally) -> GitHub `AspolAdmin/inyosi` (public, branch `main`) -> Cloudflare Workers Builds (connected to the repo in the dashboard; builds on every push to main) -> Cloudflare Worker `inyosi` (static assets from `public/`) -> custom domains inyosi.com, www.inyosi.com, ecrockett.com, www.ecrockett.com (see `wrangler.jsonc`).

## Layout
- `public/` – the site (index.html, style.css, favicon.svg, field.js = canvas animation)
- `public/field/` – transparent sprites (flower-0..15.png, grass-0..7.png, bee-up/down.png wing frames) + field.json (sizes, sway pivots, landing points)
- `tools/` – gen.py (generate art via OpenRouter), edit.py (image edit, e.g. wing frame), process.py (cut art into sprites + field.json; needs Pillow + NumPy)
- `art/` – raw model outputs + compare.html (git-ignored; kept on Google Drive only)
- `wrangler.jsonc` – Worker name, assets dir, custom domains

## External references
- Style reference: https://aspol.com (style.css there; palette --color-bg #fbf6f1, text #333638)
- Cloudflare account: C@aspol.com's Account, id 76d33d8a4f557eeec75b7d7f38586d7a; zone inyosi.com id 0dd8e9b3d7de5d3f0e07cefac94dbd61
- Deploy: Cloudflare dashboard -> Workers & Pages -> inyosi -> Settings -> Builds. No tokens/secrets needed in GitHub.
- Local deploy tooling is not installed (no node/wrangler); deploy happens in Cloudflare Workers Builds.
- Cloudflare skill for dashboard-driven deploys: rcc-cloudflare-deploy

## Art generation (OpenRouter)
- Key: macOS Keychain on the Mac mini, service `openrouter` (read with `security find-generic-password -s openrouter -w`; never print or commit it). The dc-research bridge on the MacBook Pro uses the same Keychain name.
- Account enforces ZDR, which blocks OpenAI and Nano Banana image endpoints; the Google gemini-*-image models work.
- Chosen art: flowers (flowers.png + flowers2.png) and grasses from google/gemini-3-pro-image, bee from google/gemini-3.1-flash-image, wing down-stroke via edit with gemini-3-pro-image. Spend so far ~$0.91; cap agreed with Cameron for this work: $10.
- Regenerate sprites: `python3 tools/process.py art public/field` (in a venv with pillow numpy).

## Status / notes
- First deploy done 2026-10-17 via Cloudflare API (no token available locally). Removed GoDaddy parking DNS: A 3.33.251.168, A 15.197.225.128, CNAME www -> inyosi.com. MX (secureserver.net), TXT and _domainconnect/ftp records left intact.
- GitHub Actions workflow removed 2026-10-17 in favour of Workers Builds.

- 2026-10-19: ecrockett.com + www.ecrockett.com added as extra custom domains (they show this same page). Old ecrockett.com A records (54.247.108.120, dead) removed; ecrockett.com email (Google) untouched. Log: ../admin/email-domains.md
