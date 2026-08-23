import { describe, expect, it } from 'vitest';
import { appData, scoreAt } from './fixtures';
import {
  birthYearOf,
  buildHeatmap,
  buildMuniDetail,
  computeAll,
  entryYearOf,
  isEarlyBirth,
  DEFAULT_TREND,
  latentFloorFromData,
  measureTrend,
  normalizeScenario,
  validateAppData,
} from '../index';
import { gakudoIndicator } from '../indicators';
import { n0Of, rLatentOf } from '../scope';
import { BASE_YEAR, RATE_CAP } from '../constants';
import { childrenSeriesOf, rLatentSeriesOf } from '../scope';
import { linearRegression, median, tQuantile90 } from '../stats';
import { buildForecastContext, projectMuni } from '../forecast';

const muniByName = (name: string) => appData.munis.find((m) => m.name === name)!;

describe('FR-1 入学年度', () => {
  it('2024年生まれは2031年度に小1（要件 §5 UC-1）', () => {
    expect(entryYearOf(2024)).toBe(2031);
  });

  // 学校教育法：4月2日〜翌年4月1日生まれが同学年。早生まれは全体の約1/4
  it.each([
    [2024, 4, 2031],
    [2025, 3, 2031],
    [2025, 4, 2032],
    [2024, 1, 2030],
    [2024, 12, 2031],
  ])('%i年%i月生まれ → %i年度', (y, m, expected) => {
    expect(entryYearOf(y, m)).toBe(expected);
  });

  it('第2引数を渡さなければ従来どおり +7', () => {
    expect(entryYearOf(2024)).toBe(2031);
    expect(entryYearOf(2025)).toBe(2032);
  });

  it('範囲外・非整数の月は通常の学年として扱う', () => {
    expect(entryYearOf(2025, 0)).toBe(2032);
    expect(entryYearOf(2025, 13)).toBe(2032);
    expect(entryYearOf(2025, 3.5)).toBe(2032);
    expect(entryYearOf(2025, NaN)).toBe(2032);
  });

  it('isEarlyBirth は1〜3月だけ true', () => {
    expect([1, 2, 3].map(isEarlyBirth)).toEqual([true, true, true]);
    expect([4, 5, 12].map(isEarlyBirth)).toEqual([false, false, false]);
    expect(isEarlyBirth(undefined)).toBe(false);
  });

  it('birthYearOf は entryYearOf の逆（月を渡せば往復する）', () => {
    for (const m of [1, 3, 4, 12, undefined]) {
      const b = birthYearOf(2031, m);
      expect(entryYearOf(b, m)).toBe(2031);
    }
    expect(birthYearOf(2031, 3)).toBe(2025);
    expect(birthYearOf(2031, 4)).toBe(2024);
  });
});

describe('決定1: N0 は official[2025]。baseChildren ではない', () => {
  // 🔴 固定値（14417 など）を踏まないこと。①がデータを直すたびにテストが赤くなる（docs/19 依頼6）。
  //    検証すべきは「どの系列から導かれているか」であって、特定の実測値ではない。
  it('N0 は official[2025] の6学年合計から導かれる（全自治体）', () => {
    for (const m of appData.munis) {
      const officialSum = m.official.find((o) => o.year === 2025)!.grades.reduce((a, b) => a + b, 0);
      expect(n0Of(m)).toBe(officialSum);
    }
  });

  it('baseChildren が official[2025] とずれていても N0 は official を採る', () => {
    // 実データが正しくなった以上、ズレは合成して作る。②が分母を取り違えると
    // 分母と N(m,y) が別系列になり、基準年でスコアが狂う（品川区で 23 vs 7 の偽陽性が出ていた）
    const skewed = { ...muniByName('品川区'), baseChildren: 14417 };
    const officialSum = skewed.official.find((o) => o.year === 2025)!.grades.reduce((a, b) => a + b, 0);
    expect(n0Of(skewed)).toBe(officialSum);
    expect(n0Of(skewed)).not.toBe(14417);
  });

  it('中央区の r_latent は要件 §1-2 検証2 の実測値 0.163 と一致する', () => {
    expect(rLatentOf(muniByName('中央区'))).toBeCloseTo(0.163, 3);
  });

  it('validateAppData は baseChildren と official[2025] のズレを検出する', () => {
    const broken = {
      ...appData,
      munis: appData.munis.map((m) => (m.name === '品川区' ? { ...m, baseChildren: 14417 } : m)),
    };
    const report = validateAppData(broken);
    expect(report.problems.some((p) => p.includes('品川区') && p.includes('baseChildren'))).toBe(true);
    // 正しいデータでは鳴らない
    expect(validateAppData(appData).problems.some((p) => p.includes('baseChildren'))).toBe(false);
  });
});

