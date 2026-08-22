/**
 * 境界B：CoreResult → MuniDetail（薄い射影）。
 * FR-4（詳細）と FR-6（打てる手＝近隣比較）。
 */
import type { AppData, MuniDetail, Scenario } from '../types';
import { ALTERNATIVES_COUNT } from './constants';
import { computeAll, type CoreResult } from './compute';
import { findMuni } from './scope';

/**
 * FR-6「打てる手」の近隣比較。
 *
 * ⚠️ 隣接自治体のデータが手元に無いので、「近隣」＝**同じ area 区分（23区 / 多摩26市）**と定義する。
 *    画面にその旨を明記すること。
 * 比較年度は focusYear。省略時は射程全体の平均スコアで並べる。
 */
function alternativesFor(core: CoreResult, muni: string, focusYear?: number): Array<{ muni: string; score: number }> {
  const self = core.munis.find((m) => m.name === muni);
  if (!self) return [];

  const scoreOf = (name: string): number | null => {
    const rows = core.byMuni.get(name);
    if (!rows) return null;
    if (focusYear !== undefined) return rows.find((r) => r.year === focusYear)?.score ?? null;
    const vals = rows.map((r) => r.score).filter((s): s is number => s !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  return core.munis
    .filter((m) => m.name !== muni && m.area === self.area)
    .map((m) => ({ muni: m.name, score: scoreOf(m.name) }))
    .filter((x): x is { muni: string; score: number } => x.score !== null)
    .sort((a, b) => a.score - b.score)
    .slice(0, ALTERNATIVES_COUNT);
}

/**
 * FR-4：自治体を選んだときの詳細。
 * `focusYear` は契約外の任意引数。渡すと近隣比較がその年度基準になる。
 */
export function buildMuniDetail(
  data: AppData,
  muni: string,
  scenario?: Scenario,
  focusYear?: number,
): MuniDetail {
  const core = computeAll(data, scenario);
  return muniDetailFrom(core, data, muni, focusYear);
}

/** すでに計算済みの CoreResult から作る */
export function muniDetailFrom(
  core: CoreResult,
  data: AppData,
  muni: string,
  focusYear?: number,
): MuniDetail {
  const found = findMuni(data, muni);
  if (!found) throw new Error(`自治体が見つかりません: ${muni}`);

  const rows = core.byMuni.get(muni) ?? [];
  const series = rows
    .filter((r) => r.score !== null && r.projection !== null)
    .map((r) => ({
      year: r.year,
      basis: r.basis,
      score: r.score as number,
      demand: r.detail.demand ?? 0,
      supply: r.detail.supply ?? 0,
      gap: r.detail.gap ?? 0,
      targetRate: r.detail.rTarget ?? 0,
      band: r.projection!.band,
    }));

  const note = core.notes.get(muni);
  return {
    muni: found,
    series,
    ...(note ? { note } : {}),
    alternatives: alternativesFor(core, muni, focusYear),
  };
}
