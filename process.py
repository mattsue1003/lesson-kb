"""把臉書貼文 JSON 整理成教案知識庫資料 (data.js)。

用法: python3 -I process.py raw/fb-posts-page.json [raw/fb-posts-personal.json ...]
每個輸入檔名含 personal 的會標成「個人臉書」，其餘為「粉專」。
"""
import json, re, sys, hashlib, pathlib

HERE = pathlib.Path(__file__).parent

# ---------- 分類規則（關鍵字 → 標籤） ----------
TAXONOMY = {
    "對象": {
        "長輩": ["長輩", "長者", "阿公", "阿嬤", "銀髮", "樂齡", "日照", "失智", "據點", "老人", "高齡", "社區照顧", "c據點", "C據點", "關懷據點"],
        "兒童": ["孩子", "兒童", "幼兒", "小朋友", "親子", "幼兒園", "國小", "學齡", "孩童", "感統", "學生"],
        "身障者": ["身障", "身心障礙", "自閉", "智能障礙", "腦麻", "脊損", "發展遲緩"],
        "照顧者/專業人員": ["照服員", "居服員", "居家服務員", "照顧者", "家屬", "教保員", "治療師", "社工", "老師們", "講師", "專業人員", "教育訓練"],
    },
    "訓練領域": {
        "認知訓練": ["認知", "記憶", "注意力", "專注", "腦力", "動腦", "找碴", "猜謎", "推理", "邏輯", "數字", "計算", "益智", "迷宮", "配對", "反應力"],
        "肢體/肌力": ["肌力", "運動", "體適能", "平衡", "核心", "伸展", "防跌", "跌倒", "下肢", "律動", "拍打功", "健身", "復能", "肌少"],
        "手部精細": ["手指", "手部", "精細", "剪刀", "握筆", "撕貼", "串珠", "摺紙", "折紙", "編織", "手眼協調", "寫字", "筆順", "點陣"],
        "懷舊/生命回顧": ["懷舊", "古早", "老屋", "老鐵窗", "花磚", "童玩", "傳家寶", "生命故事", "回憶", "以前", "老歌"],
        "音樂/律動": ["音樂", "歌曲", "唱歌", "節拍", "律動", "前奏", "樂器", "打擊"],
        "美勞/手作": ["美勞", "手作", "著色", "塗色", "畫畫", "纏繞畫", "撕貼畫", "色紙", "紙盤", "毛線", "黏土", "藝術"],
        "社交/情緒": ["社交", "互動交流", "情緒", "聊天", "團體動力", "破冰", "人際", "引導卡", "說話"],
        "衛教/健康識能": ["衛教", "健康促進", "失智風險", "營養", "飲食", "標籤", "用藥", "睡眠", "血壓", "巴金森", "護眼", "眼睛", "口腔", "WHO", "實證"],
        "生活功能/ADL": ["日常生活", "ADL", "生活功能", "轉移位", "穿衣", "購物", "理財", "居家", "輔具", "生活再設計"],
        "感官/知覺": ["感官", "視覺", "聽覺", "觸覺", "嗅覺", "知覺", "感覺統合"],
    },
    "形式": {
        "網頁工具/生成器": ["生成器", "網頁", "網站", "線上", "工具包", "資料庫", "一鍵", "產生器", "互動教案網頁"],
        "紙本學習單": ["紙本", "學習單", "練習單", "印出", "列印", "A4", "寫字本", "著色畫"],
        "互動簡報": ["互動簡報", "簡報", "投影片", "PPT"],
        "影片/動畫": ["影片", "短影音", "動畫", "Reel", "YouTube", "示範影片"],
        "桌遊/實體教具": ["桌遊", "教具", "卡牌", "牌卡", "道具", "骰子"],
        "課程/工作坊": ["工作坊", "課程", "講座", "研習", "培訓", "20小時", "20 小時"],
    },
    "主題": {
        "台灣文化/在地": ["台灣", "臺灣", "在地", "景點", "老屋", "夜市", "鐵窗", "花磚"],
        "節慶": ["節日", "春節", "過年", "端午", "中秋", "元宵", "母親節", "父親節", "教師節", "聖誕", "清明", "重陽", "七夕", "新年"],
        "動物/自然": ["動物", "鳥", "腳印", "植物", "昆蟲", "海洋", "自然", "森林"],
        "食物/飲食": ["食物", "水果", "蔬菜", "料理", "食品", "零食", "飲料", "早餐"],
        "AI/科技應用": ["AI", "Claude", "ChatGPT", "人工智慧", "科技", "程式"],
    },
}

