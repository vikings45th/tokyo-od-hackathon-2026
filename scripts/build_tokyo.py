"""TokyoTotal を組み立てる（全都・令和7〜20年度。src/types.ts）。

入力:
  data/raw/population/R7_result01.csv … 令和7年度版 教育人口等推計。
  「全都」の行だけを使う（区市町村別は build_munis.py が別に扱う）。

出力:
  data/processed/tokyo.json … TokyoTotal（src/types.ts）。

抽出ルール:
  firstGraders[] = 「全都,小学校,１年生」行の列7〜20（西暦2025〜2038）
  allGrades[]    = 「全都,小学校,計」　行の列7〜20（同上）

bridged区間（令和14年度以降）の接続に使う（設計書 §5-2）。区市町村別の伸びの差は
失われるが、全都の伸び率だけなら令和20年度まで公式推計がある。

使い方: python scripts/build_tokyo.py （リポジトリルートで実行）
"""
import csv, io, json, os, re

RAW_POP = "data/raw/population"
PROCESSED = "data/processed"


def read_csv(path):
    raw = open(path, "rb").read()
    for enc in ("utf-8-sig", "cp932"):
        try:
            return list(csv.reader(io.StringIO(raw.decode(enc))))
        except UnicodeDecodeError:
            continue
    raise RuntimeError(f"decode failed: {path}")


def year_columns(header):
    """ヘッダ行から {列index: 西暦年} を作る。「(特別学級...)」列は除く。
    build_munis.py の同名関数と同じルール（教育人口等推計CSVは局が共通で使う様式）。"""
    cols = {}
    for i, cell in enumerate(header):
        if i < 3 or "特別学級" in cell:
            continue
        m = re.match(r"^(\d+)", cell.strip())
        if m:
            cols[i] = int(m.group(1)) + 2018  # 令和N年度 = 西暦(N+2018)年度
    return cols


def build_tokyo():
    rows = read_csv(f"{RAW_POP}/R7_result01.csv")
    header, body = rows[0], rows[1:]
    cols = year_columns(header)

    by_row = {}
    for r in body:
        if len(r) < 3 or r[0].strip() != "全都":
            continue
        by_row[(r[1].strip(), r[2].strip())] = r

    def series(cat, sub):
        r = by_row.get((cat, sub))
        if r is None:
            raise RuntimeError(f"全都,{cat},{sub} の行が見つからない")
        out = []
        for i, year in sorted(cols.items()):
            v = r[i].strip() if i < len(r) else ""
            if not v.isdigit():
                continue
            out.append({"year": year, "count": int(v)})
        return out

    return {
        "firstGraders": series("小学校", "１年生"),
        "allGrades": series("小学校", "計"),
    }


def main():
    tokyo = build_tokyo()
    assert len(tokyo["allGrades"]) == 14, f"令和7〜20年度で14件のはずが {len(tokyo['allGrades'])} 件"
    assert len(tokyo["firstGraders"]) == 14, f"令和7〜20年度で14件のはずが {len(tokyo['firstGraders'])} 件"
    os.makedirs(PROCESSED, exist_ok=True)
    out_path = f"{PROCESSED}/tokyo.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(tokyo, f, ensure_ascii=False, indent=1)
    print(f"{out_path}: firstGraders {len(tokyo['firstGraders'])}件 / allGrades {len(tokyo['allGrades'])}件")
    print("firstGraders[0..2]:", tokyo["firstGraders"][:3])
    print("allGrades[0..2]:", tokyo["allGrades"][:3])


if __name__ == "__main__":
    main()
