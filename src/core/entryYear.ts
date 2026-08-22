/** FR-1：子の生まれ年から小1になる年度を決める。射程の判定もここ。 */
import type { AppData } from '../types';
import { ENTRY_AGE_OFFSET, FIRST_ENTRY_YEAR } from './constants';

/**
 * 生まれ年 → 小1になる年度（西暦）。
 * 例：2024年生まれ → 2031年度（要件 §5 UC-1）。
 * ⚠️ 1〜3月生まれは実際には1年早い。画面で注記すること。
 */
export function entryYearOf(birthYear: number): number {
  return birthYear + ENTRY_AGE_OFFSET;
}

/** entryYearOf の逆。スライダーの初期値づくり用。 */
export function birthYearOf(entryYear: number): number {
  return entryYear - ENTRY_AGE_OFFSET;
}

/** 都の全都推計が届く最後の年度。ここを越えたら根拠が無い（設計書 §5-2） */
export function lastForecastYear(data: AppData): number {
  const ys = data.tokyo.allGrades.map((x) => x.year);
  return ys.length ? Math.max(...ys) : FIRST_ENTRY_YEAR;
}

/** ヒートマップの列。FIRST_ENTRY_YEAR 〜 都の推計が届く最後の年度 */
export function entryYearRange(data: AppData): number[] {
  const last = lastForecastYear(data);
  const out: number[] = [];
  for (let y = FIRST_ENTRY_YEAR; y <= last; y++) out.push(y);
  return out;
}

/** 射程内か。射程外は「セルを描かない」（設計書 §10） */
export function isInRange(data: AppData, year: number): boolean {
  return year >= FIRST_ENTRY_YEAR && year <= lastForecastYear(data);
}
