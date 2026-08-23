/**
 * 登録率トレンドの実測（設計書 §0-2）と、潜在需要の下限（決定2）。
 * どちらも「定数を捏造せず、都のデータから出す」ためのもの。
 */
import type { AppData, Muni, MuniTrend } from '../types';
import {
  DEFAULT_LATENT_FLOOR_Q,
  GAKUDO_PREV_DATE,
  MIN_TREND_POINTS,
  TREND_CI_Q,
} from './constants';
import {
  baseGakudo,
  gakudoAt,
  isExcludedFromTrend,
  isSmallSample,
  n0Of,
  rLatentOf,
  rLatentSeriesOf,
} from './scope';
import { linearRegression, mean, median, quantile, tQuantile90, variance } from './stats';

export interface TrendMeasurement {
  /** 年あたりの上昇幅（例 0.0081 ＝ +0.81pt/年）。都計比。③の画面 S5 が表示している値 */
  trend: number;
  /** 実測に使った自治体数 */
  n: number;
  /** 2023-05 時点の都計 顕在需要率 */
  rateFrom: number;
  /** 2025-05 時点の都計 顕在需要率 */
  rateTo: number;
  /** 除外した自治体（画面の注記用） */
  excluded: string[];

  // ── ここから下は docs/19 依頼3-5 で追加。既存フィールドは1つも壊していない ──

  /** 自治体名 → その自治体の傾きの推定結果 */
  byMuni: Map<string, MuniTrend>;
  /** 自治体別の傾きの中央値。診断・画面表示用（🔴 フォールバックには使わない。下記） */
  medianSlope: number;
  /** 自治体別の傾きの p10 / p90。フォールバック時の信頼区間になる */
  slopeP10: number;
  slopeP90: number;
  /** 傾きを自前で引けた自治体数。今日のデータでは 0（時点が2つしかないため） */
  measuredCount: number;
  /** 自治体別回帰に使えた時点数の中央値。今日は 2 */
  points: number;
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

  const ok = nFrom > 0 && nTo > 0;
  const rateFrom = ok ? regFrom / nFrom : NaN;
  const rateTo = ok ? regTo / nTo : NaN;
  // 2023-05 → 2025-05 の2年ぶん
  const trend = ok ? (rateTo - rateFrom) / 2 : 0;

  return { trend, n: ok ? n : 0, rateFrom, rateTo, excluded, ...byMuniTrends(data, trend) };
}

// ── 自治体別トレンド（docs/19 依頼3-2 / 3-3 / 3-6） ────────────────

/** 1自治体ぶんの素の推定結果。プールを作るために先に全件出す */
interface RawSlope {
  muni: Muni;
  slope: number | null;
  se: number | null;
  df: number;
  nPoints: number;
  source: MuniTrend['denominator'];
  /** 自前の傾きを採用してよいか（点が足りている・系列断絶でない） */
  usable: boolean;
}

function rawSlopeOf(data: AppData, muni: Muni): RawSlope {
  const { points, source } = rLatentSeriesOf(data, muni);
  const reg = linearRegression(points.map((p) => ({ x: p.t, y: p.rate })));
  const usable =
    reg !== null &&
    reg.se !== null &&
    points.length >= MIN_TREND_POINTS &&
    !isExcludedFromTrend(muni);
  return {
    muni,
    slope: reg?.slope ?? null,
    se: reg?.se ?? null,
    df: reg?.df ?? 0,
    nPoints: points.length,
    source,
    usable,
  };
}

/**
 * 全自治体の傾きを推定する。
 *
 * 手順：
 *   1. 各自治体で最小二乗（分子と分母が両方揃う時点だけ）
 *   2. 自前で引けた自治体（3点以上・系列断絶でない）は縮約推定で都平均へ寄せる
 *   3. 引けなかった自治体は `fallback: true`。傾きは都計の実測値、
 *      信頼区間は**自治体間のばらつき**（傾きの p10 / p90）
 *
 * 🔴 **フォールバックの傾きに `medianSlope` を使わない。** 画面に出ているのは
 *    `trend`（都計比・+0.81pt）なので、そちらに揃える。自治体別の傾きの中央値
 *    （+0.88pt）と 0.07pt 違うが、**同じ意味の数字を2つ持つと必ずずれる**
 *    （docs/19 依頼7 で③が指摘したのと同じ理由）。差は docs に明記する。
 */
