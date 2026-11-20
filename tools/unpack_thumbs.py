"""把 Chrome 存下的 kb-thumbs-N.json（{thumbs:{貼文編號: base64 jpeg}}）解成 images/<貼文編號>.jpg。"""
import base64, json, pathlib, sys
out = pathlib.Path(__file__).resolve().parent.parent / "images"
out.mkdir(exist_ok=True)
n = 0
for p in sys.argv[1:]:
    for pid, b in json.load(open(p, encoding="utf-8"))["thumbs"].items():
        data = base64.b64decode(b)
        if pid.isdigit() and data[:3] == b"\xff\xd8\xff":  # 只收 JPEG
            (out / f"{pid}.jpg").write_bytes(data); n += 1
print(f"寫入 {n} 張，images/ 共 {len(list(out.glob('*.jpg')))} 張")
