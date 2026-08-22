/**
 * 対象範囲の判定と、自治体1件から値を取り出す小さな関数群。
 * 🔴 ここの N0 の定義が指標の分母になる（設計書 §4-1）。
 */
import type { AppData, GakudoStat, Muni } from '../types';
import { BASE_YEAR, GAKUDO_BASE_DATE, SMALL_SAMPLE_N0 } from './constants';
import { sum } from './stats';

/** その年度の学年別児童数（6要素）。無ければ undefined */
export function gradesAt(muni: Muni, year: number): readonly number[] | undefined {
  return muni.official.find((o) => o.year === year)?.grades;
}

/**
 * r_latent の分母 N0 ＝ 2025年度の公立小学校児童数（全学年）。
 *
 * 🔴 `official[2025]` を正とする。`Muni.baseChildren` は出所が別系列（公立学校一覧）で、
 *    実測で 25% ずれている自治体があった（sample.json の品川区）。
 *    分母と N(m,y) が同じ系列でないと、基準年でスコアが狂う。
 *    `baseChildren` は validateAppData の検算にだけ使う。
 */
export function n0Of(muni: Muni): number {
  const g = gradesAt(muni, BASE_YEAR);
  if (g && g.length > 0) return sum(g);
  return muni.baseChildren ?? 0;
}

/** 指定した基準日の学童実績。無ければ undefined */
export function gakudoAt(muni: Muni, asOf: string): GakudoStat | undefined {
  return muni.gakudo.find((g) => g.asOf === asOf);
}

/** 学童実績の基準時点（2025-05-01）。これが Reg / Wait の出どころ */
export function baseGakudo(muni: Muni): GakudoStat | undefined {
  return gakudoAt(muni, GAKUDO_BASE_DATE);
}

/**
 * 顕在需要率 r_latent = (登録 + 待機) / N0（設計書 §4-2）。
 * 計算できなければ null（＝データなし。0 として扱わないこと）。
 */
export function rLatentOf(muni: Muni): number | null {
  const g = baseGakudo(muni);
  const n0 = n0Of(muni);
  if (!g || n0 <= 0) return null;
  return (g.registered + g.waiting) / n0;
}

/**
 * 母数不足か。対象範囲から除外する側（設計書 §4-4）。
 * 🔴 series-break（江戸川区）はここに入れない。あれはトレンド計算からだけ外す。
 */
export function isSmallSample(muni: Muni): boolean {
  if (muni.note?.kind === 'small-sample') return true;
  return n0Of(muni) < SMALL_SAMPLE_N0;
}

/** トレンド実測から外すか（series-break ＋ small-sample。設計書 §0-1・§4-4） */
export function isExcludedFromTrend(muni: Muni): boolean {
  return muni.note?.kind === 'series-break' || isSmallSample(muni);
}

/** 名前で1件引く */
export function findMuni(data: AppData, name: string): Muni | undefined {
  return data.munis.find((m) => m.name === name);
}