function byMuniTrends(
  data: AppData,
  tokyoTrend: number,
): Pick<TrendMeasurement, 'byMuni' | 'medianSlope' | 'slopeP10' | 'slopeP90' | 'measuredCount' | 'points'> {
  const raws = data.munis.map((m) => rawSlopeOf(data, m));

  // プールは「系列断絶でない自治体の、引けた傾き」。2点しか無くても傾き自体は出るので
  // ばらつきの見積もりには使える（フォールバックの信頼区間の材料）
  const pool = raws
    .filter((r) => r.slope !== null && !isExcludedFromTrend(r.muni))
    .map((r) => r.slope as number);
  const medianSlope = pool.length ? median(pool) : tokyoTrend;
  const slopeP10 = pool.length > 1 ? quantile(pool, TREND_CI_Q) : tokyoTrend;
  const slopeP90 = pool.length > 1 ? quantile(pool, 1 - TREND_CI_Q) : tokyoTrend;

  const shrink = shrinkageFor(raws);

  const byMuni = new Map<string, MuniTrend>();
  for (const r of raws) {
    if (r.usable && r.slope !== null && r.se !== null) {
      const { slope, se } = shrink(r.slope, r.se);
      const half = tQuantile90(r.df) * se;
      byMuni.set(r.muni.name, {
        slope: r.slope,
        nPoints: r.nPoints,
        se: r.se,
        used: slope,
        ciLo: slope - half,
        ciHi: slope + half,
        fallback: false,
        denominator: r.source,
      });
    } else {
      byMuni.set(r.muni.name, {
        slope: r.slope,
        nPoints: r.nPoints,
        se: r.se,
        used: tokyoTrend,
        // 自治体間のばらつきを不確かさとして当てる。都の値が外に出ないよう包む
        ciLo: Math.min(slopeP10, tokyoTrend),
        ciHi: Math.max(slopeP90, tokyoTrend),
        fallback: true,
        denominator: r.source,
      });
    }
  }

  const nPointsList = raws.map((r) => r.nPoints);
  return {
    byMuni,
    medianSlope,
    slopeP10,
    slopeP90,
    measuredCount: raws.filter((r) => r.usable).length,
    points: nPointsList.length ? median(nPointsList) : 0,
  };
}

/**
 * 縮約推定（docs/19 依頼3-6）。**時点数が少ないほど都平均に寄せる。**
 *
 *   τ²   = max(0, var(b) − mean(se²))     分散分解：自治体差の真の分散
 *   w(m) = τ² / (τ² + se(m)²)             自前の推定をどれだけ信じるか
 *   b*   = w·b + (1−w)·b̄
 *
 * 信頼区間も同じ重みで縮める（事後標準偏差 se·√w）。
 * 🔴 これを入れないと、3点（自由度1）で引いた極端な傾きがそのまま13年外挿される。
 *    実測：2点で引くと江戸川区が年 +585%、13年で ×7.4e10 になる。
 *    「時点数が5に満たないので、推定の不確かさに応じて都平均へ寄せている」と説明できる形。
 */
function shrinkageFor(raws: readonly RawSlope[]): (slope: number, se: number) => { slope: number; se: number } {
  const usable = raws.filter((r) => r.usable && r.slope !== null && r.se !== null);
  if (usable.length < 2) return (slope, se) => ({ slope, se });

  const slopes = usable.map((r) => r.slope as number);
  const ses = usable.map((r) => r.se as number);
  const grand = mean(slopes);
  const tau2 = Math.max(0, variance(slopes) - mean(ses.map((v) => v * v)));

  return (slope, se) => {
    const w = tau2 / (tau2 + se * se);
    if (!Number.isFinite(w)) return { slope, se };
    return { slope: w * slope + (1 - w) * grand, se: se * Math.sqrt(w) };
  };
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
