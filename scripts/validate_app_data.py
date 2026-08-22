"""data/app/data.json が src/types.ts の AppData と一致しているかを検証する。

TypeScriptのビルド環境（package.json）は②が持つ予定でまだ無いため、
tscを使わずPythonで構造チェックする。型定義が変わったら、このファイルも
合わせて直すこと（型チェックのロジックは types.ts の手動転記なので二重管理）。

使い方: python scripts/validate_app_data.py （リポジトリルートで実行）
終了コード: 0=一致 / 1=不一致（エラー一覧を標準出力に出す）
"""
import json, re, sys

APP_DATA = "data/app/data.json"

NOTE_KINDS = {"series-break", "real-shortage", "small-sample"}
GAKUDO_AS_OF = {"2023-05-01", "2025-05-01", "2025-10-01"}
AREAS = {"ku", "shi"}

errors = []


def err(path, msg):
    errors.append(f"{path}: {msg}")



def is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def check_note(path, note):
    if not isinstance(note, dict):
        err(path, f"Note は object のはずが {type(note).__name__}")
        return
    kind = note.get("kind")
    if kind not in NOTE_KINDS:
        err(f"{path}.kind", f"NoteKind ではない値: {kind!r}")
    if not isinstance(note.get("text"), str):
        err(f"{path}.text", "string ではない")
    extra = set(note.keys()) - {"kind", "text"}
    if extra:
        err(path, f"Note に無い余分なキー: {sorted(extra)}")


def check_gakudo_stat(path, g, index):
    p = f"{path}[{index}]"
    if g.get("asOf") not in GAKUDO_AS_OF:
        err(f"{p}.asOf", f"3時点のいずれでもない: {g.get('asOf')!r}")
    for k in ("clubs", "registered", "waiting"):
        if not is_number(g.get(k)):
            err(f"{p}.{k}", f"number ではない: {g.get(k)!r}")
    extra = set(g.keys()) - {"asOf", "clubs", "registered", "waiting"}
    if extra:
        err(p, f"GakudoStat に無い余分なキー: {sorted(extra)}")


def check_muni(m, index):
    p = f"munis[{index}]({m.get('name')!r})"
    if not isinstance(m.get("code"), str):
        err(f"{p}.code", "string ではない")
    if not isinstance(m.get("name"), str):
        err(f"{p}.name", "string ではない")
    if m.get("area") not in AREAS:
        err(f"{p}.area", f"'ku'|'shi' ではない: {m.get('area')!r}")

    official = m.get("official")
    if not isinstance(official, list):
        err(f"{p}.official", "array ではない")
    else:
        for i, o in enumerate(official):
            op = f"{p}.official[{i}]"
            if not is_number(o.get("year")):
                err(f"{op}.year", "number ではない")
            grades = o.get("grades")
            if not isinstance(grades, list) or len(grades) != 6:
                err(f"{op}.grades", f"number[6] ではない（長さ {len(grades) if isinstance(grades, list) else type(grades).__name__}）")
            elif not all(is_number(g) for g in grades):
                err(f"{op}.grades", "number 以外の要素を含む")

    entrants = m.get("entrants")
    if not isinstance(entrants, list):
        err(f"{p}.entrants", "array ではない")
    else:
        for i, e in enumerate(entrants):
            ep = f"{p}.entrants[{i}]"
            if not is_number(e.get("year")):
                err(f"{ep}.year", "number ではない")
            if not is_number(e.get("count")):
                err(f"{ep}.count", "number ではない")

    for k in ("baseChildren", "children2023"):
        if not is_number(m.get(k)):
            err(f"{p}.{k}", f"number ではない: {m.get(k)!r}")

    gakudo = m.get("gakudo")
    if not isinstance(gakudo, list) or len(gakudo) == 0:
        err(f"{p}.gakudo", "空でない array ではない")
    else:
        for i, g in enumerate(gakudo):
            check_gakudo_stat(f"{p}.gakudo", g, i)
        as_ofs = [g.get("asOf") for g in gakudo]
        if as_ofs != sorted(as_ofs):
            err(f"{p}.gakudo", f"日付昇順ではない: {as_ofs}（types.ts の指定：新しい順ではなく日付昇順）")

    if "note" in m and m["note"] is not None:
        check_note(f"{p}.note", m["note"])

    allowed = {"code", "name", "area", "official", "entrants",
               "baseChildren", "children2023", "gakudo", "note"}
    extra = set(m.keys()) - allowed
    if extra:
        err(p, f"Muni に無い余分なキー: {sorted(extra)}")


