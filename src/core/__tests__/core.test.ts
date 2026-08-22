import { describe, expect, it } from 'vitest';
import { appData, scoreAt } from './fixtures';
import {
  buildHeatmap,
  buildMuniDetail,
  computeAll,
  entryYearOf,
  latentFloorFromData,
  measureTrend,
  normalizeScenario,
  validateAppData,
} from '../index';
import { gakudoIndicator } from '../indicators';
import { n0Of, rLatentOf } from '../scope';
import { median } from '../stats';
import { buildForecastContext, projectMuni } from '../forecast';

const muniByName = (name: string) => appData.munis.find((m) => m.name === name)!;

describe('FR-1 入学年度', () => {
  it('2024年生まれは2031年度に小1（要件 §5 UC-1）', () => {
    expect(entryYearOf(2024)).toBe(2031);
  });
});

describe('決定1: N0 は official[2025]。baseChildren ではない', () => {
  it('品川区は official[2025] を使う（baseChildren だと25%ずれて偽陽性になる）', () => {
    const shinagawa = muniByName('品川区');
    expect(n0Of(shinagawa)).toBe(18041);
    expect(shinagawa.baseChildren).toBe(14417);
    expect(rLatentOf(shinagawa)).toBeCloseTo(0.193, 3);
  });

  it('中央区の r_latent は要件 §1-2 検証2 の実測値 0.163 と一致する', () => {
    expect(rLatentOf(muniByName('中央区'))).toBeCloseTo(0.163, 3);
  });

  it('validateAppData が品川区のズレを検出する', () => {
    const report = validateAppData(appData);
    expect(report.problems.some((p) => p.includes('品川区') && p.includes('baseChildren'))).toBe(true);
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

  it('未指定なら現行式：2031年の中央値は3点未満で、0点が3件出る', () => {
    const v = at2031();
    expect(median(v)).toBeLessThan(3);
    expect(v.filter((s) => s < 0.5).length).toBe(3);
  });

  it('P75 を下限に置くと判別力が出る：中央値が上がり0点が減る', () => {
    const floor = latentFloorFromData(appData);
    expect(floor).toBeCloseTo(0.2587, 3);
    const v = at2031({ latentFloor: floor });
    // 中央値 2.9 → 8.2、0点 3件 → 2件（sample.json 6自治体での実測）
    expect(median(v)).toBeGreaterThan(median(at2031()) * 2);
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
    expect(s(0.015)).toBeGreaterThan(s(0.0084));
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
    const cells = buildHeatmap(appData, 2031).cells;
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

  it('未指定なら実測値 0.0084', () => {
    expect(normalizeScenario(undefined).trend).toBe(0.0084);
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
    const input = { muni: m, year: 2031, projection: p, scenario: { trend: 0.0084 } };
    expect(gakudoIndicator.compute(input)).toEqual(gakudoIndicator.compute(input));
  });
});

describe('validateAppData', () => {
  it('sample.json は品川区のズレ以外に致命的な問題が無い', () => {
    const r = validateAppData(appData);
    expect(r.problems.filter((p) => !p.includes('品川区'))).toEqual([]);
  });

  it('sources が空なら FR-8 違反として弾く', () => {
    const r = validateAppData({ ...appData, sources: [] });
    expect(r.problems.some((p) => p.includes('FR-8'))).toBe(true);
  });
});
