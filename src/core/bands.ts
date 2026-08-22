/**
 * 予測区間（設計書 §5-3）。
 *
 * 🔴 実測できるのは1年先と2年先だけ。推計ヴィンテージが令和5・6・7の3世代しかない。
 *    それ以降は外挿。bridged 区間は測っていない。
 *    **測っていないことを測ったように書かないこと。** 家の購入判断に使わせる以上の最低条件。
 */
import type { Backtest, Basis } from '../types';
import { BASE_YEAR, BRIDGED_WIDEN } from './constants';

export interface BandPct {
  /** 誤差分布の10パーセンタイル（%） */
  p10: number;
  /** 誤差分布の90パーセンタイル（%） */
  p90: number;
  /** この帯がどこから来たか。画面の注記に使う */
  provenance: 'measured' | 'extrapolated' | 'bridged';
}

function pick(backtest: readonly Backtest[], horizon: 1 | 2): Backtest | undefined {
  return backtest.find((b) => b.horizon === horizon);
}

/**
 * 基準年からの年数 h と basis から、誤差帯（%）を出す。
 *   h ≤ 1        … 1年先の実測値
 *   h = 2        … 2年先の実測値
 *   h > 2        … 2年先の帯を √(h/2) で拡大（外挿）
 *   bridged      … 上記をさらに BRIDGED_WIDEN 倍（測っていない区間）
 */
export function bandPctFor(backtest: readonly Backtest[], year: number, basis: Basis): BandPct {
  const h = Math.max(0, year - BASE_YEAR);
  const b1 = pick(backtest, 1);
  const b2 = pick(backtest, 2);
  const base = h <= 1 ? (b1 ?? b2) : (b2 ?? b1);
  if (!base) return { p10: 0, p90: 0, provenance: 'measured' };

  let p10 = base.p10Pct;
  let p90 = base.p90Pct;
  let provenance: BandPct['provenance'] = 'measured';

  if (h > 2) {
    const widen = Math.sqrt(h / 2);
    p10 *= widen;
    p90 *= widen;
    provenance = 'extrapolated';
  }
  if (basis === 'bridged') {
    p10 *= BRIDGED_WIDEN;
    p90 *= BRIDGED_WIDEN;
    provenance = 'bridged';
  }
  return { p10, p90, provenance };
}

/** 児童数の予測区間。誤差は % なので中央値に掛ける */
export function bandFor(
  children: number,
  backtest: readonly Backtest[],
  year: number,
  basis: Basis,
): { lo: number; hi: number } {
  const { p10, p90 } = bandPctFor(backtest, year, basis);
  return { lo: children * (1 + p10 / 100), hi: children * (1 + p90 / 100) };
}
