/** 49自治体のコロプレス地図。地図ライブラリは使わずインラインSVG。 */
import { memo, useMemo } from 'react';
import { MAP_H, MAP_W, type GeoIndex, type MuniShape } from './geo';
import { fillOf, type Palette } from './palette';

export interface CellLike {
  score: number | null;
  excluded: boolean;
}

interface Props {
  geo: GeoIndex;
  palette: Palette;
  /** 自治体名 → その年度のセル。無ければ「データなし」 */
  cellOf: (muni: string) => CellLike | undefined;
  selected?: string | null;
  onSelect?: (muni: string) => void;
  viewBox?: string;
  svgRef?: React.Ref<SVGSVGElement>;
  handlers?: React.SVGProps<SVGSVGElement>;
  /** 装飾用（S0のゴースト）。操作もラベルも付けない */
  decorative?: boolean;
  /** いまの拡大率（1 = 全体）。文字サイズを見た目で一定に保つために使う */
  scale?: number;
}

function ChoroplethBase({
  geo,
  palette,
  cellOf,
  selected,
  onSelect,
  viewBox,
  svgRef,
  handlers,
  decorative,
  scale = 1,
}: Props) {
  /**
   * 自治体名をどこまで出すか。
   *
   * 🔴 以前は `scale >= 1.55` でしか出していなかった（「全体表示で49件出すと潰れる」）。
   *    それは地図が細い列に入っていた頃の前提で、全幅にした今は成立しない。
   *    実測：全体表示（900×520・フォント11単位）で **49件中48件が重ならずに置ける**
   *    （重なるのは東大和市だけ。拡大すれば出る）。
   *
   * なので拡大率でゲートせず、**重なりだけを貪欲法で避ける**。
   *   1. 選択中の自治体を最優先（クリックのフィードバックなので必ず出す）
   *   2. あとは面積の大きい順。小さい自治体のほうが譲る
   *   3. 既に置いた枠と重なるものは飛ばす（拡大すると枠が相対的に小さくなり、自然に出てくる）
   *
   * ⚠️ スマホでは CSS 側で消している（390px幅だと画面上4px相当になり読めない）。
   */
  const labels = useMemo<MuniShape[]>(() => {
    if (decorative) return [];
    const fs = 11 / scale; // 画面上の見た目を一定に保つ既存の式と揃える
    const boxes: Array<{ x: number; y: number; w: number; h: number }> = [];
    const out: MuniShape[] = [];
    const order = [...geo.shapes].sort(
      (a, b) =>
        (b.name === selected ? 1 : 0) - (a.name === selected ? 1 : 0) || b.area - a.area,
    );
    for (const s of order) {
      // ⚠️ 枠は実際の文字より少し大きく取る。太字（700）で幅が伸びるうえ、
      //    縁取り（strokeWidth 3/scale）が左右に出るため。小さく見積もると重なる。
      const halo = 3 / scale;
      const b = {
        x: s.centroid[0],
        y: s.centroid[1],
        w: s.name.length * fs + halo * 2, // 和文はほぼ全角1文字＝1em
        h: fs * 1.25 + halo,
      };
      const hit = boxes.some(
        (p) => Math.abs(p.x - b.x) < (p.w + b.w) / 2 && Math.abs(p.y - b.y) < (p.h + b.h) / 2,
      );
      if (hit) continue;
      boxes.push(b);
      out.push(s);
    }
    return out;
  }, [geo, scale, selected, decorative]);
  return (
    <svg
      ref={svgRef}
      viewBox={viewBox ?? `0 0 ${MAP_W} ${MAP_H}`}
      preserveAspectRatio="xMidYMid meet"
      role={decorative ? 'presentation' : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : '東京都49自治体の、学童に入れない割合の地図'}
      {...handlers}
    >
      {geo.shapes.map((s) => {
        const c = cellOf(s.name);
        // 🔴 score が null は「データなし」。0点として色を付けない。
        //    excluded（母数不足）も色の計算に入れない。
        const score = !c || c.excluded ? null : c.score;
        return (
          <path
            key={s.code}
            className={`mp${selected === s.name ? ' sel' : ''}`}
            d={s.d}
            fill={fillOf(score, palette)}
            onClick={decorative ? undefined : () => onSelect?.(s.name)}
            style={decorative ? undefined : { cursor: 'pointer' }}
          >
            {!decorative && (
              <title>
                {s.name}　{score === null ? 'データなし' : `入れない割合 ${Math.round(score)}%`}
              </title>
            )}
          </path>
        );
      })}
      {labels.map((s) => (
        <text
          key={`t-${s.code}`}
          x={s.centroid[0]}
          y={s.centroid[1]}
          textAnchor="middle"
          dominantBaseline="middle"
          pointerEvents="none"
          style={{
            // 拡大率で割って、見た目の文字サイズを一定に保つ
            fontSize: 11 / scale,
            fontWeight: 700,
            fill: 'var(--ink-1)',
            paintOrder: 'stroke',
            stroke: 'var(--bg-0)',
            strokeWidth: 3 / scale,
            strokeLinejoin: 'round',
          }}
        >
          {s.name}
        </text>
      ))}
    </svg>
  );
}

export const Choropleth = memo(ChoroplethBase);
