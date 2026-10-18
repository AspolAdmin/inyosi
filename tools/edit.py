"""Image-edit call via OpenRouter: send a source image plus instruction, save the result. Key from Keychain, never printed.
usage: edit.py MODEL SRC OUT "prompt" """
import base64, json, subprocess, sys, urllib.request

model, src, out, prompt = sys.argv[1:5]
key = subprocess.run(["security", "find-generic-password", "-s", "openrouter", "-w"],
                     capture_output=True, text=True).stdout.strip()
if not key:
    sys.exit("no openrouter key in keychain")
img = "data:image/png;base64," + base64.b64encode(open(src, "rb").read()).decode()
body = {"model": model, "modalities": ["image", "text"],
        "messages": [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": img}},
            {"type": "text", "text": prompt}]}]}
req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", data=json.dumps(body).encode(),
                             headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
try:
    d = json.load(urllib.request.urlopen(req, timeout=300))
except urllib.error.HTTPError as e:
    sys.exit(f"HTTP {e.code} {e.read()[:300]!r}")
msg = d["choices"][0]["message"]
imgs = msg.get("images") or []
if not imgs:
    sys.exit(f"no image; text={str(msg.get('content'))[:300]}")
open(out, "wb").write(base64.b64decode(imgs[0]["image_url"]["url"].split(",", 1)[1]))
print(f"saved {out} cost={(d.get('usage') or {}).get('cost')}")
