/**
 * 対象範囲の判定と、自治体1件から値を取り出す小さな関数群。
 * 🔴 ここの N0 の定義が指標の分母になる（設計書 §4-1）。
 */
import type { AppData, GakudoStat, Muni } from '../types';
import {
  BASE_YEAR,
  CHILDREN_FALLBACK_DATES,
  CHILDREN_SERIES_TOLERANCE,
  GAKUDO_BASE_DATE,
  SCHOOL_VINTAGE_DATES,
  SMALL_SAMPLE_N0,
} from './constants';
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

// ── 自治体別トレンドの材料（docs/19 依頼3） ──────────────────────

/** 分母にどの系列を使ったか。画面の注記に出す */
export type ChildrenSource = 'childrenSeries' | 'schools' | 'official';

export interface ChildrenSeries {
  points: Array<{ asOf: string; count: number }>;
  source: ChildrenSource;
}

/** schools[] の自治体別・ヴィンテージ別合計。AppData ごとに1回だけ作る */
const schoolTotalsCache = new WeakMap<AppData, Map<string, Map<string, number>>>();

function schoolTotals(data: AppData): Map<string, Map<string, number>> {
  const hit = schoolTotalsCache.get(data);
  if (hit) return hit;

  const byMuni = new Map<string, Map<string, number>>();
  for (const s of data.schools ?? []) {
    if (!s?.muni || !Array.isArray(s.actual)) continue;
    let row = byMuni.get(s.muni);
    if (!row) byMuni.set(s.muni, (row = new Map()));
    s.actual.forEach((grades, i) => {
      const asOf = SCHOOL_VINTAGE_DATES[i];
      if (!asOf || !Array.isArray(grades)) return;
      row!.set(asOf, (row!.get(asOf) ?? 0) + sum(grades));
    });
  }
  schoolTotalsCache.set(data, byMuni);
  return byMuni;
}

/**
 * トレンドの分母（公立小学校児童数）の年次系列。
 *
 * 🔴 **系列は混ぜない。** 優先順にどれか1本をまるごと選ぶ。
 *    `children2023`（教育人口等推計）と `schools`（公立学校一覧）は出所が別で、
 *    5自治体で食い違う（品川区は 14,417 vs 18,041＝25%）。混ぜると傾きが嘘になる。
 *
 *   1. `muni.childrenSeries` … ①が入れたら最優先
 *   2. `data.schools[].actual` … [令和5,6,7]＝2023/2024/2025 の3点
 *   3. 2点だけ … `children2023` と `official[2025]`（＝今日のデータ。傾きは引けない）
 */
export function childrenSeriesOf(data: AppData, muni: Muni): ChildrenSeries {
  const own = (muni.childrenSeries ?? []).filter((p) => p?.asOf && p.count > 0);
  if (own.length >= 2) {
    return { points: [...own].sort((a, b) => a.asOf.localeCompare(b.asOf)), source: 'childrenSeries' };
  }

  const n0 = n0Of(muni);
  const fromSchools = schoolTotals(data).get(muni.name);
  if (fromSchools && fromSchools.size >= 2) {
    const points = [...fromSchools.entries()]
      .filter(([, count]) => count > 0)
      .map(([asOf, count]) => ({ asOf, count }))
      .sort((a, b) => a.asOf.localeCompare(b.asOf));
    // 🔴 名簿が抜粋でも形は正しいまま通る。基準年で official[2025] と桁が合うことを確かめる
    const atBase = fromSchools.get(CHILDREN_FALLBACK_DATES[1]) ?? 0;
    const plausible = n0 > 0 && atBase > 0 && Math.abs(atBase / n0 - 1) <= CHILDREN_SERIES_TOLERANCE;
    if (points.length >= 2 && plausible) return { points, source: 'schools' };
  }

  const points: Array<{ asOf: string; count: number }> = [];
  if (muni.children2023 > 0) points.push({ asOf: CHILDREN_FALLBACK_DATES[0], count: muni.children2023 });
  if (n0 > 0) points.push({ asOf: CHILDREN_FALLBACK_DATES[1], count: n0 });
  return { points, source: 'official' };
}

export interface RatePoint {
  asOf: string;
  /** 回帰の説明変数。西暦の実数（2024-05-01 → 2024.33） */
  t: number;
  /** 顕在需要率 (登録 + 待機) / 児童数 */
  rate: number;
}

/** 'YYYY-MM-DD' → 西暦の実数。日付の粒度が混ざっても傾きが年あたりになる */
export function yearFraction(asOf: string): number {
  const [y, m, d] = asOf.split('-').map(Number);
  if (!y) return NaN;
  return y + ((m ?? 1) - 1) / 12 + ((d ?? 1) - 1) / 365;
}

/**
 * 顕在需要率の年次系列。**分子と分母が両方揃う時点だけ**を返す（docs/19 依頼3-2）。
 *
 * 今日のデータでは学童が 2023-05 / 2025-05 / 2025-10 の3時点で、
 * 2025-10 に対応する児童数が無いので落ちる。結果 2点＝傾きは引けない（フォールバックへ）。
 * ①が学童 2024-05 を1点足すと 3点になり、最小二乗が成立する。
 */
export function rLatentSeriesOf(data: AppData, muni: Muni): { points: RatePoint[]; source: ChildrenSource } {
  const { points: denom, source } = childrenSeriesOf(data, muni);
  const byDate = new Map(denom.map((p) => [p.asOf, p.count]));

  const points: RatePoint[] = [];
  for (const g of muni.gakudo ?? []) {
    const children = byDate.get(g.asOf);
    if (!children || children <= 0) continue;
    const t = yearFraction(g.asOf);
    if (!Number.isFinite(t)) continue;
    points.push({ asOf: g.asOf, t, rate: (g.registered + g.waiting) / children });
  }
  points.sort((a, b) => a.t - b.t);
  return { points, source };
}
