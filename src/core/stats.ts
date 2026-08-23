/** 小さな統計ヘルパ。依存を増やさないため自前。すべて純関数。 */

/** 線形補間の分位点。q は 0〜1。空配列なら NaN */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 1) return s[0]!;
  const pos = (s.length - 1) * Math.min(Math.max(q, 0), 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo]!;
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

export function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** [min, max] に収める */
export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/** 有限の数値か。NaN / Infinity / null / undefined を弾く */
export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 相加平均。空配列なら NaN */
export function mean(values: readonly number[]): number {
  return values.length === 0 ? NaN : sum(values) / values.length;
}

/** 標本分散（不偏。n-1 で割る）。2点未満なら 0 */
export function variance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return sum(values.map((v) => (v - m) ** 2)) / (values.length - 1);
}

export interface Regression {
  slope: number;
  intercept: number;
  /** 傾きの標準誤差。自由度が無い（点が2つ以下）なら null */
  se: number | null;
  /** 自由度 n − 2 */
  df: number;
  n: number;
}

/**
 * 単回帰（最小二乗）。y = intercept + slope · x。
 *
 * 🔴 2点だと自由度が 0 になり se が出せない（null を返す）。
 *    折れ線を当てたり直近だけ使ったりして誤魔化さないこと（docs/19「豊島区を特別扱いしない」）。
 *    非線形は残差に出て、信頼区間が自動的に広がる。それが正しい表現。
 */
export function linearRegression(points: ReadonlyArray<{ x: number; y: number }>): Regression | null {
  const n = points.length;
  if (n < 2) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xm = mean(xs);
  const ym = mean(ys);
  const sxx = sum(xs.map((x) => (x - xm) ** 2));
  if (!(sxx > 0)) return null; // 全部同じ年 ＝ 傾きが定義できない
  const sxy = sum(points.map((p) => (p.x - xm) * (p.y - ym)));
  const slope = sxy / sxx;
  const intercept = ym - slope * xm;

  const df = n - 2;
  if (df <= 0) return { slope, intercept, se: null, df: 0, n };
  const sse = sum(points.map((p) => (p.y - (intercept + slope * p.x)) ** 2));
  return { slope, intercept, se: Math.sqrt(sse / df / sxx), df, n };
}

/**
 * t分布の片側90%点。既存の予測区間（backtest の p10/p90）と考え方を揃えるため片側10%。
 * 自由度が小さい領域しか使わないので表引きで十分（df=1 で 3.078、∞ で 1.282）。
 */
const T90: Record<number, number> = {
  1: 3.078, 2: 1.886, 3: 1.638, 4: 1.533, 5: 1.476,
  6: 1.440, 7: 1.415, 8: 1.397, 9: 1.383, 10: 1.372,
  12: 1.356, 15: 1.341, 20: 1.325, 30: 1.310,
};
export function tQuantile90(df: number): number {
  if (df <= 0) return NaN;
  if (T90[df] !== undefined) return T90[df]!;
  const keys = Object.keys(T90).map(Number).sort((a, b) => a - b);
  const k = keys.filter((v) => v <= df).pop();
  return df > 30 ? 1.282 : (T90[k ?? 1] ?? 1.282);
}
