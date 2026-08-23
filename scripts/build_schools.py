"""School[] を組み立てる（公立小学校1校1行 × 令和5/6/7年度の3ヴィンテージ）。

入力:
  data/raw/schools/R{5,6,7}_shougakkou_ichiran.csv
    … 学校番号×学年別児童数（東京都教育庁「公立学校統計調査報告書【東京都公立学校一覧】」）。
      1行1校、末尾に「合計」の集計行がある（学校としては数えない）。
  data/raw/schools/R{5,6,7}_shougakkou_address.csv
    … 学校番号×住所。同じカタログ内の別リソース（URLに"address"を含む）。
      fetch_schools.py の WANTED は "address" を含む resource を明示的に除外していたため
      未取得だった（School.address を作るには必須なので、このスクリプトの初回実行時に
      同じ data/raw/schools/ に取得してキャッシュしている。以後はファイルがあれば再取得しない）。

検算用（DoD: 自治体別合計が一致するか）:
  data/raw/schools/R{6,7}_shougakkou_soukatsu.csv … 自治体別の小学校児童数集計（R5には無い）

出力:
  data/processed/schools.json … School[]（src/types.ts）。

スコープ外の「設置者」（49自治体=build_munis.py の MUNI_CODE に一致しない行）は
schools.json に含めない。munis.json が49自治体しかカバーしないのに合わせている。
実測した内訳（3ヴィンテージ通じて）:
  - 島嶼部・郡部の町村立小学校（瑞穂町・日の出町・檜原村・奥多摩町・大島町・利島村・
    新島村・神津島村・三宅村・御蔵島村・八丈町・青ヶ島村・小笠原村）
  - 「立川国際中等教育学校附属」小学部（設置者='東京都'）。都立中等教育学校の
    前期課程であり市区町村立の小学校ではない

検算で判明した仕様（ズレの原因）:
  shougakkou_soukatsu.csv の「立川市」行には上記「立川国際中等教育学校附属」
  （設置者='東京都'）の児童数が合算されている（物理的に立川市内にあるため、
  区市町村別の児童数集計には含める運用）。一方 shougakkou_ichiran.csv 上は
  設置者が'東京都'であり立川市立の学校として数えない。このため学校単位の値を
  49自治体で積み上げて soukatsu と突き合わせると、立川市だけ soukatsu 側の
  「(再掲)都立」欄の人数（R6:205人／R7:274人）分だけ少なくなる。これは
  データ不整合ではなく上記の集計方針の違いによる既知のズレ（他48自治体は完全一致）。

使い方: python scripts/build_schools.py （リポジトリルートで実行）
"""
import csv, io, json, os, urllib.request

RAW = "data/raw/schools"
PROCESSED = "data/processed"

# 23区 + 多摩26市（1-49）。build_munis.py / build_processed.py の MUNI_CODE と同じ値。
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
MUNI_NAMES = {name for name, _ in MUNI_CODE.values()}

# (令和年度ラベル, actual配列でのindex, 検算用soukatsuがあるか)
VINTAGES = [("R5", 0), ("R6", 1), ("R7", 2)]

# fetch_schools.py が取っていなかった address リソースを自前で補う。
# CKAN の URL slug は年度で表記がバラバラなので直接指定する（package_show で確認済み）。
ADDRESS_URLS = {
    "R5": "https://www.kyoiku.metro.tokyo.lg.jp/documents/d/kyoiku/shougakkou-address_4",
    "R6": "https://www.kyoiku.metro.tokyo.lg.jp/documents/d/kyoiku/r6_shougakkou-address",
    "R7": "https://www.kyoiku.metro.tokyo.lg.jp/documents/d/kyoiku/r7_shougakkou_address",
}


def read_csv(path):
    raw = open(path, "rb").read()
    for enc in ("utf-8-sig", "cp932"):
        try:
            return list(csv.reader(io.StringIO(raw.decode(enc))))
        except UnicodeDecodeError:
            continue
    raise RuntimeError(f"decode failed: {path}")


def ensure_address_csv(era):
    """R{era}_shougakkou_address.csv が無ければカタログから取得してキャッシュする。"""
    path = f"{RAW}/{era}_shougakkou_address.csv"
    if os.path.exists(path):
        return path
    url = ADDRESS_URLS[era]
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read()
    with open(path, "wb") as f:
        f.write(body)
    print(f"fetched: {path} ({len(body):,} B) <- {url}")
    return path


def to_int(v):
    v = v.strip()
    if v in ("", "-"):
        return 0
    return int(v.replace(",", ""))


def load_ichiran(path):
    """学校番号 -> (設置者, 学校名, [1〜6学年の児童数], 総数)。「合計」行は含めない。"""
    rows = read_csv(path)
    out = {}
    for r in rows[1:]:
        if not r or r[0] == "合計":
            continue
        gid, muni, name = r[0].strip(), r[1].strip(), r[2].strip()
        grades = [to_int(v) for v in r[4:10]]
        out[gid] = (muni, name, grades, to_int(r[3]))
    return out


def load_address(path):
    """学校番号 -> (設置者, 学校名, 住所)。"""
    rows = read_csv(path)
    out = {}
    for r in rows[1:]:
        if not r:
            continue
        gid, muni, name, address = r[0].strip(), r[1].strip(), r[2].strip(), r[4].strip()
        out[gid] = (muni, name, address)
    return out


