"""東京都教育庁「教育人口等推計」の区市町村別 CSV を data/raw/population/ に取得する。

対象データセットは東京都オープンデータカタログ掲載・CC BY 4.0（data/SOURCES.md #2-4）。
gakudou系（data/raw/ 直下）と違い転載不可ファイルを含まないので、
data/raw/population/ はコミットする（.gitignore で個別に許可）。

ファイル名の付け方が年度ごとに違う（例: R6だけ末尾に "_c" が付く）ので、
URLを推測せず CKAN の package_show でリソース一覧を取ってから選ぶ。

使い方: python scripts/fetch_population.py （リポジトリルートで実行）
"""
import json, os, re, time, urllib.request

OUT = "data/raw/population"
CATALOG_API = "https://catalog.data.metro.tokyo.lg.jp/api/3/action/package_show?id="

# (令和年度, 西暦の基準年, カタログのデータセットID)
VINTAGES = [
    ("R5", 2023, "t000021d2000000178"),
    ("R6", 2024, "t000021d2000000189"),
    ("R7", 2025, "t000021d2000000193"),
]
# 資料名の中でこの文字列を含む resource.url を採用する
# result01 = 区市町村・学年別の複数年度推計。survey = 住宅種別×学年別の児童発生率
WANTED = {"result01": re.compile(r"result01"), "survey": re.compile(r"survey")}


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = []
    for era, base_year, pkg_id in VINTAGES:
        pkg = fetch_json(CATALOG_API + pkg_id)
        resources = pkg["result"]["resources"]
        for kind, pattern in WANTED.items():
            matches = [res for res in resources
                       if res.get("format", "").upper() == "CSV" and pattern.search(res["url"])]
            if not matches:
                print(f"NG  {era} {kind}: リソースが見つからない")
                continue
            res = matches[0]
            req = urllib.request.Request(res["url"], headers={"User-Agent": "Mozilla/5.0"})
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    body = r.read()
            except Exception as e:
                print(f"NG  {era} {kind}: {e}")
                continue
            fn = f"{era}_{kind}.csv"
            with open(os.path.join(OUT, fn), "wb") as f:
                f.write(body)
            manifest.append({
                "vintage": era, "base_year": base_year, "resource": kind,
                "url": res["url"], "catalog_url": f"https://catalog.data.metro.tokyo.lg.jp/dataset/{pkg_id}",
                "file": fn, "bytes": len(body),
            })
            print(f"OK  {len(body):>8,} B  {fn}")
            time.sleep(1)

    with open(os.path.join(OUT, "_manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"\n{len(manifest)}/{len(VINTAGES) * len(WANTED)} files -> {OUT}/")


if __name__ == "__main__":
    main()
