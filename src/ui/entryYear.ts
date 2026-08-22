/**
 * 生年月 → 小1になる年度。
 *
 * ⚠️ 暫定ラッパーです。②に依頼A（`entryYearOf(birthYear, birthMonth?)`）を出しており、
 *    それが入ったら **このファイルを消して `../core` の `entryYearOf` を直接呼びます。**
 *
 * 学校教育法：4月2日〜翌年4月1日生まれが同学年。
 * 1〜3月生まれ（早生まれ・全体の約1/4）は入学年度が1年早い。
 * いまの②の実装は生まれ年しか受け取らず常に +7 なので、ここで1年戻しています。
 */
import { entryYearOf as coreEntryYearOf } from '../core';

/** ②の実装が生まれ月に対応済みかを実際に呼んで確かめる（依頼Aが入ったら true になる） */
const CORE_SUPPORTS_MONTH =
  (coreEntryYearOf as (y: number, m?: number) => number)(2025, 3) === 2031;

export function entryYearOf(birthYear: number, birthMonth: number): number {
  const fn = coreEntryYearOf as (y: number, m?: number) => number;
  if (CORE_SUPPORTS_MONTH) return fn(birthYear, birthMonth);
  return birthMonth <= 3 ? fn(birthYear) - 1 : fn(birthYear);
}

/** 早生まれ扱いか（画面の注記用） */
export const isEarlyBirth = (birthMonth: number): boolean => birthMonth <= 3;