# 判斷「是否為教案／可帶領的活動素材」
LESSON_HINTS = ["教案", "活動", "學習單", "練習單", "生成器", "互動", "帶領", "玩法", "遊戲", "團體", "課程", "訓練",
                "紙本", "簡報", "教具", "工具", "資料庫", "猜謎", "找碴", "著色", "律動", "手作", "下載", "留言「", "留言『"]
NON_LESSON_HINTS = ["詐騙", "博覽會今天", "徵才", "招募", "恭喜", "生日快樂", "公告", "停課"]


def clean_date(s):
    """'2026年11月18日 星期三下午12:06 · 分享對象…' -> '2026-11-18'"""
    m = re.search(r"(\d{4})年(\d{1,2})月(\d{1,2})日", s or "")
    if m:
        return f"{m[1]}-{int(m[2]):02d}-{int(m[3]):02d}"
    m = re.search(r"(\d{1,2})月(\d{1,2})日", s or "")
    if m:  # 今年貼文 FB 不顯示年份
        return f"2026-{int(m[1]):02d}-{int(m[2]):02d}"
    return ""


def make_title(text):
    first = ""
    for line in text.splitlines():
        line = line.strip(" ▌▍|｜\t")
        if len(line) >= 4:
            first = line
            break
    m = re.search(r"[【「『]([^】」』]{3,40})[】」』]", text[:200])
    t = first or (m[1] if m else text[:30])
    t = re.sub(r"^[▌▍\s]+", "", t)
    return t[:60]


def keyword(text):
    m = re.search(r"留言[「『]([^」』]{1,20})[」』]", text)
    return m[1] if m else ""


def tag(text):
    tags = {}
    for dim, groups in TAXONOMY.items():
        hit = [name for name, kws in groups.items() if any(k in text for k in kws)]
        tags[dim] = hit
    return tags


def is_lesson(text):
    if len(text) < 40:
        return False
    if any(k in text for k in NON_LESSON_HINTS) and not any(k in text for k in ["教案", "學習單", "生成器"]):
        return False
    score = sum(1 for k in LESSON_HINTS if k in text)
    return score >= 2


def norm(t):
    return re.sub(r"\s+", "", t)


def load_csv(p):
    """Meta Business Suite「匯出資料」→ 貼文層級 CSV。全文在「標題」，部分貼文在「說明」。"""
    import csv
    out = []
    for x in csv.DictReader(open(p, encoding="utf-8-sig")):
        text = next((x.get(k) or "" for k in ["標題", "說明", "Title", "Description"] if (x.get(k) or "").strip()), "")
        m = re.match(r"(\d{2})/(\d{2})/(\d{4})", x.get("發佈時間", ""))
        out.append({
            "text": text,
            "date": f"{m[3]}年{int(m[1])}月{int(m[2])}日" if m else "",
            "href": x.get("永久連結", ""),
            "post_type": x.get("貼文類型", ""),
            "post_id": x.get("貼文編號", ""),
            "imgs": [],
        })
    return out


def load(paths):
    posts = []
    for p in paths:
        src = "個人臉書" if "personal" in pathlib.Path(p).name else "粉專"
        rows = load_csv(p) if p.endswith(".csv") else json.load(open(p, encoding="utf-8"))
        for x in rows:
            x["source"] = src
            posts.append(x)
    # 去重：官方 CSV 優先，其次較長的版本（爬取的截斷版是完整版的前綴）
    posts.sort(key=lambda x: (0 if "post_type" in x else 1, -len(x.get("text", ""))))
    kept, seen = [], []
    for x in posts:
        n = norm(x.get("text", ""))
        if len(n) < 8:
            continue
        probe = n[: min(len(n), 40)]
        twin = next((k for s, k in seen if s.startswith(probe) or n.startswith(s[:40])), None)
        if twin is not None:
            if not twin.get("imgs") and x.get("imgs"):  # 爬取版有圖片，補給官方版
                twin["imgs"] = x["imgs"]
            continue
        seen.append((n, x))
        kept.append(x)
    return kept