describe('DoD#4 江戸川区と中央区', () => {
  const heatmap = buildHeatmap(appData, 2031);

  it('江戸川区はスコア計算に含まれ、行に出る（series-break の除外先を取り違えない）', () => {
    expect(heatmap.munis).toContain('江戸川区');
    expect(heatmap.excludedMunis.map((e) => e.muni)).not.toContain('江戸川区');
    const cell = heatmap.cells.find((c) => c.muni === '江戸川区' && c.year === 2031)!;
    expect(cell.excluded).toBe(false);
    expect(cell.score).not.toBeNull();
  });

  it('江戸川区には series-break の注記がつく', () => {
    expect(computeAll(appData).notes.get('江戸川区')?.kind).toBe('series-break');
  });

  it('中央区が上位リスクとして出る（real-shortage・待機275人）', () => {
    expect(heatmap.munis[0]).toBe('中央区');
    expect(computeAll(appData).notes.get('中央区')?.kind).toBe('real-shortage');
  });
});

describe('measureTrend は series-break を除外する', () => {
  it('江戸川区が除外リストに入る', () => {
    expect(measureTrend(appData).excluded).toContain('江戸川区');
  });

  it('江戸川区を混ぜると値が壊れる（141人 → 6,623人が断絶由来の伸びを作る）', () => {
    const withBreak = {
      ...appData,
      munis: appData.munis.map((m) => (m.name === '江戸川区' ? { ...m, note: undefined } : m)),
    };
    const clean = measureTrend(appData).trend;
    const dirty = measureTrend(withBreak).trend;
    expect(dirty).toBeGreaterThan(clean * 2);
  });
});

describe('決定3 official / bridged の境界', () => {
  const heatmap = buildHeatmap(appData, 2031);

  it('bridgeFrom は 2031（official の児童数は2030年度まで）', () => {
    expect(heatmap.bridgeFrom).toBe(2031);
  });

  it('UC-1 の focusYear 2031 は bridged になる', () => {
    expect(heatmap.cells.find((c) => c.muni === '中央区' && c.year === 2031)!.basis).toBe('bridged');
    expect(heatmap.cells.find((c) => c.muni === '中央区' && c.year === 2030)!.basis).toBe('official');
  });

  it('接続式どおり N(m,2031) = N(m,2030) × 全都(2031)/全都(2030)', () => {
    const ctx = buildForecastContext(appData);
    const m = muniByName('世田谷区');
    const norm = normalizeScenario(undefined);
    const p2030 = projectMuni(m, 2030, ctx, norm, appData.backtest)!;
    const p2031 = projectMuni(m, 2031, ctx, norm, appData.backtest)!;
    const ratio = 492517 / 510303;
    expect(p2031.children).toBeCloseTo(p2030.children * ratio, 6);
  });

  it('射程外（2039年度以降）は算出しない', () => {
    expect(heatmap.years.at(-1)).toBe(2038);
    expect(heatmap.cells.some((c) => c.year > 2038)).toBe(false);
  });
});

describe('決定2 latentFloor（潜在需要トグル）', () => {
  const at2031 = (scenario?: Parameters<typeof buildHeatmap>[2]) =>
    buildHeatmap(appData, 2031, scenario)
      .cells.filter((c) => c.year === 2031 && !c.excluded && c.score !== null)
      .map((c) => c.score!);

  // 🔴 trend を明示する。未指定だと自治体別トレンド（実測へのフォールバック）が効いて
  //    latentFloor 以外の要因でも数字が動き、このテストが何を見ているのか分からなくなる
  const base = { trend: DEFAULT_TREND };

  it('latentFloor 未指定なら現行式：2031年の中央値は3点未満で、0点が3件出る', () => {
    const v = at2031(base);
    expect(median(v)).toBeLessThan(3);
    expect(v.filter((s) => s < 0.5).length).toBe(3);
  });

  it('P75 を下限に置くと判別力が出る：中央値が上がり0点が減る', () => {
    const floor = latentFloorFromData(appData);
    expect(floor).toBeCloseTo(0.2587, 3);
    const v = at2031({ ...base, latentFloor: floor });
    // 中央値 2.9 → 8.2、0点 3件 → 2件（sample.json 6自治体での実測）
    expect(median(v)).toBeGreaterThan(median(at2031(base)) * 2);
    expect(v.filter((s) => s < 0.5).length).toBe(2);
  });
});