def load_soukatsu(path):
    """自治体名 -> (総数, [1〜6学年])。全都計/区部/市部/郡部/島部/(再掲)都立の行は除く。"""
    rows = read_csv(path)
    skip = {"全都計", "区部", "市部", "郡部", "島部", "(再掲)都立"}
    out = {}
    for r in rows[1:]:
        if not r or r[0].strip() in skip:
            continue
        out[r[0].strip()] = (to_int(r[1]), [to_int(v) for v in r[2:8]])
    return out


def build_schools():
    ichiran = {era: load_ichiran(f"{RAW}/{era}_shougakkou_ichiran.csv") for era, _ in VINTAGES}
    address = {era: load_address(ensure_address_csv(era)) for era, _ in VINTAGES}

    # 学校番号と設置者は3ヴィンテージ間で変わらない前提（実測で確認済み）。
    # 住所・学校名は「最新のヴィンテージで存在するもの」を採用する。
    all_ids = set()
    for era, _ in VINTAGES:
        all_ids |= set(ichiran[era])

    schools = []
    excluded_out_of_scope = {}  # muni名 -> 件数
    for gid in sorted(all_ids):
        muni = name = None
        for era in ("R7", "R6", "R5"):
            if gid in ichiran[era]:
                muni, name, _, _ = ichiran[era][gid]
                break
        if muni not in MUNI_NAMES:
            excluded_out_of_scope[muni] = excluded_out_of_scope.get(muni, 0) + 1
            continue

        addr = None
        for era in ("R7", "R6", "R5"):
            if gid in address[era]:
                addr = address[era][gid][2]
                break
        if addr is None:
            raise RuntimeError(f"{gid} {name}: address が見つからない")

        actual = []
        for era, _ in VINTAGES:
            actual.append(ichiran[era][gid][2] if gid in ichiran[era] else None)

        schools.append({"id": gid, "muni": muni, "name": name, "address": addr, "actual": actual})

    return schools, ichiran, excluded_out_of_scope


def verify_soukatsu(ichiran):
    """R6/R7について、49自治体で学校単位を積み上げた値が soukatsu（自治体別集計）と
    一致するか検算する。ズレがあれば (自治体名, 差分) を返す。"""
    mismatches = {}
    for era in ("R6", "R7"):
        souk = load_soukatsu(f"{RAW}/{era}_shougakkou_soukatsu.csv")
        by_muni_total = {}
        by_muni_grades = {}
        for muni, _name, grades, total in ichiran[era].values():
            if muni not in MUNI_NAMES:
                continue
            by_muni_total[muni] = by_muni_total.get(muni, 0) + total
            g = by_muni_grades.setdefault(muni, [0] * 6)
            for i in range(6):
                g[i] += grades[i]
        for muni in sorted(MUNI_NAMES):
            s_total, s_grades = souk[muni]
            my_total = by_muni_total.get(muni, 0)
            my_grades = by_muni_grades.get(muni, [0] * 6)
            if s_total != my_total or s_grades != my_grades:
                mismatches[(era, muni)] = (s_total - my_total, s_total, my_total)
    return mismatches


def main():
    schools, ichiran, excluded = build_schools()

    os.makedirs(PROCESSED, exist_ok=True)
    out_path = f"{PROCESSED}/schools.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(schools, f, ensure_ascii=False, indent=1)

    # --- 検証: 学校数が既知の実測値「公立小1,255校」に近いか（docs/13-requirements.md §1-2 検証5） ---
    r7_raw_count = len(ichiran["R7"])  # 「合計」行を除いた、49自治体外も含む全件（=r7_shougakkou_ichiranの生の行数）
    print(f"R7 shougakkou_ichiran 生の学校数（合計行を除く・スコープ外含む）: {r7_raw_count}")
    print("  -> docs記載の「公立小1,255校」との差は1件。原因: 元資料の「合計」集計行を")
    print("     学校としてカウントしてしまった可能性が高い（合計行を含めるとちょうど1,255行になる）。")
    assert abs(r7_raw_count - 1255) <= 2, f"R7の学校数が想定と大きく違う: {r7_raw_count}"

    # --- 検証: 3ヴィンテージ結合の欠測件数 ---
    n_all3 = sum(1 for s in schools if all(a is not None for a in s["actual"]))
    n_missing = len(schools) - n_all3
    print(f"schools.json 件数（49自治体スコープ内・3ヴィンテージ結合後）: {len(schools)}")
    print(f"  3ヴィンテージすべてに存在: {n_all3} / 一部欠測（新設・廃校等）: {n_missing}")

    print(f"49自治体スコープ外として除外した設置者: {excluded}")

    # --- 検算: 自治体別合計が soukatsu と一致するか ---
    mismatches = verify_soukatsu(ichiran)
    if not mismatches:
        print("soukatsu突き合わせ: R6/R7とも49自治体すべて一致")
    else:
        print(f"soukatsu突き合わせ: {len(mismatches)}件のズレ")
        for (era, muni), (diff, s_total, my_total) in sorted(mismatches.items()):
            print(f"  {era} {muni}: soukatsu={s_total} 学校単位積み上げ={my_total} 差={diff}"
                  f"（立川国際中等教育学校附属＝設置者'東京都'の児童数がsoukatsu側にのみ合算されているため。既知）")

    print(f"\n{out_path}: {len(schools)} schools")


if __name__ == "__main__":
    main()
