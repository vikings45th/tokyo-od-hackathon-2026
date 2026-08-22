"""Backtest[] を組み立てる（設計書 §5-3。教育人口等推計の予測誤差を実測する）。

入力:
  data/raw/population/R5_result01.csv … 令和5年度版（令和5年度が基準＝実数列）
  data/raw/population/R6_result01.csv … 令和6年度版
  data/raw/population/R7_result01.csv … 令和7年度版（本番の official/baseChildren と同じ版）

出力:
  data/processed/backtest.json … Backtest[]（src/types.ts）

考え方:
  各ヴィンテージの列3（ヘッダ「N（実数）」）は推計ではなく実測値。つまり
  「令和7年度版の令和7年度列」は令和7年度の実数であり、それより古いヴィンテージが
  同じ令和7年度に対して出した推計と突き合わせれば、実際に何%外れたかが分かる。

    horizon=1: 令和6年度版が1年先（令和7年度）に出した推計 vs 令和7年度版の実数
    horizon=2: 令和5年度版が2年先（令和7年度）に出した推計 vs 令和7年度版の実数

  誤差 = (実数 − 推計) / 推計 × 100
  帯（p10/p90）は「未来の推計に対して実数がどれだけ振れるか」を表すため、
  分母は実数ではなく推計（＝これから使う側の値）にしている。

  対象は build_munis.py と同じ49自治体（23区＋多摩26市）に絞る。米シ嶼部・郡部を
  含めると数自治体（人口が小さく年度によって伸び縮みが大きい）が誤差を大きく歪め、
  ヒートマップが実際に使う49自治体の帯としては不正確になるため（設計書 §4-4 の
  「母数不足は対象範囲から除外」と同じ考え方をバックテストにも適用する）。

使い方: python scripts/build_backtest.py （リポジトリルートで実行）
"""
import json, os, statistics

from build_munis import MUNI_CODE, load_result01

RAW_POP = "data/raw/population"
PROCESSED = "data/processed"
TARGET_YEAR = 2025  # 令和7年度。3ヴィンテージがともにこの年度をカバーする直近の年


def totals_by_muni(path):
    return {name: e["total_by_year"] for name, e in load_result01(path).items()}


def error_pct(actual, predicted):
    return (actual - predicted) / predicted * 100


def percentile(sorted_vals, p):
    n = len(sorted_vals)
    k = (n - 1) * p
    f, c = int(k), min(int(k) + 1, n - 1)
    if f == c:
        return sorted_vals[f]
    d = k - f
    return sorted_vals[f] * (1 - d) + sorted_vals[c] * d


def build_horizon(horizon, predicted_totals, actual_totals, names):
    errs = []
    for name in names:
        actual = actual_totals[name].get(TARGET_YEAR)
        predicted = predicted_totals[name].get(TARGET_YEAR)
        if actual is None or predicted is None:
            raise RuntimeError(f"{name}: {TARGET_YEAR}年度の値が見つからない（horizon={horizon}）")
        errs.append(error_pct(actual, predicted))

    n = len(errs)
    vs = sorted(errs)
    return {
        "horizon": horizon,
        "meanPct": round(statistics.mean(errs), 2),
        "maePct": round(statistics.mean(abs(e) for e in errs), 2),
        "p10Pct": round(percentile(vs, 0.10), 2),
        "p90Pct": round(percentile(vs, 0.90), 2),
        "n": n,
    }


def build_backtest():
    names = [name for name, _ in MUNI_CODE.values()]
    r5 = totals_by_muni(f"{RAW_POP}/R5_result01.csv")
    r6 = totals_by_muni(f"{RAW_POP}/R6_result01.csv")
    r7 = totals_by_muni(f"{RAW_POP}/R7_result01.csv")

    return [
        build_horizon(1, r6, r7, names),  # 令和6年度版 → 令和7年度実数
        build_horizon(2, r5, r7, names),  # 令和5年度版 → 令和7年度実数
    ]


def main():
    backtest = build_backtest()
    assert len(backtest) == 2, f"horizon 1・2 の2件のはずが {len(backtest)} 件"
    for b in backtest:
        assert b["n"] == 49, f"horizon={b['horizon']}: 49自治体のはずが {b['n']} 件"

    os.makedirs(PROCESSED, exist_ok=True)
    out_path = f"{PROCESSED}/backtest.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(backtest, f, ensure_ascii=False, indent=1)
    print(f"{out_path}:")
    for b in backtest:
        print(f"  horizon={b['horizon']}: mean={b['meanPct']}% mae={b['maePct']}% "
              f"p10={b['p10Pct']}% p90={b['p90Pct']}% n={b['n']}")


if __name__ == "__main__":
    main()