describe('設計書 §0-2 の感度：trend がモデルを支配する', () => {
  it('trend = 0 だと大半が0点に落ちる', () => {
    const v = buildHeatmap(appData, 2031, { trend: 0 })
      .cells.filter((c) => c.year === 2031 && c.score !== null)
      .map((c) => c.score!);
    expect(v.filter((s) => s < 1).length).toBeGreaterThanOrEqual(5);
  });

  it('trend を上げるとスコアは単調に上がる', () => {
    const s = (t: number) => scoreAt(buildHeatmap(appData, 2031, { trend: t }).cells, '杉並区', 2031)!;
    expect(s(0.02)).toBeGreaterThan(s(0.015));
    expect(s(0.015)).toBeGreaterThan(s(DEFAULT_TREND));
  });
});

describe('score の null と 0 は別物', () => {
  it('N0 が 0 の自治体は null（データなし）であって 0 点ではない', () => {
    const broken = {
      ...appData,
      munis: appData.munis.map((m) => (m.name === '三鷹市' ? { ...m, official: [], baseChildren: 0 } : m)),
    };
    const cell = buildHeatmap(broken, 2031).cells.find((c) => c.muni === '三鷹市' && c.year === 2031)!;
    expect(cell.score).toBeNull();
  });

  it('待機0でもリスク0とは限らない（世田谷区は年度が進むと0を超える）', () => {
    const cells = buildHeatmap(appData, 2031, { trend: DEFAULT_TREND }).cells;
    expect(scoreAt(cells, '世田谷区', 2031)).toBe(0);
    expect(scoreAt(cells, '世田谷区', 2038)!).toBeGreaterThan(0);
  });
});

describe('予測区間', () => {
  const detail = buildMuniDetail(appData, '杉並区');
  const row = (y: number) => detail.series.find((s) => s.year === y)!;
  const width = (y: number) => row(y).band.hi - row(y).band.lo;

  it('先の年度ほど広がる', () => {
    expect(width(2029)).toBeGreaterThan(width(2027));
  });

  it('bridged 区間でさらに広がる（測っていない区間だと示す）', () => {
    const rel = (y: number) => width(y) / row(y).demand;
    expect(rel(2031)).toBeGreaterThan(rel(2030) * 1.4);
  });

  // docs/17 依頼B：band は児童数の帯。需要の帯は demandBand
  it('demandBand は demand を挟む', () => {
    for (const r of detail.series) {
      expect(r.demandBand.lo).toBeLessThanOrEqual(r.demand);
      expect(r.demand).toBeLessThanOrEqual(r.demandBand.hi);
    }
  });

  // 🔴 docs/19 依頼3-4 の受け入れ条件。ここが緩むと「予測区間」と呼べなくなる
  it('demandBand には児童数の誤差だけでなくトレンドの不確かさが入っている', () => {
    for (const r of detail.series) {
      if (r.year === BASE_YEAR) continue; // 基準年は傾きの寄与が 0
      const childrenOnly = { lo: r.band.lo * r.targetRate, hi: r.band.hi * r.targetRate };
      // 旧実装（児童数の誤差だけ）より明確に広いこと
      expect(r.demandBand.lo).toBeLessThan(childrenOnly.lo);
      expect(r.demandBand.hi).toBeGreaterThan(childrenOnly.hi);
      expect(r.demandBand.hi - r.demandBand.lo).toBeGreaterThan((childrenOnly.hi - childrenOnly.lo) * 1.2);
    }
  });

  it('gapBand は gap を挟み、供給ぶんだけ需要の帯を下にずらしたもの', () => {
    for (const r of detail.series) {
      expect(r.gapBand.lo).toBeLessThanOrEqual(r.gap + 1e-9);
      expect(r.gap).toBeLessThanOrEqual(r.gapBand.hi + 1e-9);
      expect(r.gapBand.hi).toBeCloseTo(Math.max(r.demandBand.hi - r.supply, 0), 9);
    }
  });

  it('band と demandBand は桁が違う（同じ軸に描かせないための回帰テスト）', () => {
    const r = buildMuniDetail(appData, '中央区').series.find((s) => s.year === 2031)!;
    // band は児童数の帯。DEFAULT_TREND に依存しないので固定値で踏んでよい。
    // 9701.8 → 9717.8：①が backtest を49自治体で再計算し p10Pct が -2.13 → -2.07 になったため
    expect(r.band.lo).toBeCloseTo(9717.8, 0);
    // 🔴 demand は trend で動くので固定値を踏まない。検証するのは「桁が違う」ことそのもの
    expect(r.demand).toBeGreaterThan(r.demandBand.lo);
    expect(r.demand).toBeLessThan(r.demandBand.hi);
    expect(r.band.lo / r.demand).toBeGreaterThan(4);
    expect(r.band.lo / r.demandBand.lo).toBeGreaterThan(4);
  });
});

