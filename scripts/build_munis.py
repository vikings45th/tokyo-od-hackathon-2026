"""Muni[] を組み立てる（49自治体：23区＋多摩26市）。

入力:
  data/raw/population/R5_result01.csv  … 令和5年度版 教育人口等推計（区市町村×学年×複数年度）
  data/raw/population/R7_result01.csv  … 令和7年度版 同上（本番の official/entrants/baseChildren の元）
  data/processed/gakudou_stats_by_municipality.csv … 学童3時点（build_processed.py が生成）

出力:
  data/processed/munis.json … Muni[]（src/types.ts）。data/app/data.json への統合は
  schools/tokyo/backtest が揃ってから行う（docs/15-interfaces.md）。

抽出ルール（data/sample.json の中央区の値と突き合わせて確認済み）:
  baseChildren   = R7版の「小学校,計」列7（実数）
  children2023   = R5版の「小学校,計」列5（実数）
  official[]     = R7版の「小学校,１〜６年生」列7〜12（年 = 列の西暦そのもの）
  entrants[]     = R7版の「就学予定者,０年後」列7〜12（年 = 列の西暦 + 1 が入学年度）

注記（note）は本来 生成AI③ が担当（docs/14-basic-design.md §7）。
ここでは判定ルール（kind）は決定論的に計算し、文面は暫定でこのスクリプトが書く。
実際のAI③生成に差し替える場合は compute_note() の text だけ置き換えればよい。

使い方: python scripts/build_munis.py （リポジトリルートで実行）
"""
import csv, io, json, os, re

from notes_text import NOTES_TEXT

RAW_POP = "data/raw/population"
PROCESSED = "data/processed"

# 23区 + 多摩26市（1-49）。build_processed.py の MUNI_CODE と同じ値の部分集合。
MUNI_CODE = {
    1: ("千代田区", "13101"), 2: ("中央区", "13102"), 3: ("港区", "13103"),
    4: ("新宿区", "13104"), 5: ("文京区", "13105"), 6: ("台東区", "13106"),
    7: ("墨田区", "13107"), 8: ("江東区", "13108"), 9: ("品川区", "13109"),
    10: ("目黒区", "13110"), 11: ("大田区", "13111"), 12: ("世田谷区", "13112"),
    13: ("渋谷区", "13113"), 14: ("中野区", "13114"), 15: ("杉並区", "13115"),
    16: ("豊島区", "13116"), 17: ("北区", "13117"), 18: ("荒川区", "13118"),
    19: ("板橋区", "13119"), 20: ("練馬区", "13120"), 21: ("足立区", "13121"),
    22: ("葛飾区", "13122"), 23: ("江戸川区", "13123"),
    24: ("八王子市", "13201"), 25: ("立川市", "13202"), 26: ("武蔵野市", "13203"),
    27: ("三鷹市", "13204"), 28: ("青梅市", "13205"), 29: ("府中市", "13206"),
    30: ("昭島市", "13207"), 31: ("調布市", "13208"), 32: ("町田市", "13209"),
    33: ("小金井市", "13210"), 34: ("小平市", "13211"), 35: ("日野市", "13212"),
    36: ("東村山市", "13213"), 37: ("国分寺市", "13214"), 38: ("国立市", "13215"),
    39: ("福生市", "13218"), 40: ("狛江市", "13219"), 41: ("東大和市", "13220"),
    42: ("清瀬市", "13221"), 43: ("東久留米市", "13222"), 44: ("武蔵村山市", "13223"),
    45: ("多摩市", "13224"), 46: ("稲城市", "13225"), 47: ("羽村市", "13227"),
    48: ("あきる野市", "13228"), 49: ("西東京市", "13229"),
}
CODE_BY_NAME = {name: code for name, code in MUNI_CODE.values()}
AREA_BY_NAME = {name: ("ku" if no <= 23 else "shi") for no, (name, _) in MUNI_CODE.items()}
GRADE_ROWS = ["１年生", "２年生", "３年生", "４年生", "５年生", "６年生"]

