/**
 * ②ロジック担当の公開API（境界B）。③はここだけを import する。
 *
 * 契約は docs/15-interfaces.md §3 と src/types.ts。
 * 詳しい前提と注意は src/core/README.md を読むこと。
 */

// ── 境界Bの3本（docs/15-interfaces.md §3 で3人合意済み） ──
export { buildHeatmap, heatmapFrom } from './heatmap';
export { buildMuniDetail, muniDetailFrom, bandsFor } from './muniDetail';
export { entryYearOf, birthYearOf, entryAgeOffset, isEarlyBirth, entryYearRange, lastForecastYear, isInRange } from './entryYear';

// ── 画面に「根拠」を出すために③が使うもの ──
export { measureTrend, latentFloorFromData, type TrendMeasurement } from './trend';
export { validateAppData, type ValidationReport } from './validate';
export { PRESET_SCENARIOS, normalizeScenario, type PresetScenario, type NormalizedScenario } from './scenario';
export { DEFAULT_TREND, RATE_CAP, BASE_YEAR, HOUSING_COEFF, BRIDGED_WIDEN, MIN_TREND_POINTS } from './constants';
// 自治体別トレンドの材料（③が「この区の傾きは実測か、都平均か」を出すため。docs/19 依頼3）
export { childrenSeriesOf, rLatentSeriesOf, type ChildrenSource, type RatePoint } from './scope';

// ── 再計算を避けたいとき（ヒートマップと詳細を同時に描くなど） ──
export { computeAll, type CoreResult, type CoreCell } from './compute';

// ── バックテスト（DoD#3：画面の誤差の数字を検算できるようにする） ──
export { computeBacktest, errorPct } from './backtest';

// ── 軸の追加（要件 FR-9） ──
export { INDICATORS } from './indicators';
