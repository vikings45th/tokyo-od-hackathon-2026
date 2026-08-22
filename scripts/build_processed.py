"""data/raw の東京都福祉局CSVを、機械処理しやすい UTF-8 のtidy CSVへ整形する。

入力: data/raw/*.csv（東京都福祉局「学童クラブ」関連）
出力: data/processed/*.csv（UTF-8 / BOMなし / LF / ヘッダは英語スネークケース）

使い方: python scripts/build_processed.py （リポジトリルートで実行）
"""
import csv, io, os, re

RAW = "data/raw"
OUT = "data/processed"

# 東京都62区市町村の全国地方公共団体コード（5桁）。
# 「行政」欄の通し番号(1-62)をキーにする。CSV側の並びと一致。
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
    50: ("瑞穂町", "13303"), 51: ("日の出町", "13305"), 52: ("檜原村", "13307"),
    53: ("奥多摩町", "13308"), 54: ("大島町", "13361"), 55: ("利島村", "13362"),
    56: ("新島村", "13363"), 57: ("神津島村", "13364"), 58: ("三宅村", "13381"),
    59: ("御蔵島村", "13382"), 60: ("八丈町", "13401"), 61: ("青ヶ島村", "13402"),
    62: ("小笠原村", "13421"),
}
CODE_BY_NAME = {name: code for name, code in MUNI_CODE.values()}

Z2H = str.maketrans("０１２３４５６７８９－―‐−ー（）　",
                    "0123456789-----() ")


def norm(s):
    """全角英数・各種ハイフン・全角スペースを半角へ寄せ、前後の空白を削る。"""
    return s.translate(Z2H).strip()


def read_csv(path, encodings=("utf-8-sig", "cp932")):
    raw = open(os.path.join(RAW, path), "rb").read()
    for enc in encodings:
        try:
            return list(csv.reader(io.StringIO(raw.decode(enc))))
        except UnicodeDecodeError:
            continue
    raise RuntimeError(f"decode failed: {path}")


def write_csv(name, header, rows):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(header)
        w.writerows(rows)
    print(f"{path}: {len(rows)} rows")


def build_clubs():
    """学童クラブ名簿（令和7年5月1日現在） -> 1施設1行"""
    rows = read_csv("学童クラブ名簿（令和7年5月1日現在）.csv")
    out = []
    for r in rows:
        if len(r) < 7 or not r[1].strip().isdigit():
            continue          # タイトル行・ヘッダ行・空行を落とす
        no = int(r[1])
        muni = r[2].strip()
        out.append([
            CODE_BY_NAME.get(muni, ""),   # muni_code
            muni,                          # muni_name
            no,                            # muni_no（都の資料の通し番号）
            r[3].strip(),                  # setup_type: 公設 / 民設
            norm(r[4]),                    # club_name
            norm(r[5]),                    # postal_code
            norm(r[6]),                    # address
        ])
    write_csv("gakudou_clubs_2025-05-01.csv",
              ["muni_code", "muni_name", "muni_no", "setup_type",
               "club_name", "postal_code", "address"], out)


def build_stats():
    """クラブ数・登録児童数・待機児童数を、時点×区市町村のlong形式にまとめる"""
    sources = [("r50501gakudoujoukyou.csv", "2023-05-01"),
               ("20250501.csv", "2025-05-01"),
               ("20251001.csv", "2025-10-01")]
    out = []
    for fname, as_of in sources:
        rows = read_csv(fname)
        for r in rows:
            # 左ブロック(区部): col1..4 / 右ブロック(市町村部): col7..10
            for name_i, club_i in ((1, 2), (7, 8)):
                if len(r) <= club_i + 2:
                    continue
                name = r[name_i].strip()
                if name not in CODE_BY_NAME:
                    continue      # 「区計」「市町村計」「総計」や空行を除外
                nums = [norm(r[club_i]).replace(",", ""),
                        norm(r[club_i + 1]).replace(",", ""),
                        norm(r[club_i + 2]).replace(",", "")]
                if not all(n.isdigit() for n in nums):
                    continue
                out.append([as_of, CODE_BY_NAME[name], name, *map(int, nums)])
    out.sort(key=lambda x: (x[0], x[1]))
    write_csv("gakudou_stats_by_municipality.csv",
              ["as_of", "muni_code", "muni_name",
               "clubs", "registered_children", "waiting_children"], out)


if __name__ == "__main__":
    build_clubs()
    build_stats()
