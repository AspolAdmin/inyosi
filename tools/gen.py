"""Generate pencil art for inyosi.com via OpenRouter. Key is read from the macOS Keychain and never printed."""
import base64, json, os, subprocess, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

OUT = sys.argv[1]
KEY = subprocess.run(["security", "find-generic-password", "-s", "openrouter", "-w"],
                     capture_output=True, text=True).stdout.strip()
if not KEY:
    sys.exit("no openrouter key in keychain")

MODELS = {
    "gemini-3-pro": "google/gemini-3-pro-image",
}
STYLE = ("Hand-drawn graphite pencil sketch on plain pure white paper. Fine pencil lines and soft "
         "cross-hatched shading, monochrome grey only, no colour, no paper texture, no border, no text, "
         "no signature, no background scenery.")
PROMPTS = {
    "flowers": ("A single horizontal row of eight separate wildflowers standing upright, evenly spaced with "
                "clear white space between each one so no leaves or petals touch or overlap: poppy, ox-eye "
                "daisy, cornflower, foxglove, cow parsley, buttercup, red clover, harebell. Each has its full "
                "stem down to the bottom edge of the image, varied heights, no ground, no grass. Wide "
                "landscape format. " + STYLE),
    "flowers2": ("A single horizontal row of eight separate wildflowers standing upright, evenly spaced with "
                 "clear white space between each one so no leaves or petals touch or overlap: field scabious, "
                 "common knapweed, red campion, yarrow, meadow cranesbill, ragged robin, tufted vetch, "
                 "forget-me-not. Each has its full stem down to the bottom edge of the image, varied heights, "
                 "no ground, no grass. Wide landscape format. " + STYLE),
    "grasses": ("A single horizontal row of eight separate meadow grass clumps and seed heads standing upright, "
                "evenly spaced with clear white space between each one so nothing touches or overlaps: a tuft "
                "of fine meadow grass, timothy grass, quaking grass, a seeding dandelion clock, cocksfoot, a "
                "short tuft of blades, crested dog's-tail, a tall bent grass. Each rises from the bottom edge "
                "of the image, varied heights, no ground. Wide landscape format. " + STYLE),
    "bee": ("One honeybee in flight seen from the side, wings spread, naturalistic and anatomically accurate, "
            "centred with generous white space around it. " + STYLE),
}

def call(job):
    name, model, kind = job
    body = {"model": model, "modalities": ["image", "text"],
            "messages": [{"role": "user", "content": PROMPTS[kind]}]}
    if kind != "bee":
        body["image_config"] = {"aspect_ratio": "21:9"}
    req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions",
                                 data=json.dumps(body).encode(),
                                 headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            d = json.load(r)
    except urllib.error.HTTPError as e:
        return f"{name}/{kind}: HTTP {e.code} {e.read()[:300]!r}"
    except Exception as e:
        return f"{name}/{kind}: {e}"
    msg = d["choices"][0]["message"]
    imgs = msg.get("images") or []
    if not imgs:
        return f"{name}/{kind}: no image; text={str(msg.get('content'))[:200]}"
    url = imgs[0]["image_url"]["url"]
    head, b64 = url.split(",", 1)
    ext = "png" if "png" in head else "jpg" if "jpeg" in head else "webp"
    os.makedirs(f"{OUT}/{name}", exist_ok=True)
    path = f"{OUT}/{name}/{kind}.{ext}"
    open(path, "wb").write(base64.b64decode(b64))
    cost = (d.get("usage") or {}).get("cost")
    return f"{name}/{kind}: saved {path} cost={cost}"

kinds = sys.argv[2:] or list(PROMPTS)
jobs = [(n, m, k) for n, m in MODELS.items() for k in kinds]
with ThreadPoolExecutor(6) as ex:
    for line in ex.map(call, jobs):
        print(line, flush=True)
