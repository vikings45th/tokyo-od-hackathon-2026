/**
 * 配色と色の5段ビン。③UI担当が所有する。
 *
 * 🔴 ビンは「分位」ではなく「固定値」。年度やシナリオを変えても色の意味を動かさないため。
 *    値の根拠は docs/17-setup-request.md §4（588セルの実測分布）。
 *    旧契約の [0,10,25,40,60] では上位2色がほぼ使われず地図が単色になる。
 *
 * 低=緑・中央=グレー・高=赤のダイバージング配色（2026-08-23、単色ランプから変更）。
 * `dataviz` スキルの validate_palette.js は単色ランプ用の --ordinal しか無いため、
 * 今回はチェック項目（OKLCH輝度帯・彩度・対面コントラスト）を個別に手計算で確認済み：
 *   - 輝度は light帯[0.43,0.77] / dark帯[0.48,0.67] に全色収まる
 *   - 中央グレーと両端付近の中間色は彩度フロア(0.10)を意図的に下回る
 *     （中心に向かって彩度を落とすのがダイバージング配色の作法。nodataとは輝度差で区別）
 *   - セル数字のink色は最低でも旧配色の最小値（light 4.42:1 / dark 3.37:1）以上を確保
 *
 * ⚠️ 緑〜赤は赤緑色覚異常（最多のCVDタイプ）で最も混同しやすい組み合わせ。
 *    このアプリはセルに数字（ink）と凡例テキスト（BIN_LABELS）が必ず出るため
 *    色だけに依存しない構成にはなっているが、色単独での5段判別はCVDでは困難。
 */
export type Theme = 'light' | 'dark';

/** スコア（＝需要のうち受け皿に入れない割合 %）の下限。5段 */
export const BINS = [0, 2, 6, 12, 25] as const;

/** 凡例の文言。ビンと同じ並び */
export const BIN_LABELS = ['〜2%', '2〜6%', '6〜12%', '12〜25%', '25%〜'] as const;

export interface Palette {
  /** 低→高の5色 */
  ramp: string[];
  /** ramp と対になる文字色（セルの数字用） */
  ink: string[];
  /** score が null（データなし）の色。0点と同じ色にしないこと */
  nodata: string;
}

export const PALETTES: Record<Theme, Palette> = {
  // 明るい面：低＝緑 → 中央＝グレー → 高＝赤（中心に向けて彩度を落とす）
  light: {
    ramp: ['#2f9e52', '#8fbb98', '#9a9892', '#d99a8a', '#c23b30'],
    ink: ['#0b0b0b', '#0b0b0b', '#0b0b0b', '#0b0b0b', '#ffffff'],
    nodata: '#ecece8',
  },
  // 暗い面：同じ配色を暗い面の輝度帯（OKLCH L 0.48〜0.67）に合わせて再調整
  dark: {
    ramp: ['#35a75f', '#5c7d63', '#8a8983', '#b06a5c', '#e0574a'],
    ink: ['#0a0a0b', '#0a0a0b', '#0a0a0b', '#0a0a0b', '#0a0a0b'],
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
