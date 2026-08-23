/** スクロール演出と地図操作のフック。ライブラリは入れない。 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MAP_H, MAP_W, type Box } from './geo';

/**
 * 画面に入ったら data-in を立てる（CSS 側でフェードイン）。
 *
 * ⚠️ JS が動かない／`prefers-reduced-motion` のときは CSS の既定が「可視」なので、
 *    何もしなくても内容は読める。ここで隠す責任は持たない。
 */
export function useInView<T extends HTMLElement>(): (el: T | null) => void {
  const io = useRef<IntersectionObserver | null>(null);
  if (io.current === null && typeof IntersectionObserver !== 'undefined') {
    io.current = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && e.target.setAttribute('data-in', '')),
      { threshold: 0.18 },
    );
  }
  useEffect(() => () => io.current?.disconnect(), []);
  return useCallback((el: T | null) => {
    if (el) io.current?.observe(el);
  }, []);
}

/** S3：スクロール位置に応じて「いま何番目のステップか」を返す */
export function useScrollStep(count: number): [number, (i: number) => (el: HTMLElement | null) => void] {
  const [step, setStep] = useState(0);
  const els = useRef<Array<HTMLElement | null>>(Array(count).fill(null));

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (!e.isIntersecting) continue;
          const i = els.current.indexOf(e.target as HTMLElement);
          if (i >= 0) setStep(i);
        }
      },
      { rootMargin: '-50% 0px -50% 0px' },
    );
    for (const el of els.current) if (el) io.observe(el);
    return () => io.disconnect();
  }, [count]);

  const ref = useCallback(
    (i: number) => (el: HTMLElement | null) => {
      els.current[i] = el;
    },
    [],
  );
  return [step, ref];
}

const FULL: Box = { x: 0, y: 0, w: MAP_W, h: MAP_H };

/**
 * 地図のズーム／パン。`viewBox` を state に持って書き換えるだけ。
 *
 * d3-zoom は 85KB ＋ 依存5件。ここでやることは wheel とドラッグと復帰だけなので入れない。
 * `<path>` は再生成されないので再描画も走らない（`vector-effect:non-scaling-stroke` で線幅も保つ）。
 */
export function useZoomPan() {
  const [vb, setVb] = useState<Box>(FULL);
  const svg = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

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

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
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

/**
 * いま画面のどのパネルを見ているか。解説列のナビに現在地を出すため。
 *
 * ⚠️ 固定ヘッダのぶんだけ上端を削っている（rootMargin の上側）。
 *    削らないと、ヘッダに隠れているパネルが「現在地」になる。
 */
export function useScrollSpy(ids: string[], topOffset = 110): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const key = ids.join(',');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const tops = new Map<string, number>();
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (e.isIntersecting) tops.set(e.target.id, e.boundingClientRect.top);
          else tops.delete(e.target.id);
        }
        // 🔴 「いちばん上にあるもの」ではなく「上端を通り過ぎた最後のもの」。
        //    前者だと、次のパネルを読んでいるあいだ手前のパネルが現在地のまま残る。
        let best: string | null = null;
        let bestTop = -Infinity;
        for (const [id, top] of tops) if (top <= topOffset && top > bestTop) [best, bestTop] = [id, top];
        if (best === null) {
          let minTop = Infinity;
          for (const [id, top] of tops) if (top < minTop) [best, minTop] = [id, top];
        }
        if (best) setActive(best);
      },
      { rootMargin: `-${topOffset}px 0px -45% 0px`, threshold: 0 },
    );
    for (const id of key.split(',')) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [key, topOffset]);

  return active;
}