def check_school(s, index, muni_names):
    p = f"schools[{index}]({s.get('id')!r})"
    for k in ("id", "muni", "name", "address"):
        if not isinstance(s.get(k), str):
            err(f"{p}.{k}", "string ではない")
    if s.get("muni") not in muni_names:
        err(f"{p}.muni", f"Muni.name に存在しない自治体名: {s.get('muni')!r}")

    actual = s.get("actual")
    if not isinstance(actual, list) or len(actual) != 3:
        err(f"{p}.actual", f"3ヴィンテージ分の array ではない（長さ {len(actual) if isinstance(actual, list) else type(actual).__name__}）")
    else:
        for i, a in enumerate(actual):
            ap = f"{p}.actual[{i}]"
            if a is None:
                continue
            if not isinstance(a, list) or len(a) != 6:
                err(ap, f"number[6] | null ではない（長さ {len(a) if isinstance(a, list) else type(a).__name__}）")
            elif not all(is_number(v) for v in a):
                err(ap, "number 以外の要素を含む")

    allowed = {"id", "muni", "name", "address", "actual"}
    extra = set(s.keys()) - allowed
    if extra:
        err(p, f"School に無い余分なキー: {sorted(extra)}")


def check_year_count_array(path, arr):
    if not isinstance(arr, list):
        err(path, "array ではない")
        return
    for i, e in enumerate(arr):
        ep = f"{path}[{i}]"
        if not is_number(e.get("year")):
            err(f"{ep}.year", "number ではない")
        if not is_number(e.get("count")):
            err(f"{ep}.count", "number ではない")
        extra = set(e.keys()) - {"year", "count"}
        if extra:
            err(ep, f"無い余分なキー: {sorted(extra)}")


def check_tokyo(tokyo):
    if not isinstance(tokyo, dict):
        err("tokyo", f"object ではない: {type(tokyo).__name__}")
        return
    check_year_count_array("tokyo.firstGraders", tokyo.get("firstGraders"))
    check_year_count_array("tokyo.allGrades", tokyo.get("allGrades"))
    extra = set(tokyo.keys()) - {"firstGraders", "allGrades"}
    if extra:
        err("tokyo", f"TokyoTotal に無い余分なキー: {sorted(extra)}")


def check_backtest(backtest):
    if not isinstance(backtest, list):
        err("backtest", "array ではない")
        return
    horizons = []
    for i, b in enumerate(backtest):
        p = f"backtest[{i}]"
        if b.get("horizon") not in (1, 2):
            err(f"{p}.horizon", f"1|2 ではない: {b.get('horizon')!r}")
        else:
            horizons.append(b["horizon"])
        for k in ("meanPct", "maePct", "p10Pct", "p90Pct", "n"):
            if not is_number(b.get(k)):
                err(f"{p}.{k}", f"number ではない: {b.get(k)!r}")
        allowed = {"horizon", "meanPct", "maePct", "p10Pct", "p90Pct", "n"}
        extra = set(b.keys()) - allowed
        if extra:
            err(p, f"Backtest に無い余分なキー: {sorted(extra)}")
    if sorted(horizons) != horizons or len(set(horizons)) != len(horizons):
        err("backtest", f"horizon が重複または想定外の並び: {horizons}")


DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def check_source(s, index):
    p = f"sources[{index}]({s.get('name')!r})"
    for k in ("name", "provider", "license", "url", "retrievedAt"):
        if not isinstance(s.get(k), str):
            err(f"{p}.{k}", "string ではない")
    if isinstance(s.get("retrievedAt"), str) and not DATE_RE.match(s["retrievedAt"]):
        err(f"{p}.retrievedAt", f"'YYYY-MM-DD' 形式ではない: {s['retrievedAt']!r}")
    allowed = {"name", "provider", "license", "url", "retrievedAt"}
    extra = set(s.keys()) - allowed
    if extra:
        err(p, f"Source に無い余分なキー: {sorted(extra)}")


def main():
    with open(APP_DATA, encoding="utf-8") as f:
        data = json.load(f)

    allowed_top = {"munis", "schools", "tokyo", "backtest", "sources"}
    missing = allowed_top - set(data.keys())
    extra = set(data.keys()) - allowed_top
    if missing:
        err("$", f"AppData に必須のキーが無い: {sorted(missing)}")
    if extra:
        err("$", f"AppData に無い余分なキー: {sorted(extra)}")

    munis = data.get("munis", [])
    if not isinstance(munis, list):
        err("munis", "array ではない")
        munis = []
    for i, m in enumerate(munis):
        check_muni(m, i)

    muni_names = {m.get("name") for m in munis}
    codes = [m.get("code") for m in munis]
    if len(codes) != len(set(codes)):
        err("munis", "code が重複している")
    names = [m.get("name") for m in munis]
    if len(names) != len(set(names)):
        err("munis", "name が重複している")

    schools = data.get("schools", [])
    if not isinstance(schools, list):
        err("schools", "array ではない")
        schools = []
    for i, s in enumerate(schools):
        check_school(s, i, muni_names)

    check_tokyo(data.get("tokyo"))
    check_backtest(data.get("backtest", []))

    sources = data.get("sources", [])
    if not isinstance(sources, list):
        err("sources", "array ではない")
        sources = []
    for i, s in enumerate(sources):
        check_source(s, i)

    if errors:
        print(f"NG: {len(errors)} 件の不一致")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    else:
        print(f"OK: {APP_DATA} は AppData（src/types.ts）と一致")
        print(f"  munis={len(munis)} schools={len(schools)} sources={len(sources)}")
        sys.exit(0)


if __name__ == "__main__":
    main()
