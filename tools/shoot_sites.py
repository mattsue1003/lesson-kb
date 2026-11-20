"""替每個教案網頁截一張縮圖：images/web-<repo>.jpg（480×300）。已有的會跳過。
用法: python3 tools/shoot_sites.py   （讀 links.json）"""
import json, pathlib, asyncio
from playwright.async_api import async_playwright
HERE = pathlib.Path(__file__).resolve().parent.parent
OUT = HERE / "images"; OUT.mkdir(exist_ok=True)

def slug(u):
    return u.split("github.io/")[1].strip("/").replace("/", "_") if "github.io/" in u else ""

async def shoot(ctx, url, path, sem):
    async with sem:
        page = await ctx.new_page()
        try:
            await page.goto(url, wait_until="load", timeout=30000)
            await page.wait_for_timeout(2500)  # 讓動畫、字型、圖片載入
            await page.screenshot(path=str(path), type="jpeg", quality=72)
            return True
        except Exception as e:
            print("FAIL", url, str(e)[:80]); return False
        finally:
            await page.close()

async def main():
    links = json.load(open(HERE / "links.json", encoding="utf-8"))
    urls = sorted({l[0]["url"] for l in links.values() if slug(l[0]["url"])})
    todo = [(u, OUT / f"web-{slug(u)}.jpg") for u in urls if not (OUT / f"web-{slug(u)}.jpg").exists()]
    print(f"{len(urls)} 個網頁，要截 {len(todo)} 個")
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 960, "height": 600}, device_scale_factor=0.5)
        sem = asyncio.Semaphore(6)
        r = await asyncio.gather(*[shoot(ctx, u, f, sem) for u, f in todo])
        await b.close()
    print("完成", sum(r), "失敗", len(r) - sum(r))

asyncio.run(main())
