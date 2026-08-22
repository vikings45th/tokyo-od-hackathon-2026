"""東京都教育庁「公立学校統計調査報告書【東京都公立学校一覧】」の
小学校・義務教育学校の CSV を data/raw/schools/ に取得する。

対象データセットは東京都オープンデータカタログ掲載・CC BY 4.0（data/SOURCES.md #5-7）。
gakudou系（data/raw/ 直下）と違い転載不可ファイルを含まないので、
data/raw/schools/ はコミットする（.gitignore で個別に許可）。

取る資料:
  shougakkou_ichiran  … 公立小学校1校1行（School[] の元データ。R5/R6/R7の3年分）
  shougakkou_soukatsu … 自治体別の小学校児童数集計（R5には無い。学校合計の検算用）
  gimu_ichiran         … 義務教育学校1校1行（小学校とは別区分。前期課程の児童数が
                          教育人口等推計の自治体児童数には含まれる。docs/14-basic-design.md §4-1）

ファイル名の付け方が年度ごとに違うので、URLを推測せず
CKAN の package_show でリソース一覧を取ってから選ぶ（scripts/fetch_population.py と同じ方式）。

使い方: python scripts/fetch_schools.py （リポジトリルートで実行）
"""
import json, os, re, time, urllib.request

OUT = "data/raw/schools"
CATALOG_API = "https://catalog.data.metro.tokyo.lg.jp/api/3/action/package_show?id="

# (令和年度, 西暦の基準年, カタログのデータセットID)
VINTAGES = [
    ("R5", 2023, "t000021d2000000176"),
    ("R6", 2024, "t000021d2000000186"),
    ("R7", 2025, "t000021d2000000191"),
]
# resource.url にこの文字列をすべて含み、除外語を含まないものを採用する
WANTED = {
    "shougakkou_ichiran": (["shougakkou", "ichiran"], ["address"]),
    "shougakkou_soukatsu": (["shougakkou", "soukatsu"], ["address"]),
    "gimu_ichiran": (["gimu", "ichiran"], ["address"]),
}


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
        for kind, (include, exclude) in WANTED.items():
            matches = [
                res for res in resources
                if res.get("format", "").upper() == "CSV"
                and all(s in res["url"] for s in include)
                and not any(s in res["url"] for s in exclude)
            ]
            if not matches:
                print(f"--  {era} {kind}: このヴィンテージには無い（想定内。例: R5にsoukatsuは無い）")
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
    print(f"\n{len(manifest)} files -> {OUT}/")


if __name__ == "__main__":
    main()
