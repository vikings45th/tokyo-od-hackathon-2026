/**
 * 境界B：CoreResult → MuniDetail（薄い射影）。
 * FR-4（詳細）と FR-6（打てる手＝近隣比較）。
 */
import type { AppData, MuniDetail, MuniTrend, Scenario } from '../types';
import { ALTERNATIVES_COUNT, BASE_YEAR, RATE_CAP } from './constants';
import { computeAll, type CoreCell, type CoreResult } from './compute';
import { findMuni } from './scope';
import { clamp } from './stats';

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
    .map((r) => {
      const { demandBand, gapBand } = bandsFor(r, core);
      return {
        year: r.year,
        basis: r.basis,
        score: r.score as number,
        demand: r.detail.demand ?? 0,
        supply: r.detail.supply ?? 0,
        gap: r.detail.gap ?? 0,
        targetRate: r.detail.rTarget ?? 0,
        // 🔴 band は児童数の帯。需要の帯は demandBand（③の申し送り・docs/17 依頼B）
        band: r.projection!.band,
        demandBand,
        gapBand,
      };
    });

  const note = core.notes.get(muni);
  return {
    muni: found,
    series,
    trend: rows[0]?.trend ?? core.trend.byMuni.get(muni) ?? unknownTrend(core),
    ...(note ? { note } : {}),
    alternatives: alternativesFor(core, muni, focusYear),
  };
}

function unknownTrend(core: CoreResult): MuniTrend {
  const t = core.trend;
  return {
    slope: null, nPoints: 0, se: null, used: t.trend,
    ciLo: Math.min(t.slopeP10, t.trend), ciHi: Math.max(t.slopeP90, t.trend),
    fallback: true, denominator: 'official',
  };
}

/**
 * 🔴 需要と不足人数の予測区間（docs/19 依頼3-4）。**依頼の本丸。**
 *
 * これまでの `demandBand` は `band × rTarget`、つまり**児童数の推計誤差しか入っていなかった。**
 * ところが設計書 §0-2 が自分で書いているとおり、このモデルを支配しているのは
 * 登録率トレンドの方（trend=0 にすると49自治体中45が0点になる）。
 * 支配的な不確実性が入っていないものを「予測区間」と呼ぶのは、この作品の
 * 「測っていないことを測ったように書かない」に反する。
 *
 * ## 合成の方法：相対誤差の二乗和平方根（RSS）
 *
 *   relN = (band.lo − children) / children        児童数の相対誤差（backtest 由来・負）
 *   relR = (rLo − rTarget) / rTarget              登録率の相対不確かさ（負）
 *   demandBand.lo = demand × (1 − √(relN² + relR²))
 *
 * **なぜ単純な `band.lo × rLo` にしないか**：独立な2つの10%点を掛けると、積の分布では
 * およそ2〜3%点に相当する。「p10の帯」と称して実質p2の帯を出すことになり、過大。
 * 独立と仮定した一次近似としては RSS が標準。**独立と仮定していること自体が仮定**である
 * （児童数が伸びる区は登録率も上がる、という相関はあり得る）。実測できていないので
 * ここでは独立とした。
 *
 * ## 傾きの帯の中心
 *
 * ③のスライダーで `trend` を明示されたときは、**帯の幅は実測のまま、中心だけスライダー値へ移す。**
 * 「どれだけ知らないか」はデータの性質で、シナリオを変えても変わらないため。
 *
 * ## ③へ
 *
 * `CoreResult` から直接描くとき（`src/ui/Series.tsx` のように `MuniDetail` を経由しないとき）は
 * これを呼んでください。**`band.lo * rTarget` を自前で計算するとトレンドの不確かさが落ちます。**
 *
 * ```ts
 * const { demandBand, gapBand } = bandsFor(cell, core);
 * ```
 */
export function bandsFor(
  r: CoreCell,
  core: CoreResult,
): { demandBand: { lo: number; hi: number }; gapBand: { lo: number; hi: number } } {
  const demand = r.detail.demand ?? 0;
  const supply = r.detail.supply ?? 0;
  const rTarget = r.detail.rTarget ?? 0;
  const children = r.detail.children ?? 0;
  const band = r.projection!.band;

  const flat = { lo: demand, hi: demand };
  if (!(demand > 0) || !(children > 0) || !(rTarget > 0)) {
    return { demandBand: flat, gapBand: { lo: Math.max(demand - supply, 0), hi: Math.max(demand - supply, 0) } };
  }

  // 傾きの帯。幅は実測のまま、中心は実際に使った傾きに合わせる
  const t = r.trend;
  const applied = core.scenario.trendExplicit ? core.scenario.trend : t.used;
  const ciLo = applied - (t.used - t.ciLo);
  const ciHi = applied + (t.ciHi - t.used);

  const h = r.year - BASE_YEAR;
  const rBase = Math.max(r.detail.rLatent ?? 0, core.scenario.latentFloor);
  const rLo = clamp(rBase + ciLo * h, 0, RATE_CAP);
  const rHi = clamp(rBase + ciHi * h, 0, RATE_CAP);

  const relNLo = (band.lo - children) / children;
  const relNHi = (band.hi - children) / children;
  const relRLo = (rLo - rTarget) / rTarget;
  const relRHi = (rHi - rTarget) / rTarget;

  const demandBand = {
    lo: demand * (1 - Math.hypot(relNLo, relRLo)),
    hi: demand * (1 + Math.hypot(relNHi, relRHi)),
  };
  return {
    demandBand,
    gapBand: {
      // 供給は推定ではなく仮定なので誤差帯を持たない。需要の帯から引くだけ
      lo: Math.max(demandBand.lo - supply, 0),
      hi: Math.max(demandBand.hi - supply, 0),
    },
  };
}
