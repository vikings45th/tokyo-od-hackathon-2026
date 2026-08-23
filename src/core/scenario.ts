/**
 * シナリオの正規化と適用（設計書 §4-5）。
 *
 * 🔴 ここは LLM から完全に切り離してある（設計書 §12 の退避策）。
 *    FR-7（自然文入力）は v1 では作らないので、③はスライダーと PRESET_SCENARIOS だけで動かす。
 *    数値を作るのは都の公式係数であって、LLM ではない。
 */
import type { AppData, HousingPlan, Scenario } from '../types';
import { DEFAULT_TREND, HOUSING_COEFF, LOWER_GRADE_COUNT, TREND_MAX, TREND_MIN, UNITS_MAX, UNITS_MIN } from './constants';
import { latentFloorFromData } from './trend';
import { clamp, sum } from './stats';

/** クランプ済み・既定値埋め済みのシナリオ。core の内部はこれしか見ない */
export interface NormalizedScenario {
  /** 一律で当てる傾き。`trendExplicit` が false ならこれは既定値（表示用）で、実際は自治体別 */
  trend: number;
  /**
   * 🔴 呼び出し側が `trend` を明示したか。
   *
   *   true  … その値を49自治体すべてに一律で当てる（③のスライダー・感度分析）
   *   false … 自治体別に実測した傾きを使う（`measureTrend().byMuni`）
   *
   * 「未指定＝既定値で埋める」だけにすると、自治体別トレンドを使う経路が無くなる。
   */
  trendExplicit: boolean;
  /** 未指定なら 0（＝下限なし・現行式） */
  latentFloor: number;
  /** 年度 → 供給倍率。未指定の年度は 1.0 */
  supplyGrowth: ReadonlyMap<number, number>;
  housing: readonly HousingPlan[];
}

/**
 * `Scenario` を安全な形に正規化する。
 * ⚠️ 入力は書き換えない（純関数）。値域は docs/15-interfaces.md §4 の合意どおり。
 */
export function normalizeScenario(scenario: Scenario | undefined): NormalizedScenario {
  const s = scenario ?? {};
  const trendExplicit = Number.isFinite(s.trend);
  const trend = clamp(trendExplicit ? (s.trend as number) : DEFAULT_TREND, TREND_MIN, TREND_MAX);
  const latentFloor = Number.isFinite(s.latentFloor) ? clamp(s.latentFloor as number, 0, 1) : 0;

  const supplyGrowth = new Map<number, number>();
  for (const g of s.supplyGrowth ?? []) {
    if (Number.isFinite(g?.year) && Number.isFinite(g?.factor)) {
      // 供給が負になることはない。上限は青天井にせず10倍で止める
      supplyGrowth.set(g.year, clamp(g.factor, 0, 10));
    }
  }

  const housing: HousingPlan[] = [];
  for (const h of s.housing ?? []) {
    if (!h || typeof h.muni !== 'string' || !Number.isFinite(h.year)) continue;
    if (!(h.type in HOUSING_COEFF)) continue;
    housing.push({ ...h, units: clamp(Number(h.units) || 0, UNITS_MIN, UNITS_MAX) });
  }

  return { trend, trendExplicit, latentFloor, supplyGrowth, housing };
}

/** その年度の供給倍率。未指定なら 1.0（＝クラブが増えない）。累積ではない */
export function supplyFactorAt(scenario: NormalizedScenario, year: number): number {
  return scenario.supplyGrowth.get(year) ?? 1.0;
}

export interface HousingDelta {
  /** 全学年の増加児童数 */
  total: number;
  /** 低学年（1〜3年）の増加児童数 */
  lower: number;
}

/**
 * 住宅開発による児童数の増加（設計書 §4-5 の都の公式係数）。
 * ⚠️ 仮定：完成年度以降はずっと定常。段階入居のデータが無いため。
 */
export function housingDeltaFor(scenario: NormalizedScenario, muni: string, year: number): HousingDelta {
  let total = 0;
  let lower = 0;
  for (const h of scenario.housing) {
    if (h.muni !== muni || year < h.year) continue;
    const coeff = HOUSING_COEFF[h.type];
    if (!coeff) continue;
    total += h.units * sum(coeff);
    lower += h.units * sum(coeff.slice(0, LOWER_GRADE_COUNT));
  }
  return { total, lower };
}

export interface PresetScenario {
  id: string;
  label: string;
  /** 画面に出す「これは何の仮定か」の説明。根拠まで書くこと */
  description: string;
  build(ctx: { data: AppData; muni?: string }): Scenario;
}

/**
 * プリセット。FR-7（自然文シナリオ）の代わりに、③はこれをボタンで出す。
 * 設計書 §12「シナリオをプリセット3つに退避」を本線に昇格させたもの。
 */
export const PRESET_SCENARIOS: readonly PresetScenario[] = [
  {
    id: 'baseline',
    label: '実測どおり（既定）',
    // 🔴 説明文に数字を書かないこと。画面はすぐ横に measureTrend() の実測値を出すので、
    //    二重に持つと必ずずれる（docs/19 依頼7：説明「+0.84pt」vs 表示「+0.81pt」）。
    description: '学童を使う子の割合は、都のデータから実測したとおりに上がると仮定。クラブ数は据え置き（何もしなければどうなるか）。',
    build: () => ({}),
  },
  {
    id: 'mansion600',
    label: '駅前に600戸のマンションが2028年に完成する',
    description: '東京都の住宅種別×学年別 児童発生率（民間マンションA地区・1戸あたり小1は0.013人）で人数に変換します。',
    build: ({ muni }) =>
      muni ? { housing: [{ muni, year: 2028, units: 600, type: '民間マンションA' }] } : {},
  },
  {
    id: 'trend15',
    // 画面の語彙に合わせる（③は「学童を使う子の割合」で統一済み）
    label: '使う子の割合が年 +1.5pt 上がる',
    description: '共働き世帯の増加が、実測よりも速く進んだ場合。',
    build: () => ({ trend: 0.015 }),
  },
  {
    id: 'supply16',
    label: 'クラブが年 +1.6% 増える',
    description:
      'クラブ数の都計の伸び（1,933 → 1,997・年 +1.6%）がこのまま続いた場合。' +
      '⚠️ この伸びは江戸川区（4→72）と中央区（15→31）がほぼ作っています。' +
      '49自治体の中央値は年 +0.0%（19自治体は2年でクラブが1つも増えていません）。',
    build: ({ data }) => ({
      supplyGrowth: data.tokyo.allGrades.map((t) => ({
        year: t.year,
        factor: Math.pow(1.016, Math.max(0, t.year - 2025)),
      })),
    }),
  },
  {
    id: 'latent',
    label: '抑制された需要が、受け皿の厚い区並みに満たされたら',
    description:
      '申込前に断念した人は登録にも待機にも計上されません。顕在需要率の下限を都内P75（実測分布）に置いた場合の見え方です。⚠️ これは仮定です。',
    build: ({ data }) => ({ latentFloor: latentFloorFromData(data) }),
  },
];
