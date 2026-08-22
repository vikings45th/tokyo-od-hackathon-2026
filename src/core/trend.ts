/**
 * 登録率トレンドの実測（設計書 §0-2）と、潜在需要の下限（決定2）。
 * どちらも「定数を捏造せず、都のデータから出す」ためのもの。
 */
import type { AppData } from '../types';
import { DEFAULT_LATENT_FLOOR_Q, GAKUDO_PREV_DATE } from './constants';
import { baseGakudo, gakudoAt, isExcludedFromTrend, isSmallSample, n0Of, rLatentOf } from './scope';
import { quantile } from './stats';

export interface TrendMeasurement {
  /** 年あたりの上昇幅（例 0.0084 ＝ +0.84pt/年） */
  trend: number;
  /** 実測に使った自治体数 */
  n: number;
  /** 2023-05 時点の都計 顕在需要率 */
  rateFrom: number;
  /** 2025-05 時点の都計 顕在需要率 */
  rateTo: number;
  /** 除外した自治体（画面の注記用） */
  excluded: string[];
}

/**
 * 顕在需要率の年あたり上昇幅を、都の3時点データから実測する。
 *
 * 🔴 series-break（江戸川区：141人 → 6,623人）を入れると +20pt/年 という
 *    断絶由来の値になる。必ず除外すること（設計書 §0-1）。
 *    小母数（島嶼部・郡部）も除外する。
 *
 * 実データ48自治体では 0.2423 → 0.2592、2年で +0.0169 ＝ 年 +0.0084 になるはず。
 */
export function measureTrend(data: AppData): TrendMeasurement {
  let regFrom = 0;
  let nFrom = 0;
  let regTo = 0;
  let nTo = 0;
  let n = 0;
  const excluded: string[] = [];

  for (const m of data.munis) {
    if (isExcludedFromTrend(m)) {
      excluded.push(m.name);
      continue;
    }
    const prev = gakudoAt(m, GAKUDO_PREV_DATE);
    const cur = baseGakudo(m);
    const n0 = n0Of(m);
    // children2023 はトレンドの実測にだけ使う値（src/types.ts のコメント）
    const n2023 = m.children2023;
    if (!prev || !cur || n0 <= 0 || !n2023 || n2023 <= 0) continue;

    regFrom += prev.registered + prev.waiting;
    nFrom += n2023;
    regTo += cur.registered + cur.waiting;
    nTo += n0;
    n++;
  }

  if (nFrom <= 0 || nTo <= 0) {
    return { trend: 0, n: 0, rateFrom: NaN, rateTo: NaN, excluded };
  }
  const rateFrom = regFrom / nFrom;
  const rateTo = regTo / nTo;
  // 2023-05 → 2025-05 の2年ぶん
  return { trend: (rateTo - rateFrom) / 2, n, rateFrom, rateTo, excluded };
}

/**
 * 「受け皿の厚い区」の顕在需要率＝ latentFloor の既定値（決定2）。
 *
 * 意味：申込前に断念した人は登録にも待機にも入っていない（要件 §1-2 検証1）。
 * r_latent は需要の下限でしかないので、「抑制された需要が、
 * 受け皿の厚い区並みに満たされたら」を見るための下限として使う。
 *
 * ⚠️ これは新しい仮定。既定シナリオでは使わず、③のトグルで切り替える。
 */
export function latentFloorFromData(data: AppData, q: number = DEFAULT_LATENT_FLOOR_Q): number {
  const rates: number[] = [];
  for (const m of data.munis) {
    if (isSmallSample(m)) continue;
    const r = rLatentOf(m);
    if (r !== null && Number.isFinite(r)) rates.push(r);
  }
  const v = quantile(rates, q);
  return Number.isFinite(v) ? v : 0;
}
