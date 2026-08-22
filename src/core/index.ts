/**
 * ②ロジック担当の公開API（境界B）。③はここだけを import する。
 *
 * 契約は docs/15-interfaces.md §3 と src/types.ts。
 * 詳しい前提と注意は src/core/README.md を読むこと。
 */

// ── 境界Bの3本（docs/15-interfaces.md §3 で3人合意済み） ──
export { buildHeatmap, heatmapFrom } from './heatmap';
export { buildMuniDetail, muniDetailFrom } from './muniDetail';
export { entryYearOf, birthYearOf, entryAgeOffset, isEarlyBirth, entryYearRange, lastForecastYear, isInRange } from './entryYear';

// ── 画面に「根拠」を出すために③が使うもの ──
export { measureTrend, latentFloorFromData, type TrendMeasurement } from './trend';
export { validateAppData, type ValidationReport } from './validate';
export { PRESET_SCENARIOS, normalizeScenario, type PresetScenario, type NormalizedScenario } from './scenario';
export { DEFAULT_TREND, RATE_CAP, BASE_YEAR, HOUSING_COEFF, BRIDGED_WIDEN } from './constants';

// ── 再計算を避けたいとき（ヒートマップと詳細を同時に描くなど） ──
export { computeAll, type CoreResult, type CoreCell } from './compute';

// ── 軸の追加（要件 FR-9） ──
export { INDICATORS } from './indicators';
