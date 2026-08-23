/**
 * 選択自治体の「需要 vs 受け入れ実績」の折れ線と、需要の予測区間。
 *
 * 🔴 予測区間に `projection.band` を**そのまま使わないこと。**
 *    あれは児童数（全学年）の帯で、需要とは桁が違う。
 *    実測（中央区・2031年度）：demand 2,189.8 に対し band は 9,701.8〜10,966.5。
 *    需要は児童数に対して線形（demand = children × rTarget）なので、帯にも同じ rTarget を掛ける。
 *
 *    ②も `MuniDetail.series[].demandBand` で**同じ式**を公開している（docs/17 依頼B・対応済み）。
 *    ③は `MuniDetail` ではなく `CoreResult` から一度に描いているのでここで導出しているが、
 *    値は一致する。式を変えるときは②の `muniDetail.ts` と揃えること。
 *
 * dataviz スキルの決まりに従っている：
 *   - 軸は1本（需要も供給も単位は「人」）。二軸グラフにしない
 *   - 2系列なので凡例を必ず出し、直接ラベルも付ける（色だけで identity を作らない）
 *   - 文字は系列色ではなく ink トークン
 *   - 線は2px、グリッドと軸は控えめ、ホバーで十字線とツールチップ
 *   - 配色は validate_palette.js を通した（ライト #1c5cab/#b06a00・ダーク #4a90e2/#c98410）
 */
import { useState } from 'react';
import type { CoreResult } from '../core';
import type { Theme } from './palette';
import { fmt } from './data';

/**
 * 論理サイズの既定。解説列（実測 498px）に置くと 900 では文字が 7px 相当まで縮むので、
 * 呼び出し側から実寸に近い値を渡せるようにしてある。viewBox の値を変えるだけ。
 */
const DEFAULT_W = 560;
const DEFAULT_H = 300;
const PAD = { t: 22, r: 78, b: 32, l: 58 };

/** 検証済み。ライト surface #fcfcfb / ダーク surface #101011 で全チェック PASS */
const SERIES_COLORS: Record<Theme, { demand: string; supply: string }> = {
  light: { demand: '#1c5cab', supply: '#b06a00' },
  dark: { demand: '#4a90e2', supply: '#c98410' },
};

/**
 * v 以上でいちばん近いきりのいい数。目盛りが半端にならないように。
 *
 * ⚠️ 刻みを 1・2・2.5・5 だけにすると、2,704 が 5,000 まで飛んで
 *    グラフの上半分が丸ごと空く。3・4 を挟んで、そこそこ詰まるようにする。
 */
function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const f of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (v <= f * mag) return f * mag;
  return 10 * mag;
}

interface Row {
  year: number;
  demand: number;
  supply: number;
  lo: number;
  hi: number;
  bridged: boolean;
}

