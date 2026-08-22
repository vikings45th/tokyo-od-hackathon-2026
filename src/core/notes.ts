/**
 * 注記の解決（設計書 §4-4）。
 *
 * 🔴 「除外」には2種類ある。取り違えると本物の供給不足が消える。
 *   series-break  … トレンド計算からのみ除外。スコアには含める（江戸川区）
 *   real-shortage … スコアに含める。上位リスクとして正しく出す（中央区）
 *   small-sample  … 対象範囲から除外（島嶼部・郡部）
 *
 * ①が data/app/notes.json を生成AI③で作ってくるので、`Muni.note` があればそれを信じる。
 * 無いときだけ、ここの決定論的な規則で補う。
 */
import type { AppData, Muni, Note } from '../types';
import { GAKUDO_PREV_DATE, REAL_SHORTAGE_QUANTILE, SERIES_BREAK_RATIO, SMALL_SAMPLE_N0 } from './constants';
import { baseGakudo, gakudoAt, isSmallSample, n0Of, rLatentOf } from './scope';
import { quantile } from './stats';

export interface NoteContext {
  /** r_latent の下位20%の閾値。real-shortage の判定に使う */
  realShortageThreshold: number;
}

export function buildNoteContext(data: AppData): NoteContext {
  const rates: number[] = [];
  for (const m of data.munis) {
    if (isSmallSample(m)) continue;
    const r = rLatentOf(m);
    if (r !== null && Number.isFinite(r)) rates.push(r);
  }
  return { realShortageThreshold: quantile(rates, REAL_SHORTAGE_QUANTILE) };
}

/** 2023-05 → 2025-05 で registered が SERIES_BREAK_RATIO 倍以上動いたか */
function looksLikeSeriesBreak(muni: Muni): boolean {
  const prev = gakudoAt(muni, GAKUDO_PREV_DATE);
  const cur = baseGakudo(muni);
  if (!prev || !cur) return false;
  const a = prev.registered;
  const b = cur.registered;
  if (a <= 0 || b <= 0) return a !== b;
  const ratio = Math.max(a, b) / Math.min(a, b);
  return ratio >= SERIES_BREAK_RATIO;
}

/**
 * この自治体の注記。①のデータを優先し、無ければ規則で判定する。
 * 判定の優先順は設計書 §4-4 の並び（断絶 → 母数不足 → 本物の不足）。
 */
export function resolveNote(muni: Muni, ctx: NoteContext): Note | undefined {
  if (muni.note) return muni.note;

  if (looksLikeSeriesBreak(muni)) {
    const prev = gakudoAt(muni, GAKUDO_PREV_DATE);
    const cur = baseGakudo(muni);
    return {
      kind: 'series-break',
      text:
        `2023年5月時点（${prev?.clubs ?? '-'}か所・${prev?.registered.toLocaleString() ?? '-'}人）と` +
        `2025年5月時点（${cur?.clubs ?? '-'}か所・${cur?.registered.toLocaleString() ?? '-'}人）で` +
        '計上方法が大きく変わっている疑いがあります。' +
        'スコア計算には含めますが、登録率トレンドの算出からは除外しています。',
    };
  }

  if (isSmallSample(muni)) {
    return {
      kind: 'small-sample',
      text: `対象児童数が${SMALL_SAMPLE_N0}人未満のため、比率が安定しません。比較対象から外しています。`,
    };
  }

  const r = rLatentOf(muni);
  const wait = baseGakudo(muni)?.waiting ?? 0;
  if (r !== null && Number.isFinite(ctx.realShortageThreshold) && r <= ctx.realShortageThreshold && wait > 0) {
    return {
      kind: 'real-shortage',
      text:
        `顕在需要率が都内下位（${r.toFixed(3)}）で、かつ待機児童が${wait.toLocaleString()}人います。` +
        '受け皿が実際に足りていない可能性が高く、スコアにそのまま反映しています。',
    };
  }

  return undefined;
}

/**
 * 対象範囲から外すか（＝ヒートマップの色計算に入れない）。
 * 🔴 series-break は false。ここを true にすると江戸川区が画面から消える。
 */
export function isExcludedFromScope(muni: Muni, note: Note | undefined): boolean {
  if (note?.kind === 'small-sample') return true;
  return n0Of(muni) < SMALL_SAMPLE_N0;
}