SERIES_BREAK_RATIO = 3.0   # 2023-05→2025-05 の registered 変化がこれ以上なら断絶とみなす
SMALL_SAMPLE_N0 = 500      # 対象49自治体では通常発生しない（島嶼部・郡部は既にスコープ外）


def read_csv(path):
    raw = open(path, "rb").read()
    for enc in ("utf-8-sig", "cp932"):
        try:
            return list(csv.reader(io.StringIO(raw.decode(enc))))
        except UnicodeDecodeError:
            continue
    raise RuntimeError(f"decode failed: {path}")


def year_columns(header):
    """ヘッダ行から {列index: 西暦年} を作る。「(特別学級...)」列は除く。"""
    cols = {}
    for i, cell in enumerate(header):
        if i < 3 or "特別学級" in cell:
            continue
        m = re.match(r"^(\d+)", cell.strip())
        if m:
            cols[i] = int(m.group(1)) + 2018  # 令和N年度 = 西暦(N+2018)年度
    return cols


def load_result01(path):
    """区市町村名 -> {grades_by_year, total_by_year, entrants_by_year}"""
    rows = read_csv(path)
    header, body = rows[0], rows[1:]
    cols = year_columns(header)
    out = {}
    for r in body:
        if len(r) < 3:
            continue
        muni, cat, sub = r[0].strip(), r[1].strip(), r[2].strip()
        if muni not in CODE_BY_NAME:
            continue  # 全都・区部・市町村部などの集計行、島嶼部・郡部を除外
        entry = out.setdefault(muni, {
            "grades_by_year": {}, "total_by_year": {}, "entrants_by_year": {},
        })
        if cat == "小学校" and sub == "計":
            for i, year in cols.items():
                v = r[i].strip() if i < len(r) else ""
                if v.isdigit():
                    entry["total_by_year"][year] = int(v)
        elif cat == "小学校" and sub in GRADE_ROWS:
            g = GRADE_ROWS.index(sub)
            for i, year in cols.items():
                v = r[i].strip() if i < len(r) else ""
                if v.isdigit():
                    entry["grades_by_year"].setdefault(year, [None] * 6)[g] = int(v)
        elif cat == "就学予定者" and sub == "０年後":
            for i, year in cols.items():
                v = r[i].strip() if i < len(r) else ""
                if v.isdigit():
                    entry["entrants_by_year"][year + 1] = int(v)  # 入学年度 = 列の年+1
    return out


def load_gakudo():
    path = f"{PROCESSED}/gakudou_stats_by_municipality.csv"
    rows = read_csv(path)
    by_muni = {}
    for r in rows[1:]:
        as_of, _muni_code, muni_name, clubs, registered, waiting = r
        if muni_name not in CODE_BY_NAME:
            continue  # 島嶼部・郡部は49自治体の対象外
        by_muni.setdefault(muni_name, []).append({
            "asOf": as_of, "clubs": int(clubs),
            "registered": int(registered), "waiting": int(waiting),
        })
    for name, points in by_muni.items():
        points.sort(key=lambda g: g["asOf"])  # 日付昇順
    return by_muni


def r_latent(gakudo, base_children):
    """2025-05-01時点の顕在需要率 = (登録+待機) / N0"""
    pt = next((g for g in gakudo if g["asOf"] == "2025-05-01"), None)
    if pt is None or not base_children:
        return None
    return (pt["registered"] + pt["waiting"]) / base_children


def is_series_break(gakudo):
    p23 = next((g for g in gakudo if g["asOf"] == "2023-05-01"), None)
    p25 = next((g for g in gakudo if g["asOf"] == "2025-05-01"), None)
    if not p23 or not p25 or p23["registered"] == 0:
        return False
    ratio = p25["registered"] / p23["registered"]
    return ratio >= SERIES_BREAK_RATIO or ratio <= 1 / SERIES_BREAK_RATIO