export function Series({
  core,
  muni,
  theme,
  w = DEFAULT_W,
  h: H = DEFAULT_H,
}: {
  core: CoreResult;
  muni: string;
  theme: Theme;
  w?: number;
  h?: number;
}) {
  const W = w;
  const [hover, setHover] = useState<number | null>(null);
  const color = SERIES_COLORS[theme];

  const rows: Row[] = (core.byMuni.get(muni) ?? [])
    .filter((r) => r.projection !== null && r.detail.demand !== undefined)
    .map((r) => {
      const rTarget = r.detail.rTarget ?? 0;
      return {
        year: r.year,
        demand: r.detail.demand,
        supply: r.detail.supply,
        // 児童数の帯 × その年度の目標需要率 ＝ 需要の帯
        lo: r.projection!.band.lo * rTarget,
        hi: r.projection!.band.hi * rTarget,
        bridged: r.basis === 'bridged',
      };
    });

  if (rows.length < 2) return null;

  // 目盛りはきりのいい数にする。3,004 / 1,502 のような軸は、値そのものの信用を削る
  const yMax = niceCeil(Math.max(...rows.map((r) => Math.max(r.hi, r.demand, r.supply))) * 1.04);
  const x = (i: number) => PAD.l + (i / (rows.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / yMax) * (H - PAD.t - PAD.b);

  const line = (get: (r: Row) => number) =>
    rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(get(r)).toFixed(1)}`).join('');
  const bandPath =
    rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r.hi).toFixed(1)}`).join('') +
    rows
      .slice()
      .reverse()
      .map((r, i) => `L${x(rows.length - 1 - i).toFixed(1)},${y(r.lo).toFixed(1)}`)
      .join('') +
    'Z';

  const bridgeIdx = rows.findIndex((r) => r.bridged);
  const last = rows[rows.length - 1];
  const hv = hover === null ? null : rows[hover];

  return (
    <div className="series">
      <div className="series-hd">
        <p className="k">必要な数と、入れる数（人）</p>
        <span className="series-legend">
          <span style={{ background: color.demand }} />必要な数
          <span style={{ background: color.supply }} />入れる数
          <span className="bandkey" style={{ background: color.demand }} />予測区間
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${muni}の、学童を必要とする子の数と、実際に入れる数の推移`}
        onMouseLeave={() => setHover(null)}
      >
        {/* 目盛り。3本だけ */}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line className="ax" x1={PAD.l} x2={W - PAD.r} y1={y(yMax * f)} y2={y(yMax * f)} />
            <text className="lbl" x={PAD.l - 8} y={y(yMax * f)} textAnchor="end" dominantBaseline="middle">
              {fmt(yMax * f)}
            </text>
          </g>
        ))}

        {/* 需要の予測区間 */}
        <path className="bd" d={bandPath} fill={color.demand} />

        {/* bridged の境界 */}
        {bridgeIdx > 0 && (
          <>
            <line className="bridge" x1={x(bridgeIdx)} x2={x(bridgeIdx)} y1={PAD.t} y2={H - PAD.b} />
            <text className="lbl" x={x(bridgeIdx) + 5} y={PAD.t + 4}>
              ここから推定
            </text>
          </>
        )}

        <path d={line((r) => r.supply)} fill="none" stroke={color.supply} strokeWidth={2} strokeDasharray="5 4" />
        <path d={line((r) => r.demand)} fill="none" stroke={color.demand} strokeWidth={2} />

        {/* 直接ラベル。凡例と二重に持たせる（色だけに頼らない） */}
        <text className="lbl dl" x={W - PAD.r + 8} y={y(last.demand)} dominantBaseline="middle">
          必要な数
        </text>
        <text className="lbl dl" x={W - PAD.r + 8} y={y(last.supply)} dominantBaseline="middle">
          入れる数
        </text>

        {/* 年度ラベルは端と境界だけ */}
        {rows.map((r, i) =>
          i === 0 || i === rows.length - 1 || i === bridgeIdx ? (
            <text className="lbl" key={r.year} x={x(i)} y={H - PAD.b + 16} textAnchor="middle">
              {r.year}
            </text>
          ) : null,
        )}

        {/* ホバー。当たり判定は見た目より大きく取る */}
        {rows.map((r, i) => (
          <rect
            key={`hit-${r.year}`}
            x={x(i) - (W - PAD.l - PAD.r) / (rows.length - 1) / 2}
            y={PAD.t}
            width={(W - PAD.l - PAD.r) / (rows.length - 1)}
            height={H - PAD.t - PAD.b}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {hv && (
          <g pointerEvents="none">
            <line className="cross" x1={x(hover!)} x2={x(hover!)} y1={PAD.t} y2={H - PAD.b} />
            <circle cx={x(hover!)} cy={y(hv.demand)} r={4.5} fill={color.demand} stroke="var(--bg-1)" strokeWidth={2} />
            <circle cx={x(hover!)} cy={y(hv.supply)} r={4.5} fill={color.supply} stroke="var(--bg-1)" strokeWidth={2} />
          </g>
        )}
      </svg>
      <p className="series-tip">
        {hv ? (
          <>
            <b>{hv.year}年度</b>　必要な数 <b>{fmt(hv.demand)}</b>人（{fmt(hv.lo)}〜{fmt(hv.hi)}）／ 入れる数{' '}
            <b>{fmt(hv.supply)}</b>人{hv.bridged && '　※推定区間'}
          </>
        ) : (
          '折れ線にカーソルを合わせると、その年度の数値が出ます'
        )}
      </p>
    </div>
  );
}
