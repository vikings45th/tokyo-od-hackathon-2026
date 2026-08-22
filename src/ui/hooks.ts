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
      // 🔴 修飾キーなしのホイールは**ページに通す**。
      //    以前は無条件に preventDefault していたため、全幅の地図がページスクロールの
      //    トラップになっていた（下へ読み進められない）。拡大縮小は ⌘/Ctrl＋ホイール、
      //    または zoombar の ＋/− ボタンで行う。
      if (!e.ctrlKey && !e.metaKey) return;
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

  /** 中心を保ったまま f 倍する。zoombar の ＋/− 用（ホイールに頼らない導線） */
  const zoomBy = (f: number) =>
    setVb((v) => {
      const cx = v.x + v.w / 2;
      const cy = v.y + v.h / 2;
      const nw = v.w / f;
      const nh = (nw * MAP_H) / MAP_W;
      return clamp({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh });
    });

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
    handlers: { onPointerDown, onPointerMove, onPointerUp, onDoubleClick: reset },
    reset,
    zoomTo,
    zoomBy,
    /** 全体表示に戻っているか。＋/− の disabled 判定に使う */
    atFull: vb.w >= MAP_W,
  };
}

/**
 * テーマ。**既定は OS の設定に従う**（以前は light 固定だった）。
 * 一度切り替えたら localStorage に残す。動画は1モードで撮る方針（docs/16 §14-2）なので
 * 収録時は既定のまま触らない。
 */
export function useTheme(): ['light' | 'dark', () => void] {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      /* プライベートウィンドウなどで throw することがある */
    }
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return [
    theme,
    () =>
      setTheme((t) => {
        const next = t === 'light' ? 'dark' : 'light';
        try {
          localStorage.setItem('theme', next);
        } catch {
          /* 保存できなくても動作に影響しない */
        }
        return next;
      }),
  ];
}

/**
 * 画面の状態を URL に持たせる（設計書 §9）。
 *
 * 🔴 これが無いと「審査員にこのURLを開いてください」と言えないし、
 *    **8/26〜31 の収録で同じ画面を再現できない**（別マシン・1週間後）。
 * ルータは入れない。`URLSearchParams` ＋ `history.replaceState` で足りる。
 */
export function readParam(key: string): string | null {
  if (typeof location === 'undefined') return null;
  return new URLSearchParams(location.search).get(key);
}

/** 渡した値を URL に反映する。null / undefined のキーは消す */
export function useSyncUrl(params: Record<string, string | null | undefined>): void {
  const json = JSON.stringify(params);
  useEffect(() => {
    if (typeof location === 'undefined') return;
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(JSON.parse(json) as Record<string, string | null>)) {
      if (v !== null && v !== undefined && v !== '') sp.set(k, v);
    }
    const q = sp.toString();
    history.replaceState(null, '', q ? `?${q}` : location.pathname);
  }, [json]);
}

/**
 * 画面に入ったら 0 → target までカウントアップする。2分動画の見せ場用。
 *
 * ライブラリは足さない（Motion を入れると gzip +40KB を超える。docs/16 §7-3）。
 * 🔴 初期値は target そのもの。JS が動かない／`prefers-reduced-motion` のときは
 *    そのまま最終値が出るので、数字が 0 のまま止まることはない。
 */
export function useCountUp(target: number, ms = 1200): [number, (el: HTMLElement | null) => void] {
  const [v, setV] = useState(target);
  const done = useRef(false);
  useEffect(() => {
    if (!done.current) setV(target);
  }, [target]);
  const ref = useCallback(
    (el: HTMLElement | null) => {
      if (!el || done.current) return;
      if (typeof IntersectionObserver === 'undefined') return;
      if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const io = new IntersectionObserver(
        (es) => {
          for (const e of es) {
            if (!e.isIntersecting || done.current) continue;
            done.current = true;
            io.disconnect();
            const t0 = performance.now();
            const tick = (t: number) => {
              const p = Math.min(1, (t - t0) / ms);
              setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
              if (p < 1) requestAnimationFrame(tick);
            };
            setV(0);
            requestAnimationFrame(tick);
          }
        },
        { threshold: 0.4 },
      );
      io.observe(el);
    },
    [target, ms],
  );
  return [v, ref];
}
