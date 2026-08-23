/**
 * ★内部の正規形。ここが計算の本体で、Heatmap / MuniDetail はここからの薄い射影。
 *
 * ③が出力の形を変えたくなったら、直すのは heatmap.ts / muniDetail.ts だけでよい。
 * 予測・スコアのロジックには触らせない。
 */
import type { AppData, Basis, Muni, MuniTrend, Note, Projection, Scenario } from '../types';
import { entryYearRange } from './entryYear';
import { buildForecastContext, projectMuni, type ForecastContext } from './forecast';
import { INDICATORS } from './indicators';
import { buildNoteContext, isExcludedFromScope, resolveNote } from './notes';
import { normalizeScenario, type NormalizedScenario } from './scenario';
import { totalScore, type WeightedResult } from './score';
import { measureTrend, type TrendMeasurement } from './trend';

export interface CoreCell {
  muni: string;
  year: number;
  basis: Basis;
  /** 総合スコア。null は「データなし」。🔴 0点として扱わないこと */
  score: number | null;
  /** true なら対象範囲外。ヒートマップの色計算に入れない */
  excluded: boolean;
  projection: Projection | null;
  /** 軸ごとの結果。v1 は gakudo 1件 */
  indicators: WeightedResult[];
  /** 軸1の detail をそのまま（画面の詳細表示用） */
  detail: Record<string, number>;
  /** この自治体に当てた登録率トレンド。予測区間と注記に使う（docs/19 依頼3） */
  trend: MuniTrend;
}

export interface CoreResult {
  /** 列（入学年度） */
  years: number[];
  /** この年度から basis が 'bridged' */
  bridgeFrom: number;
  /** クランプ済みのシナリオ。画面に「実際に使われた値」を出すため */
  scenario: NormalizedScenario;
  /** 対象内の自治体（元の順） */
  munis: Muni[];
  cells: CoreCell[];
  byMuni: Map<string, CoreCell[]>;
  notes: Map<string, Note>;
  excludedMunis: Array<{ muni: string; note: Note }>;
  /** 実測トレンド。③が「既定値の根拠」を出すため（要件 NFR-5） */
  trend: TrendMeasurement;
  forecast: ForecastContext;
}

/** byMuni に居ない自治体（データ不整合）用の保険。都の実測値をそのまま当てる */
function fallbackTrendOf(t: TrendMeasurement): MuniTrend {
  return {
    slope: null,
    nPoints: 0,
    se: null,
    used: t.trend,
    ciLo: Math.min(t.slopeP10, t.trend),
    ciHi: Math.max(t.slopeP90, t.trend),
    fallback: true,
    denominator: 'official',
  };
}

/**
 * Scenario をプラグインに渡せる形に戻す（クランプ済みの値で）。
 * `trend` だけは自治体ごとに差し替わるので引数で受ける（docs/19 依頼3-2）。
 */
function toPluginScenario(s: NormalizedScenario, trend: number): Required<Pick<Scenario, 'trend'>> & Scenario {
  return {
    trend,
    latentFloor: s.latentFloor,
    supplyGrowth: [...s.supplyGrowth].map(([year, factor]) => ({ year, factor })),
    housing: [...s.housing],
  };
}

/**
 * 全自治体 × 全年度を1回で計算する。
 * ⚠️ 入力 `data` は読むだけ。書き換えない。
 */
export function computeAll(data: AppData, scenario?: Scenario): CoreResult {
  const norm = normalizeScenario(scenario);
  const trend = measureTrend(data);
  // 🔴 trend を明示されていないときは、画面に出す「実際に使った値」も実測値に揃える。
  //    定数 DEFAULT_TREND を表示しつつ実測値で計算する、という食い違いを作らない（docs/19 依頼7・8）
  if (!norm.trendExplicit) norm.trend = trend.trend;
  const forecast = buildForecastContext(data);
  const noteCtx = buildNoteContext(data);
  const years = entryYearRange(data);

  const notes = new Map<string, Note>();
  const excludedMunis: Array<{ muni: string; note: Note }> = [];
  const included: Muni[] = [];
  const cells: CoreCell[] = [];
  const byMuni = new Map<string, CoreCell[]>();

  for (const muni of data.munis) {
    const note = resolveNote(muni, noteCtx);
    if (note) notes.set(muni.name, note);

    // 🔴 series-break はここで除外しない。除外されるのは small-sample だけ（設計書 §4-4）
    const excluded = isExcludedFromScope(muni, note);
    if (excluded) {
      excludedMunis.push({
        muni: muni.name,
        note: note ?? { kind: 'small-sample', text: '対象児童数が少なく、比率が安定しないため比較対象から外しています。' },
      });
    } else {
      included.push(muni);
    }

    /**
     * 🔴 この自治体に当てる傾き。
     *   - シナリオで `trend` を明示されたら（③のスライダー）その値を一律で使う
     *   - 未指定なら自治体別の実測値。引けない自治体は都の実測値へフォールバックし
     *     `muniTrend.fallback` が立つ（画面に「都平均を当てている」と出すため）
     */
    const muniTrend = trend.byMuni.get(muni.name) ?? fallbackTrendOf(trend);
    const pluginScenario = toPluginScenario(norm, norm.trendExplicit ? norm.trend : muniTrend.used);

    const rows: CoreCell[] = [];
    for (const year of years) {
      const projection = projectMuni(muni, year, forecast, norm, data.backtest);
      const results: WeightedResult[] = INDICATORS.map((ind) => ({
        id: ind.id,
        weight: ind.weight,
        result: projection ? ind.compute({ muni, year, projection, scenario: pluginScenario }) : null,
      }));
      rows.push({
        muni: muni.name,
        year,
        basis: projection?.basis ?? (year <= forecast.lastOfficialYear ? 'official' : 'bridged'),
        score: totalScore(results),
        excluded,
        projection,
        indicators: results,
        detail: results[0]?.result?.detail ?? {},
        trend: muniTrend,
      });
    }
    byMuni.set(muni.name, rows);
    cells.push(...rows);
  }

  return {
    years,
    bridgeFrom: forecast.bridgeFrom,
    scenario: norm,
    munis: included,
    cells,
    byMuni,
    notes,
    excludedMunis,
    trend,
    forecast,
  };
}
