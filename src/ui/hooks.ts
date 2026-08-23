/**
 * 地図の操作とテーマのフック。ライブラリは入れない。
 *
 * 2026-08-23 第2版で `useInView` / `useScrollStep` / `useScrollSpy` を削除した。
 * スクロール連動の演出（フェードイン・年送り・解説列のナビ）をすべてやめたため。
 */
import { useEffect, useRef, useState } from 'react';
import { MAP_H, MAP_W, type Box } from './geo';

const FULL: Box = { x: 0, y: 0, w: MAP_W, h: MAP_H };

/** これ以上動いたらドラッグ。これ未満はクリック（自治体の選択）として扱う */
const DRAG_SLOP = 4;

/**
 * 地図のズーム／パン。`viewBox` を state に持って書き換えるだけ。
 *
 * d3-zoom は 85KB ＋ 依存5件。ここでやることは wheel とドラッグと復帰だけなので入れない。
 * `<path>` は再生成されないので再描画も走らない（`vector-effect:non-scaling-stroke` で線幅も保つ）。
 */
export function useZoomPan() {
  const [vb, setVb] = useState<Box>(FULL);
  const svg = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; captured: boolean } | null>(null);

  const clamp = (b: Box): Box => {
    const w = Math.min(Math.max(b.w, MAP_W / 9), MAP_W);
    const h = (w * MAP_H) / MAP_W;
    return {
      w,
      h,
      x: Math.min(Math.max(b.x, 0), MAP_W - w),
      y: Math.min(Math.max(b.y, 0), MAP_H - h),
    };
  };

  // wheel は passive:false でないと preventDefault できない。React の onWheel では効かない
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setVb((v) => {
        const px = v.x + ((e.clientX - r.left) / r.width) * v.w;
        const py = v.y + ((e.clientY - r.top) / r.height) * v.h;
        const f = e.deltaY < 0 ? 0.86 : 1 / 0.86;
        const nw = v.w * f;
        const nh = (nw * MAP_H) / MAP_W;
        return clamp({ x: px - ((px - v.x) * nw) / v.w, y: py - ((py - v.y) * nh) / v.h, w: nw, h: nh });
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /**
   * 🔴 pointerdown では **setPointerCapture してはいけない。**
   *    捕獲すると続く pointerup の target が <path> ではなく <svg> になり、
   *    click は pointerdown と pointerup の共通祖先（＝<svg>）に飛ぶ。
   *    その結果、自治体 <path> の onClick が一度も呼ばれず「地図を押しても選べない」になる。
   *    → 動き始めてから捕獲する。クリックとドラッグが両立する。
   */
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y, captured: false };
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.captured) {
      // まだクリックかもしれない。4px 動くまでは捕獲もパンもしない
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_SLOP) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      d.captured = true;
    }
    const r = e.currentTarget.getBoundingClientRect();
    setVb((v) =>
      clamp({ ...v, x: d.vx - ((e.clientX - d.x) / r.width) * v.w, y: d.vy - ((e.clientY - d.y) / r.height) * v.h }),
    );
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const reset = () => setVb(FULL);

  /** 矩形に寄る。縦横比は SVG に合わせる */
  const zoomTo = (box: Box | null) => {
    if (!box) return;
    const pad = 14;
    const w = Math.max(box.w + pad * 2, ((box.h + pad * 2) * MAP_W) / MAP_H);
    const h = (w * MAP_H) / MAP_W;
    setVb(clamp({ x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h }));
  };

  return {
    ref: svg,
    viewBox: `${vb.x} ${vb.y} ${vb.w} ${vb.h}`,
    /** 拡大率。1 = 全体。ラベルの出し分けと線幅の補正に使う */
    scale: MAP_W / vb.w,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      // タッチで touch-action:pan-y に持っていかれると pointerup が来ない。取りこぼすと掴みっぱなしになる
      onPointerCancel: onPointerUp,
      onDoubleClick: reset,
    },
    reset,
    zoomTo,
  };
}

/** テーマ。既定はライト。data-theme は :root に立てる */
export function useTheme(): ['light' | 'dark', () => void] {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))];
}
