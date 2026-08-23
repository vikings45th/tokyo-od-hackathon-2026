/**
 * バックテスト（設計書 §5-3・docs/19 依頼4）。
 *
 * 画面 S5 の「1年先 0.93% / 2年先 1.37%（49自治体）」は、
 * **応募作品の中でほぼ唯一「自分の予測が当たるかを自分で測った」主張**です。
 * その数字が `data/app/data.json` にハードコードされているだけだと検算できないので、
 * ここに純関数として置き、`npm test` で再現できるようにしています。
 *
 * ⚠️ 前処理側にも同じ計算があります（`scripts/build_backtest.py`）。
 *    そちらは元CSVを直接読み `data/processed/backtest.json` を生成します。
 *    **数値は一致します**（`__tests__` で assert 済み）。
 *    元CSVはカタログ掲載・CC BY 4.0 なのでコミット可能ですが、
 *    いまは `.gitignore` の `data/raw/` に入っています。
 */
import type { Backtest, BacktestInput } from '../types';
import { mean, quantile } from './stats';

/** 誤差 = (実数 − 推計) / 推計 × 100 [%] */
export function errorPct(actual: number, predicted: number): number {
  return ((actual - predicted) / predicted) * 100;
}

/** 小数2桁に丸める。前処理（Python 側）の round(x, 2) と揃えるため */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * 誤差分布を horizon ごとに集計する。
 *
 * 🔴 **分母は実数ではなく推計です。** 帯は「これから使う推計値に掛ける」ものなので、
 *    推計を基準にした相対誤差でないと意味が合いません（設計書 §5-3）。
 *
 * 実数と推計の両方が揃う自治体だけを使い、その件数を `n` に入れます。
 * 母数不足の島嶼部・郡部は入力の時点で除いておくこと（49自治体。設計書 §4-4 と同じ考え方）。
 */
export function computeBacktest(input: BacktestInput): Backtest[] {
  const out: Backtest[] = [];

  for (const { horizon, byMuni } of input.predicted ?? []) {
    const errs: number[] = [];
    for (const [muni, predicted] of Object.entries(byMuni ?? {})) {
      const actual = input.actual?.[muni];
      if (!Number.isFinite(actual) || !Number.isFinite(predicted) || predicted === 0) continue;
      errs.push(errorPct(actual as number, predicted));
    }
    if (errs.length === 0) continue;

    out.push({
      horizon,
      meanPct: round2(mean(errs)),
      maePct: round2(mean(errs.map(Math.abs))),
      p10Pct: round2(quantile(errs, 0.1)),
      p90Pct: round2(quantile(errs, 0.9)),
      n: errs.length,
    });
  }

  return out.sort((a, b) => a.horizon - b.horizon);
}
