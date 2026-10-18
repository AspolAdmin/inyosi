# inyosi.com — handoff (2026-10-18)

Read `CLAUDE.md` first (pipeline, file layout, OpenRouter setup). This file covers where the work stands and how to pick it up.

## Where it stands
Live at https://inyosi.com and https://www.inyosi.com. The page has:
- A pulsing red ♥ in the centre. It pulses at a random 3–6 s interval, and every 1 s while the cursor is over it. "Hello B" was removed on request.
- An animated pencil meadow along the bottom: 5 depth rows, 16 flower species and 8 grasses, with sway and gusts.
- 3–6 pencil bees (by screen width). They start perched on random flowers, fly flower to flower in depth (smaller and paler further back, hidden by nearer plants) and sometimes wander into the open air.
- Moving the cursor over the field, or tapping it on a phone, calls the nearest bee. It comes forward and lands on the flower nearest the pointer.
- Footer: hello@inyosi.com (mailto) and © inyosi 2026.
- Visitors with reduced motion set get a still field with resting bees, and no heart pulse.

## How to change things
1. Edit files in `public/`.
2. `git commit` and `git push` to `main` on `AspolAdmin/inyosi`.
3. Cloudflare Workers Builds deploys in about a minute. Check under Workers & Pages → inyosi → Deployments.

There is no GitHub Actions workflow; it was removed in favour of Workers Builds.

## Tuning knobs (public/field.js)
- `ROWS`, `depthScale`, `depthAlpha`, `depthLift`: how deep the meadow looks.
- In `layout()`:
  - `r() < 0.22`: share of grasses.
  - `(0.6 + r() * 0.55) * (1 + 0.5 * zRow)`: plant spacing.
  - `0.5 + r() * 0.6`: height range.
- `beeBase = clamp(fieldH * 0.13, 24, 40)`: bee width on the front row.
- In `makeBees`: number of bees (3 / 4 / 6 by width).
- `b.speed`, `rest: rand(2.2, 6.5)`: flight speed and perch time.
- `--field-h` in `style.css`: height of the meadow band.

## Art pipeline (if more art is wanted)
- `tools/gen.py`: generates art via OpenRouter. The key is read from the Keychain service `openrouter` on the Mac mini.
  - Run: `python3 -I tools/gen.py art <kind>`
  - Kinds: flowers, flowers2, grasses, bee.
- `tools/edit.py MODEL SRC OUT "prompt"`: image edit. It was used to make the wing down-stroke frame.
- `tools/process.py art public/field`: cuts sheets into transparent sprites and writes `field.json`. It needs Pillow and NumPy, so create a venv first. The old scratchpad venv is gone.
- Raw outputs live in `art/`, which is git-ignored and kept on Google Drive only. `art/compare.html` is the A/B/C and 1/2/3 picker.
- The account enforces ZDR, so only the Google `gemini-*-image` models work. Spend so far is about $0.91 of the agreed $10 cap.

## Open items / ideas
- **Email:** check that hello@inyosi.com exists as a mailbox or alias at GoDaddy (MX is secureserver.net), otherwise mail bounces.
- **Bee views:** bees only have side-view art, so one flying straight at the viewer still looks side-on. Front and rear views could be generated if wanted.
- **Not verified:** the bees haven't been watched live on a real phone. Testing in Claude's hidden browser pane pauses `requestAnimationFrame`. To test there, temporarily expose `frame`, `bees` and `pointer` on `window`, step `frame()` with fake timestamps, and remove the hook before committing.

## History (this session)
1. Built the aspol-style page, created the public repo, and deployed via the Cloudflare API.
2. Removed the GoDaddy parking DNS (two A records and the www CNAME). MX and TXT were kept.
3. Moved deploys to Cloudflare Workers Builds.
4. Added the heart pulse.
5. Tried a hand-drawn SVG bee, later replaced by the meadow.
6. Generated art with 3 Gemini models. Picked flowers A (gemini-3-pro) and bee 2 (gemini-3.1-flash), and added a wing frame.
7. Built the canvas meadow and bee flight, including pointer and tap calling.
8. Added depth: a second flower set, grasses, 5 rows, smaller bees that fly in depth.
9. Removed "Hello B", changed the email to hello@, and made bees start perched in the plants.
