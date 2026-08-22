/** FR-1：子の生まれ年月から小1になる年度を決める。射程の判定もここ。 */
import type { AppData } from '../types';
import { EARLY_BIRTH_LAST_MONTH, EARLY_ENTRY_AGE_OFFSET, ENTRY_AGE_OFFSET, FIRST_ENTRY_YEAR } from './constants';

/**
 * 早生まれ（1〜3月生まれ）か。
 * 学校教育法：4月2日〜翌年4月1日生まれが同学年。早生まれは1年早く入学する。
 * 月が未指定・範囲外・非整数のときは false（＝通常の学年として扱う）。
 */
export function isEarlyBirth(birthMonth?: number): boolean {
  return (
    typeof birthMonth === 'number' &&
    Number.isInteger(birthMonth) &&
    birthMonth >= 1 &&
    birthMonth <= EARLY_BIRTH_LAST_MONTH
  );
}

/** 生まれ年に足す年数。早生まれなら +6、それ以外は +7 */
export function entryAgeOffset(birthMonth?: number): number {
  return isEarlyBirth(birthMonth) ? EARLY_ENTRY_AGE_OFFSET : ENTRY_AGE_OFFSET;
}

/**
 * 生まれ年月 → 小1になる年度（西暦）。
 *
 *   entryYearOf(2024, 4) === 2031   4月2日以降生まれ
 *   entryYearOf(2025, 3) === 2031   早生まれ。1年早い
 *   entryYearOf(2025, 4) === 2032
 *   entryYearOf(2024)    === 2031   月を渡さなければ従来どおり +7
 *
 * ⚠️ 月までしか受け取らないので「4月1日生まれ」（法律上は早生まれ）だけは +7 になる。
 */
export function entryYearOf(birthYear: number, birthMonth?: number): number {
  return birthYear + entryAgeOffset(birthMonth);
}

/**
 * entryYearOf の逆。スライダーの初期値づくり用。
 * ⚠️ 早生まれかどうかで1年ずれるので、月が分かっているなら必ず渡すこと。
 *    entryYearOf(birthYearOf(y, m), m) === y が成り立つ。
 */
export function birthYearOf(entryYear: number, birthMonth?: number): number {
  return entryYear - entryAgeOffset(birthMonth);
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
