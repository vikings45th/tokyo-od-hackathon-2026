/** 49自治体のコロプレス地図。地図ライブラリは使わずインラインSVG。 */
import { memo } from 'react';
import { MAP_H, MAP_W, type GeoIndex } from './geo';
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
  /**
   * いまの拡大率（1 = 全体）。1.8 以上で自治体名を出す。
   * 全体表示のときに49件の名前を出すと潰れて読めないため。
   */
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
  const showLabels = !decorative && scale >= 1.55;
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
      {showLabels &&
        geo.shapes.map((s) => (
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