describe('シナリオのクランプ（docs/15-interfaces.md §4）', () => {
  it('trend は [-0.05, +0.05]', () => {
    expect(normalizeScenario({ trend: 9 }).trend).toBe(0.05);
    expect(normalizeScenario({ trend: -9 }).trend).toBe(-0.05);
  });

  it('units は [0, 5000]', () => {
    const s = normalizeScenario({
      housing: [{ muni: '中央区', year: 2028, units: 99999, type: '民間マンションA' }],
    });
    expect(s.housing[0]!.units).toBe(5000);
  });

  it('未指定なら実測値（DEFAULT_TREND）', () => {
    expect(normalizeScenario(undefined).trend).toBe(DEFAULT_TREND);
  });
});

describe('住宅シナリオは都の公式係数で人数に変換する', () => {
  const ctx = buildForecastContext(appData);
  const m = muniByName('中央区');
  const withPlan = normalizeScenario({
    housing: [{ muni: '中央区', year: 2028, units: 600, type: '民間マンションA' }],
  });

  it('民間マンションA 600戸 = 6学年計 34.8人（設計書 §4-5 の例）', () => {
    const base = projectMuni(m, 2029, ctx, normalizeScenario(undefined), appData.backtest)!;
    const plan = projectMuni(m, 2029, ctx, withPlan, appData.backtest)!;
    expect(plan.children - base.children).toBeCloseTo(34.8, 6);
  });

  it('完成年度より前には効かない', () => {
    const base = projectMuni(m, 2027, ctx, normalizeScenario(undefined), appData.backtest)!;
    const plan = projectMuni(m, 2027, ctx, withPlan, appData.backtest)!;
    expect(plan.children).toBe(base.children);
  });
});

describe('FR-4 / FR-6 詳細と打てる手', () => {
  const detail = buildMuniDetail(appData, '杉並区', undefined, 2031);

  it('登録率の推移と予測区間が year 昇順で入る', () => {
    expect(detail.series.length).toBe(12);
    expect(detail.series[0]!.year).toBe(2027);
    expect(detail.series.at(-1)!.year).toBe(2038);
  });

  it('待機児童数が detail に届く（杉並区 481人）', () => {
    expect(computeAll(appData).byMuni.get('杉並区')![0]!.detail.waiting).toBe(481);
  });

  it('近隣比較は同じ area 区分から、スコアが低い順に3件', () => {
    expect(detail.alternatives.length).toBe(3);
    expect(detail.alternatives.map((a) => a.muni)).not.toContain('三鷹市');
    const scores = detail.alternatives.map((a) => a.score);
    expect([...scores].sort((a, b) => a - b)).toEqual(scores);
  });
});

describe('純関数であること（設計書 §3）', () => {
  it('同じ入力なら同じ出力', () => {
    expect(buildHeatmap(appData, 2031)).toEqual(buildHeatmap(appData, 2031));
  });

  it('入力を書き換えない（Object.freeze した sample で通る）', () => {
    expect(() => buildHeatmap(appData, 2031, { trend: 0.02 })).not.toThrow();
    expect(appData.munis[0]!.name).toBe('中央区');
  });

  it('Indicator.compute が副作用を持たない', () => {
    const ctx = buildForecastContext(appData);
    const m = muniByName('中央区');
    const p = projectMuni(m, 2031, ctx, normalizeScenario(undefined), appData.backtest)!;
    const input = { muni: m, year: 2031, projection: p, scenario: { trend: DEFAULT_TREND } };
    expect(gakudoIndicator.compute(input)).toEqual(gakudoIndicator.compute(input));
  });
});