DIM_FIELDS = {"對象": "audience", "訓練領域": "domains", "形式": "formats", "主題": "themes"}


def load_enrich():
    """enrich/*.json：subagent 讀過每篇後產生的結構化欄位，以 id 對應。"""
    e = {}
    for f in sorted((HERE / "enrich").glob("*.json")):
        for r in json.load(open(f, encoding="utf-8")):
            e[r["id"]] = r
    return e


def main(paths):
    posts = load(paths)
    enrich = load_enrich()
    out = []
    for x in posts:
        text = x["text"].strip()
        uid = hashlib.md5(norm(text)[:120].encode()).hexdigest()[:8]
        en = enrich.get(uid)
        tags = tag(text)
        rec = {
            "id": uid,
            "title": make_title(text),
            "date": clean_date(x.get("date", "")),
            "source": x["source"],
            "lesson": is_lesson(text),
            "category": "",
            "summary": "",
            "materials": [],
            **{DIM_FIELDS[d]: v for d, v in tags.items()},
        }
        if en:  # 以 subagent 判讀為準
            for k in ["title", "lesson", "category", "summary", "materials", "audience", "domains", "formats", "themes"]:
                if k in en and en[k] not in (None, ""):
                    rec[k] = en[k]
        out.append({
            **rec,
            "truncated": bool(x.get("truncated")),
            "keyword": keyword(text),
            "href": x.get("href", "") if "story_fbid" in x.get("href", "") or "/reel/" in x.get("href", "") or "/videos/" in x.get("href", "") or "fbid=" in x.get("href", "") else "",
            # 只用存在 images/ 的縮圖；臉書 CDN 網址會過期，不再直接引用
            "img": f"images/{x['post_id']}.jpg" if x.get("post_id") and (HERE / "images" / f"{x['post_id']}.jpg").exists() else "",
            "text": text,
        })
    # 只留教案；非教案貼文（公告、文章、個人分享）不放進知識庫
    out = [r for r in out if r["lesson"]]
    # 教案網頁連結：links.json（貼文 id → 對應的 GitHub Pages 網頁，由 Claude 比對網站標題產生）
    lf = HERE / "links.json"
    links = json.load(open(lf, encoding="utf-8")) if lf.exists() else {}
    for r in out:
        r["links"] = [{"url": l["url"], "conf": l.get("conf", "")} for l in links.get(r["id"], [])]
    out.sort(key=lambda r: r["date"], reverse=True)
    # 重發的同一份教案（標題相同）合併成一筆，保留最新一次，記下其他發文日期
    merged, by_title = [], {}
    for r in out:
        k = (r["title"], r["category"])
        if k in by_title:
            by_title[k].setdefault("reposts", []).append(r["date"])
            continue
        by_title[k] = r
        merged.append(r)
    out = merged
    js = "window.KB_DATA = " + json.dumps(out, ensure_ascii=False) + ";\nwindow.KB_TAXONOMY = " + json.dumps(
        {d: list(g) for d, g in TAXONOMY.items()}, ensure_ascii=False) + ";\n"
    (HERE / "data.js").write_text(js, encoding="utf-8")
    todo = [{"id": r["id"], "date": r["date"], "text": r["text"][:2500]} for r in out if r["id"] not in enrich]
    if todo:  # 新貼文：交給 Claude 分類後存成 enrich/batch-N.json
        (HERE / "enrich" / "in").mkdir(parents=True, exist_ok=True)
        (HERE / "enrich" / "in" / "todo.json").write_text(json.dumps(todo, ensure_ascii=False), encoding="utf-8")
        print(f"未分類 {len(todo)} 篇 → enrich/in/todo.json")
    n_l = sum(r["lesson"] for r in out)
    print(f"with_web={sum(bool(r['links']) for r in out)}")
    print(f"posts={len(out)} lessons={n_l} truncated={sum(r['truncated'] for r in out)} "
          f"undated={sum(not r['date'] for r in out)} with_link={sum(bool(r['href']) for r in out)}")


if __name__ == "__main__":
    main(sys.argv[1:])
