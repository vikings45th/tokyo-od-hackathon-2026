"""東京都福祉局サイトから学童クラブ・児童館の元データを data/raw/ に取得する。

data/raw/ はリポジトリに含めていない（ライセンスの整理が済むまで。data/README.md 参照）ので、
手元に無いときはこれを実行して取り直す。

使い方: python scripts/fetch_raw.py （リポジトリルートで実行）
"""
import json, os, re, sys, time, urllib.parse, urllib.request

BASE = "https://www.fukushi.metro.tokyo.lg.jp/documents/d/fukushi"
OUT = "data/raw"

# 一覧ページ: https://www.fukushi.metro.tokyo.lg.jp/kodomo/hoiku/gakudou_jidoukan/ichiran
# (id, 何のファイルか) — ファイル名はサーバの Content-Disposition から取る
DOCS = [
    # 学童クラブ数・登録児童数・待機児童数（CSV / オープンデータカタログ掲載・CC BY 4.0）
    ("r50501gakudoujoukyou", "令和5年5月1日現在 CSV"),
    ("20250501", "令和7年5月1日現在 CSV"),
    ("20251001", "令和7年10月1日現在 CSV"),
    # 学童クラブ名簿（CSV / PDF）
    ("2026-03-12-162749-619", "東京都学童クラブ名簿 令和7年5月1日現在 CSV"),
    ("2026-03-12-162707-551", "東京都学童クラブ名簿 令和7年5月1日現在 PDF"),
    # 都道府県表・速報（PDF）
    ("2025-12-22-113118-390", "都道府県表 令和7年5月1日時点 PDF"),
    ("2025-12-22-113218-129", "都道府県表 令和7年10月1日時点 PDF"),
    ("080501sokuhou", "令和8年度5月1日時点 速報値 PDF"),
    ("-6-5-1-", "令和6年5月1日 調査結果 PDF"),
    # 年度別 学童クラブ事業実施状況（PDF）
    ("2026-03-12-162635-475", "令和7年度 学童クラブ事業実施状況 PDF"),
    ("2026-03-12-165622-665", "令和6年度 学童クラブ事業実施状況 PDF"),
    ("2026-03-12-165738-269", "令和5年度 学童クラブ事業実施状況 PDF"),
    ("r4gakudouchousa-pdf", "令和4年度 学童クラブ事業実施状況 PDF"),
    ("2026-03-12-165958-714", "令和3年度 学童クラブ事業実施状況 PDF"),
    # 年度別 児童館実施状況（PDF）
    ("2026-07-28-141439-465", "令和6年度 児童館実施状況 PDF"),
    ("2025-04-07-145803-382", "令和5年度 児童館実施状況 PDF"),
    ("r4jidoukan", "令和4年度 児童館実施状況 PDF"),
    ("r3jidoukanchousa", "令和3年度 児童館実施状況 PDF"),
]


def filename_from(headers, fallback):
    cd = headers.get("Content-Disposition", "")
    m = re.search(r"filename\*=UTF-8''([^;]+)", cd)
    if not m:
        m = re.search(r'filename="?([^";]+)"?', cd)
    name = urllib.parse.unquote(m.group(1)) if m else fallback
    return name.strip().replace("/", "_")


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = []
    for doc_id, label in DOCS:
        url = f"{BASE}/{doc_id}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body, headers = r.read(), r.headers
        except Exception as e:
            print(f"NG  {doc_id}: {e}", file=sys.stderr)
            continue
        fn = filename_from(headers, doc_id)
        with open(os.path.join(OUT, fn), "wb") as f:
            f.write(body)
        manifest.append({
            "id": doc_id, "label": label, "url": url, "file": fn,
            "bytes": len(body),
            "content_type": headers.get("Content-Type", "").split(";")[0],
        })
        print(f"OK  {len(body):>9,} B  {fn}")
        time.sleep(1)          # 都のサーバに負荷をかけない

    with open(os.path.join(OUT, "_manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"\n{len(manifest)}/{len(DOCS)} files -> {OUT}/")


if __name__ == "__main__":
    main()
