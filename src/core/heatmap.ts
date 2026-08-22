/**
 * 境界B：CoreResult → Heatmap（薄い射影）。
 * ③が形を変えたくなったら、直すのはこのファイルだけ。
 */
import type { AppData, Heatmap, HeatmapCell, Scenario } from '../types';
import { computeAll, type CoreResult } from './compute';

/** focusYear のスコア降順。null（データなし）は末尾 */
function sortMunis(core: CoreResult, focusYear: number): string[] {
  const scoreAt = (name: string): number | null =>
    core.byMuni.get(name)?.find((c) => c.year === focusYear)?.score ?? null;

  return core.munis
    .map((m) => m.name)
    .sort((a, b) => {
      const sa = scoreAt(a);
      const sb = scoreAt(b);
      if (sa === null && sb === null) return a.localeCompare(b, 'ja');
      if (sa === null) return 1;
      if (sb === null) return -1;
      if (sb !== sa) return sb - sa;
      return a.localeCompare(b, 'ja');
    });
}

/**
 * FR-2・FR-3：49自治体 × 入学年度のヒートマップ。
 *
 * - `munis` … 対象内の自治体だけ（既定ソート＝focusYear のスコア降順）
 * - `cells` … 除外自治体のぶんも入れる。③が別枠に値を出せるように。`excluded` で区別
 * - `score: null` は「データなし」。🔴 0点として扱わないこと
 * - `bridgeFrom` … この年度から basis が 'bridged'。③は視覚的に区切る（要件 NFR-5）
 */
export function buildHeatmap(data: AppData, focusYear: number, scenario?: Scenario): Heatmap {
  const core = computeAll(data, scenario);
  return heatmapFrom(core, focusYear);
}

/** すでに計算済みの CoreResult から作る（再計算を避けたいとき） */
export function heatmapFrom(core: CoreResult, focusYear: number): Heatmap {
  const cells: HeatmapCell[] = core.cells.map((c) => ({
    muni: c.muni,
    year: c.year,
    score: c.score,
    basis: c.basis,
    excluded: c.excluded,
  }));

  return {
    munis: sortMunis(core, focusYear),
    years: [...core.years],
    cells,
    focusYear,
    bridgeFrom: core.bridgeFrom,
    excludedMunis: core.excludedMunis.map((e) => ({ ...e })),
  };
}
