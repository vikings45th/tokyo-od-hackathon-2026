/** 総合スコアの合成（設計書 §3・§6-2） */
import type { IndicatorResult } from '../types';

export interface WeightedResult {
  id: string;
  weight: number;
  result: IndicatorResult | null;
}

/**
 * 総合スコア = Σ(score × weight) / Σ(weight)。
 * null を返した軸は分母からも外す。全部 null なら null（＝データなし。0点ではない）。
 */
export function totalScore(results: readonly WeightedResult[]): number | null {
  let num = 0;
  let den = 0;
  for (const r of results) {
    if (!r.result || !Number.isFinite(r.result.score)) continue;
    num += r.result.score * r.weight;
    den += r.weight;
  }
  if (den <= 0) return null;
  return num / den;
}