def build_munis():
    r7 = load_result01(f"{RAW_POP}/R7_result01.csv")
    r5 = load_result01(f"{RAW_POP}/R5_result01.csv")
    gakudo_by_muni = load_gakudo()

    munis = []
    for no in range(1, 50):
        name, code = MUNI_CODE[no]
        r7e, r5e = r7.get(name), r5.get(name)
        if not r7e or not r5e:
            raise RuntimeError(f"{name}: R5/R7 教育人口等推計データが見つからない")
        gakudo = gakudo_by_muni.get(name)
        if not gakudo:
            raise RuntimeError(f"{name}: 学童データが見つからない")

        official = [{"year": y, "grades": r7e["grades_by_year"][y]}
                    for y in sorted(r7e["grades_by_year"])]
        entrants = [{"year": y, "count": c}
                    for y, c in sorted(r7e["entrants_by_year"].items())]
        base_children = r7e["total_by_year"].get(2025)
        children_2023 = r5e["total_by_year"].get(2023)

        if any(None in o["grades"] for o in official):
            raise RuntimeError(f"{name}: official に欠測学年がある")
        if not base_children or not children_2023:
            raise RuntimeError(f"{name}: baseChildren/children2023 が取れない")
        if base_children < SMALL_SAMPLE_N0:
            raise RuntimeError(f"{name}: N0={base_children} が想定外に小さい（要確認）")

        # baseChildren（「小学校,計」列7）と official[2025].grades（学年別6行）の合計は
        # 同一CSV内の値なので必ず一致するはず。ズレたら抽出ロジック側のバグを疑う
        # （2026-08-22: 品川区で25.1%のズレが報告された件の再発防止チェック）。
        grades_2025 = next((o["grades"] for o in official if o["year"] == 2025), None)
        if grades_2025 is not None:
            grades_sum = sum(grades_2025)
            if grades_sum != base_children:
                raise RuntimeError(
                    f"{name}: baseChildren({base_children}) != sum(official[2025].grades)"
                    f"({grades_sum})。R7_result01.csv の「小学校,計」行と「小学校,学年別」行の"
                    f"抜き出しがズレている可能性がある"
                )

        munis.append({
            "code": code, "name": name, "area": AREA_BY_NAME[name],
            "official": official, "entrants": entrants,
            "baseChildren": base_children, "children2023": children_2023,
            "gakudo": gakudo,
        })

    attach_notes(munis)
    return munis


def attach_notes(munis):
    """kind の判定は決定論的ルール（このファイル）で確定させ、text（文面）は
    生成AI③が事前に書いたものを notes_text.py から取る（設計書 §7）。
    series-break はまずトレンド計算からの除外対象として確定させ、
    real-shortage の「下位20%」はそれを除いた48自治体で判定する（設計書 §4-4）。"""
    latents = {}
    series_break_names = set()
    for m in munis:
        if is_series_break(m["gakudo"]):
            series_break_names.add(m["name"])
        lat = r_latent(m["gakudo"], m["baseChildren"])
        if lat is not None:
            latents[m["name"]] = lat

    ranked = sorted(
        (name for name in latents if name not in series_break_names),
        key=lambda n: latents[n],
    )
    cutoff = max(1, round(len(ranked) * 0.2))
    bottom20 = set(ranked[:cutoff])

    for m in munis:
        name = m["name"]
        wait25 = next((g["waiting"] for g in m["gakudo"] if g["asOf"] == "2025-05-01"), 0)

        if name in series_break_names:
            kind = "series-break"
        elif name in bottom20 and wait25 > 0:
            kind = "real-shortage"
        else:
            continue

        text = NOTES_TEXT.get(m["code"])
        if text is None:
            raise RuntimeError(
                f"{name}（{m['code']}）: kind='{kind}' と判定されましたが "
                f"scripts/notes_text.py に文面がありません。生成AI③で追記してください。"
            )
        m["note"] = {"kind": kind, "text": text}


def main():
    munis = build_munis()
    assert len(munis) == 49, f"49自治体のはずが {len(munis)} 件"
    os.makedirs(PROCESSED, exist_ok=True)
    out_path = f"{PROCESSED}/munis.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(munis, f, ensure_ascii=False, indent=1)
    notes = [(m["name"], m["note"]["kind"]) for m in munis if "note" in m]
    print(f"{out_path}: {len(munis)} munis")
    print("notes:", notes)


if __name__ == "__main__":
    main()
