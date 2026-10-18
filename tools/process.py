"""Turn the chosen pencil art into transparent sprites + metadata for inyosi.com.
usage: process.py ART_DIR PUBLIC_DIR"""
import json, sys
import numpy as np
from PIL import Image

ART, PUB = sys.argv[1:3]
INK = (52, 54, 57)  # graphite colour used for every sprite


def to_alpha(img, white=246, black=70, gamma=0.85):
    """Pencil on white -> graphite-coloured pixels whose alpha is how dark the pencil was."""
    g = np.asarray(img.convert("L"), dtype=np.float32)
    a = np.clip((white - g) / (white - black), 0, 1) ** gamma
    out = np.zeros(g.shape + (4,), np.uint8)
    out[..., 0], out[..., 1], out[..., 2] = INK
    out[..., 3] = (a * 255).astype(np.uint8)
    return out


def bbox(alpha, thr=12):
    ys, xs = np.where(alpha > thr)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


# ---------- flowers ----------
rgba = to_alpha(Image.open(f"{ART}/gemini-3-pro/flowers.png"))
alpha = rgba[..., 3]
col = (alpha > 25).sum(axis=0)
filled = col > 1
segs, start = [], None
for x, f in enumerate(filled):
    if f and start is None:
        start = x
    elif not f and start is not None:
        segs.append([start, x]); start = None
if start is not None:
    segs.append([start, len(filled)])
# merge segments separated by small gaps (leaves, petals), drop specks
merged = []
for s in segs:
    if merged and s[0] - merged[-1][1] < 14:
        merged[-1][1] = s[1]
    else:
        merged.append(s)
merged = [s for s in merged if s[1] - s[0] > 30]
print("flower segments:", len(merged), [s[1] - s[0] for s in merged])

meta = []
for i, (x0, x1) in enumerate(merged):
    pad = 6
    x0, x1 = max(0, x0 - pad), min(rgba.shape[1], x1 + pad)
    sub = rgba[:, x0:x1]
    bx0, by0, bx1, by1 = bbox(sub[..., 3])
    crop = sub[max(0, by0 - pad):by1, bx0:bx1]
    h, w = crop.shape[:2]
    a = crop[..., 3].astype(np.float32)
    # pivot: centre of the stem in the bottom 4% of rows
    rows = a[int(h * 0.96):]
    xs = np.arange(w)
    px = float((rows.sum(axis=0) * xs).sum() / max(rows.sum(), 1))
    # head: ink centroid of the top 22% of the flower
    top = a[: int(h * 0.22)]
    yy = np.arange(top.shape[0])[:, None]
    hx = float((top * xs).sum() / max(top.sum(), 1))
    hy = float((top * yy).sum() / max(top.sum(), 1))
    Image.fromarray(crop).save(f"{PUB}/flower-{i}.png", optimize=True)
    meta.append({"src": f"flower-{i}.png", "w": w, "h": h,
                 "pivot": [round(px / w, 3), 1.0], "head": [round(hx / w, 3), round(hy / h, 3)]})

# ---------- bee: two wing frames, identical crop so they stay aligned ----------
frames = [to_alpha(Image.open(p)) for p in (f"{ART}/gemini-3.1-flash/bee.png", f"{ART}/bee-frames/wings-down.png")]
boxes = [bbox(f[..., 3], thr=30) for f in frames]
x0 = min(b[0] for b in boxes) - 4; y0 = min(b[1] for b in boxes) - 4
x1 = max(b[2] for b in boxes) + 4; y1 = max(b[3] for b in boxes) + 4
BEE_W = 260
bee_meta = {}
for name, f in zip(("bee-up.png", "bee-down.png"), frames):
    im = Image.fromarray(f[y0:y1, x0:x1])
    im = im.resize((BEE_W, round(BEE_W * im.height / im.width)), Image.LANCZOS)
    im.save(f"{PUB}/{name}", optimize=True)
    bee_meta = {"w": im.width, "h": im.height}
# feet: lowest ink on the up frame, as a fraction of the crop
fa = frames[0][y0:y1, x0:x1, 3]
ys, xs = np.where(fa > 60)
low = ys > np.percentile(ys, 97)
bee_meta["feet"] = [round(float(xs[low].mean()) / fa.shape[1], 3), round(float(ys.max()) / fa.shape[0], 3)]
bee_meta["faces"] = "left"

json.dump({"flowers": meta, "bee": bee_meta}, open(f"{PUB}/field.json", "w"), indent=1)
print(json.dumps(bee_meta))
