import type { AppData } from '../../types';
import sample from '../../../data/sample.json';

/** data/sample.json（6自治体18校・実測値ベース）。書き換え防止のため凍結して渡す */
export const appData = Object.freeze(sample as unknown as AppData);

export function scoreAt(
  cells: Array<{ muni: string; year: number; score: number | null }>,
  muni: string,
  year: number,
): number | null {
  return cells.find((c) => c.muni === muni && c.year === year)?.score ?? null;
}
