/**
 * 予測エンジン（設計書 §5-2）。
 *
 * 自治体別の児童数 N(m,y) を出す。スコアに必要なのはこれだけ。
 *   2025〜2030（令和7〜12）… 都の区市町村別公式推計そのもの        → basis 'official'
 *   2031〜2038（令和13〜20）… 全都の公式推計の伸び率を接続した推定  → basis 'bridged'
 *   2039〜                 … 根拠が無いので算出しない
 *
 * ⚠️ 学校別コーホート＋raking（設計書 §5-1）は未実装。
 *    raking の出力は定義上ここの公式値と一致するので、スコアもヒートマップも数字は変わらない。
 *    実装するときは projectMuni の中身を差し替えるだけでよい。
 */
import type { AppData, Basis, Muni, Projection } from '../types';
import { LOWER_GRADE_COUNT } from './constants';
import { bandFor } from './bands';
import { gradesAt } from './scope';
import { housingDeltaFor, type NormalizedScenario } from './scenario';
import { sum } from './stats';

export interface ForecastContext {
  /** 区市町村別の公式推計がある最後の年度（sample.json では 2030） */
  lastOfficialYear: number;
  /** ここから bridged。＝ lastOfficialYear + 1 */
  bridgeFrom: number;
  /** 全都の全学年児童数。年度 → 人数 */
  tokyoAllGrades: ReadonlyMap<number, number>;
  /** 都の推計が届く最後の年度 */
  lastForecastYear: number;
}

export function buildForecastContext(data: AppData): ForecastContext {
  const officialYears = new Set<number>();
  for (const m of data.munis) for (const o of m.official) officialYears.add(o.year);
  const lastOfficialYear = officialYears.size ? Math.max(...officialYears) : 0;

  const tokyoAllGrades = new Map<number, number>();
  for (const t of data.tokyo.allGrades) tokyoAllGrades.set(t.year, t.count);
  const years = [...tokyoAllGrades.keys()];

  return {
    lastOfficialYear,
    bridgeFrom: lastOfficialYear + 1,
    tokyoAllGrades,
    lastForecastYear: years.length ? Math.max(...years) : lastOfficialYear,
  };
}

export function basisFor(ctx: ForecastContext, year: number): Basis {
  return year <= ctx.lastOfficialYear ? 'official' : 'bridged';
}

/**
 * 1自治体・1年度の児童数予測。射程外なら null。
 *
 * 接続式（設計書 §5-2）：
 *   N(m,y) = N(m,最終公式年) × ( N_全都(y) / N_全都(最終公式年) )
 * 「自前で外挿した」ではなく「都の公式推計どうしを接続した」と言える形。
 */
export function projectMuni(
  muni: Muni,
  year: number,
  ctx: ForecastContext,
  scenario: NormalizedScenario,
  backtest: readonly AppData['backtest'][number][],
): Projection | null {
  if (year > ctx.lastForecastYear) return null;

  const basis = basisFor(ctx, year);
  let children: number;
  let lowerGrades: number;

  const direct = gradesAt(muni, year);
  if (direct && direct.length > 0) {
    children = sum(direct);
    lowerGrades = sum(direct.slice(0, LOWER_GRADE_COUNT));
  } else {
    const anchor = gradesAt(muni, ctx.lastOfficialYear);
    const tokyoNow = ctx.tokyoAllGrades.get(year);
    const tokyoAnchor = ctx.tokyoAllGrades.get(ctx.lastOfficialYear);
    if (!anchor || !tokyoNow || !tokyoAnchor || tokyoAnchor <= 0) return null;
    const ratio = tokyoNow / tokyoAnchor;
    children = sum(anchor) * ratio;
    lowerGrades = sum(anchor.slice(0, LOWER_GRADE_COUNT)) * ratio;
  }

  // 住宅開発ぶんを足す。都の公式係数で人数に変換済み（設計書 §4-5）
  const delta = housingDeltaFor(scenario, muni.name, year);
  children += delta.total;
  lowerGrades += delta.lower;

  return {
    muni: muni.name,
    year,
    basis,
    children,
    lowerGrades,
    band: bandFor(children, backtest, year, basis),
  };
}
