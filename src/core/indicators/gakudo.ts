/**
 * 軸1：学童の受け入れリスク（設計書 §4-2）。v1 で唯一の軸。
 *
 *   顕在需要率     r_latent(m)   = (Reg + Wait) / N0
 *   目標需要率     r_target(m,y) = min( max(r_latent, latentFloor) + trend × (y − 2025), 0.60 )
 *   需要           D(m,y)        = N(m,y) × r_target
 *   供給           S(m,y)        = Reg × supplyGrowth(y)
 *   充足率         Fill          = min( S / D , 1 )
 *   不足人数       Gap           = max( D − S , 0 )
 *   リスクスコア   score         = 100 × (1 − Fill)
 *
 * score は「需要のうち何%が受け皿に入れないか」。
 *
 * ⚠️ compute は純関数にすること。49自治体 × 年度ぶん呼ばれる。
 * ⚠️ 分母は常に全学年。Reg が全学年合計なので、低学年に絞ると率が過大になる。
 */
import type { Indicator, IndicatorInput, IndicatorResult } from '../../types';
import { BASE_YEAR, RATE_CAP } from '../constants';
import { baseGakudo, n0Of } from '../scope';

/** その年度の供給倍率。未指定なら 1.0（＝クラブが増えない） */
function supplyFactor(input: IndicatorInput): number {
  const list = input.scenario.supplyGrowth;
  if (!list) return 1;
  for (const g of list) if (g.year === input.year) return g.factor;
  return 1;
}

export const gakudoIndicator: Indicator = {
  id: 'gakudo',
  label: '学童の受け入れリスク',
  weight: 1.0,
  higherIsWorse: true,

  compute(input: IndicatorInput): IndicatorResult | null {
    const { muni, year, projection, scenario } = input;

    const g = baseGakudo(muni);
    const n0 = n0Of(muni);
    // 🔴 計算できないときは null を返す。0点にしないこと（＝「データなし」とは別物）
    if (!g || n0 <= 0) return null;

    const rLatent = (g.registered + g.waiting) / n0;
    // 決定2：latentFloor 未指定なら現行式（下限なし）
    const rBase = Math.max(rLatent, scenario.latentFloor ?? 0);
    const rTarget = Math.min(rBase + scenario.trend * (year - BASE_YEAR), RATE_CAP);

    const children = projection.children;
    const demand = children * rTarget;
    if (!(demand > 0)) return null;

    const supply = g.registered * supplyFactor(input);
    const fill = Math.min(supply / demand, 1);
    const gap = Math.max(demand - supply, 0);

    return {
      score: 100 * (1 - fill),
      detail: {
        rLatent,
        rTarget,
        demand,
        supply,
        gap,
        fill,
        children,
        lowerGrades: projection.lowerGrades,
        clubs: g.clubs,
        registered: g.registered,
        waiting: g.waiting,
        n0,
      },
    };
  },
};