describe('validateAppData', () => {
  it('sample.json に致命的な問題は無い', () => {
    expect(validateAppData(appData).problems).toEqual([]);
  });

  it('sources が空なら FR-8 違反として弾く', () => {
    const r = validateAppData({ ...appData, sources: [] });
    expect(r.problems.some((p) => p.includes('FR-8'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// docs/19 依頼3：自治体別トレンドと、予測区間へのトレンド不確実性の反映
// ─────────────────────────────────────────────────────────────

describe('依頼3-2 分母の系列を混ぜない', () => {
  it('学校名簿が抜粋なら分母に採用しない（sample.json は6自治体18校）', () => {
    // 18校ぶんの児童数を分母にすると顕在需要率が 0.24〜2.38 になり、傾きが100倍化する
    for (const m of appData.munis) {
      expect(childrenSeriesOf(appData, m).source).toBe('official');
    }
  });

  it('childrenSeries があれば最優先で使う', () => {
    const m = {
      ...muniByName('杉並区'),
      childrenSeries: [
        { asOf: '2023-05-01', count: 26000 },
        { asOf: '2024-05-01', count: 26200 },
        { asOf: '2025-05-01', count: 26400 },
      ],
    };
    const cs = childrenSeriesOf(appData, m);
    expect(cs.source).toBe('childrenSeries');
    expect(cs.points).toHaveLength(3);
  });

  it('分子と分母が両方揃う時点だけ使う（2025-10 は分母が無いので落ちる）', () => {
    const m = muniByName('杉並区');
    expect(m.gakudo.map((g) => g.asOf)).toContain('2025-10-01');
    const { points } = rLatentSeriesOf(appData, m);
    expect(points.map((p) => p.asOf)).toEqual(['2023-05-01', '2025-05-01']);
  });
});

describe('依頼3-3 フォールバック', () => {
  const t = measureTrend(appData);

  it('既存の返り値は壊していない（③の画面 S5 が使っている）', () => {
    expect(t.trend).toBeGreaterThan(0);
    expect(t.n).toBeGreaterThan(0);
    expect(t.excluded).toContain('江戸川区');
    expect(Number.isFinite(t.rateFrom)).toBe(true);
    expect(Number.isFinite(t.rateTo)).toBe(true);
  });

  it('いまのデータは2時点しかないので、全自治体がフォールバックする', () => {
    expect(t.points).toBe(2);
    expect(t.measuredCount).toBe(0);
    for (const [, v] of t.byMuni) {
      expect(v.nPoints).toBeLessThan(3);
      expect(v.fallback).toBe(true);
      expect(v.used).toBe(t.trend);
    }
  });

  it('江戸川区（series-break）はフォールバックし、傾きのプールにも入らない', () => {
    const edo = t.byMuni.get('江戸川区')!;
    expect(edo.fallback).toBe(true);
    expect(edo.used).toBe(t.trend);
    // 江戸川区の傾きは断絶由来で桁が違う。プールに混ざっていれば p90 が引きずられる
    expect(edo.slope!).toBeGreaterThan(t.slopeP90 * 3);
    expect(t.slopeP90).toBeLessThan(0.05);
  });

  it('フォールバックの信頼区間は自治体間のばらつきで、都の実測値を必ず含む', () => {
    for (const [, v] of t.byMuni) {
      expect(v.ciLo).toBeLessThanOrEqual(v.used);
      expect(v.used).toBeLessThanOrEqual(v.ciHi);
      expect(v.ciHi).toBeGreaterThan(v.ciLo);
    }
  });

  it('3点あれば自前で引ける（①が学童 2024-05 を1点足したときの挙動）', () => {
    const withMid = {
      ...appData,
      munis: appData.munis.map((m) => ({
        ...m,
        childrenSeries: [
          { asOf: '2023-05-01', count: m.children2023 },
          { asOf: '2024-05-01', count: Math.round((m.children2023 + n0Of(m)) / 2) },
          { asOf: '2025-05-01', count: n0Of(m) },
        ],
        gakudo: [
          ...m.gakudo,
          {
            asOf: '2024-05-01',
            clubs: m.gakudo[0]!.clubs,
            registered: Math.round((m.gakudo[0]!.registered + m.gakudo[1]!.registered) / 2),
            waiting: Math.round((m.gakudo[0]!.waiting + m.gakudo[1]!.waiting) / 2),
          },
        ].sort((a, b) => a.asOf.localeCompare(b.asOf)),
      })),
    };
    const t3 = measureTrend(withMid);
    expect(t3.points).toBe(3);
    expect(t3.measuredCount).toBeGreaterThan(0);
    const suginami = t3.byMuni.get('杉並区')!;
    expect(suginami.fallback).toBe(false);
    expect(suginami.nPoints).toBe(3);
    expect(suginami.se).not.toBeNull();
    // 江戸川区は3点あっても series-break なのでフォールバックのまま
    expect(t3.byMuni.get('江戸川区')!.fallback).toBe(true);
  });
});

describe('依頼3-4 予測区間にトレンドの不確かさが入っている', () => {
  it('r_target は全自治体・全年度で [0, RATE_CAP] に収まる', () => {
    for (const scenario of [undefined, { trend: 0.05 }, { trend: -0.05 }, { latentFloor: 0.4 }]) {
      const core = computeAll(appData, scenario);
      for (const c of core.cells) {
        if (c.detail.rTarget === undefined) continue;
        expect(c.detail.rTarget).toBeGreaterThanOrEqual(0);
        expect(c.detail.rTarget).toBeLessThanOrEqual(RATE_CAP);
      }
    }
  });

  it('trend を明示すると帯の中心はその値に移り、幅は実測のまま残る', () => {
    const wide = buildMuniDetail(appData, '杉並区', { trend: 0.03 }).series.find((s) => s.year === 2031)!;
    const base = buildMuniDetail(appData, '杉並区', undefined).series.find((s) => s.year === 2031)!;
    expect(wide.demand).toBeGreaterThan(base.demand);
    expect(wide.demandBand.lo).toBeLessThan(wide.demand);
    expect(wide.demandBand.hi).toBeGreaterThan(wide.demand);
  });

  it('MuniDetail.trend で「都平均を当てている」ことが分かる', () => {
    const d = buildMuniDetail(appData, '中央区');
    expect(d.trend.fallback).toBe(true);
    expect(d.trend.denominator).toBe('official');
    expect(d.trend.nPoints).toBe(2);
  });
});

describe('依頼3-6 縮約推定', () => {
  it('標準誤差が大きいほど都平均に寄る', () => {
    // 分散分解が効く形の合成データ：傾きはばらつくが、1件だけ極端に不確か
    const points = (slope: number, noise: number) => [
      { x: 2021, y: 0.2 },
      { x: 2022, y: 0.2 + slope + noise },
      { x: 2023, y: 0.2 + slope * 2 - noise },
      { x: 2024, y: 0.2 + slope * 3 + noise },
      { x: 2025, y: 0.2 + slope * 4 - noise },
    ];
    const clean = linearRegression(points(0.02, 0))!;
    const noisy = linearRegression(points(0.02, 0.05))!;
    expect(clean.se).toBeCloseTo(0, 6);
    expect(noisy.se!).toBeGreaterThan(clean.se!);
    // 自由度が同じでも、残差が大きいほど信頼区間が広がる（豊島区の非線形はここに出る）
    expect(tQuantile90(clean.df) * noisy.se!).toBeGreaterThan(tQuantile90(clean.df) * clean.se!);
  });

  it('2点では標準誤差が出ない（自由度0）', () => {
    const r = linearRegression([{ x: 2023, y: 0.24 }, { x: 2025, y: 0.26 }])!;
    expect(r.slope).toBeCloseTo(0.01, 9);
    expect(r.se).toBeNull();
    expect(r.df).toBe(0);
  });
});

describe('依頼8 定数と実測値が食い違っていないか', () => {
  it('DEFAULT_TREND は実データの実測値と一致する（0.01pt 以内）', async () => {
    const real = (await import('../../../data/app/data.json')).default as unknown as Parameters<typeof measureTrend>[0];
    expect(Math.abs(measureTrend(real).trend - DEFAULT_TREND)).toBeLessThan(0.0001);
  });
});
