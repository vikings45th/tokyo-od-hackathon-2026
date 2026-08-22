/**
 * 配色と色の5段ビン。③UI担当が所有する。
 *
 * 🔴 ビンは「分位」ではなく「固定値」。年度やシナリオを変えても色の意味を動かさないため。
 *    値の根拠は docs/17-setup-request.md §4（588セルの実測分布）。
 *    旧契約の [0,10,25,40,60] では上位2色がほぼ使われず地図が単色になる。
 *
 * ランプは `dataviz` スキルの validate_palette.js に通してある（--ordinal）。
 * ⚠️ ライトの最淡 #86b6ef は純白系の面でないと対面2:1を割る。
 *    #ffffff 2.11 / #fcfcfb 2.06 は PASS、#f7f7f5 は 1.97 で FAIL。
 *    セクション背景をグレーにしないこと。
 */
export type Theme = 'light' | 'dark';

/** スコア（＝需要のうち受け皿に入れない割合 %）の下限。5段 */
export const BINS = [0, 3, 8, 15, 30] as const;

/** 凡例の文言。ビンと同じ並び */
export const BIN_LABELS = ['〜3%', '3〜8%', '8〜15%', '15〜30%', '30%〜'] as const;

export interface Palette {
  /** 低→高の5色 */
  ramp: string[];
  /** ramp と対になる文字色（セルの数字用） */
  ink: string[];
  /** score が null（データなし）の色。0点と同じ色にしないこと */
  nodata: string;
}

export const PALETTES: Record<Theme, Palette> = {
  // 明るい面：低＝淡く沈む → 高＝濃く沈み込む
  light: {
    ramp: ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#0d366b'],
    ink: ['#0b2542', '#0b2542', '#ffffff', '#ffffff', '#ffffff'],
    nodata: '#ecece8',
  },
  // 暗い面：低＝沈む → 高＝光る（同じ5色を反転）
  dark: {
    ramp: ['#184f95', '#2a78d6', '#6da7ec', '#9ec5f4', '#cde2fb'],
    ink: ['#cfe3fb', '#cfe3fb', '#0a0a0b', '#0a0a0b', '#0a0a0b'],
    nodata: '#1e1e22',
  },
};

/** スコア → ビン番号（0〜4） */
export function binOf(score: number): number {
  let i = 0;
  for (const b of BINS) if (score >= b) i++;
  return Math.max(0, i - 1);
}

/** スコア → 塗り色。null は「データなし」で nodata を返す（🔴 0点と同じ色にしない） */
export function fillOf(score: number | null, p: Palette): string {
  return score === null ? p.nodata : p.ramp[binOf(score)];
}
