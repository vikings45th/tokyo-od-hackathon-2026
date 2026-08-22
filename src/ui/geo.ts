/**
 * 地図の下ごしらえ。地図ライブラリは入れない。
 *
 * - `topojson-client` … TopoJSON の展開と `neighbors()`（共有arcから隣接を求める）
 * - `d3-geo`          … メルカトル投影とパス生成
 *
 * 合わせて実測 0.27MB。maplibre 18.5MB / leaflet 3.6MB は要らない。
 * 描くのは49ポリゴンの静的コロプレスで、タイルもジオコーディングも使わないため。
 */
import { feature, neighbors } from 'topojson-client';
import { geoMercator, geoPath } from 'd3-geo';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Geometry } from 'geojson';

/**
 * SVG の論理サイズ。viewBox の初期値でもある。
 *
 * ⚠️ 縦横比は東京都の実測に寄せてある（49自治体の投影後バウンディングボックスは
 *    684 × 376 ＝ 1.82:1）。ここを極端な横長にすると、23区（実測 311 × 311 ＝ ほぼ正方形）へ
 *    寄ろうとしたときに**高さで頭打ちになってほとんど拡大されない。**
 */
export const MAP_W = 900;
export const MAP_H = 520;

export interface MuniProps {
  code: string;
  name: string;
}

export interface MuniShape {
  code: string;
  name: string;
  /** SVG の d 属性 */
  d: string;
  /** ラベル置き場（重心） */
  centroid: [number, number];
  /** 地理的に隣接する自治体名 */
  neighbors: string[];
}

export interface GeoIndex {
  shapes: MuniShape[];
  byName: Map<string, MuniShape>;
  /** 23区の自治体名（「23区へ」ズーム用） */
  kuNames: string[];
}

/**
 * TopoJSON → 描画用インデックス。1回だけ実行する。
 *
 * 🔴 `neighbors()` は**共有 arc** から隣接を出す。②の `MuniDetail.alternatives`
 *    （＝同じ area 区分＝23区／多摩26市）とは別物で、こちらが本物の「近隣」。
 *    中央区の近隣に世田谷区が並ぶのを避けるため③で作り直している。
 */
export function buildGeo(topo: unknown): GeoIndex {
  const t = topo as Topology<{ tokyo: GeometryCollection<MuniProps> }>;
  const geoms = t.objects.tokyo.geometries;
  const fc = feature(t, t.objects.tokyo) as unknown as {
    features: Array<Feature<Geometry, MuniProps>>;
  };

  const projection = geoMercator().fitExtent(
    [
      [12, 12],
      [MAP_W - 12, MAP_H - 12],
    ],
    fc as never,
  );

  const path = geoPath(projection);

  // neighbors() は geometries と同じ添字で返る
  const nb = neighbors(geoms as never[]);

  const shapes: MuniShape[] = fc.features.map((f, i) => {
    const c = path.centroid(f as never);
    return {
      code: f.properties.code,
      name: f.properties.name,
      d: path(f as never) ?? '',
      centroid: [c[0], c[1]],
      neighbors: nb[i].map((j) => fc.features[j].properties.name),
    };
  });

  return {
    shapes,
    byName: new Map(shapes.map((s) => [s.name, s])),
    kuNames: shapes.filter((s) => s.name.endsWith('区')).map((s) => s.name),
  };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 指定した自治体群を囲む矩形（投影後の座標） */
export function bboxOf(geo: GeoIndex, names: string[]): Box | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of names) {
    const s = geo.byName.get(n);
    if (!s) continue;
    // d 属性から座標を拾うのは重いので、重心±で近似せず path のコマンドを走査する
    for (const m of s.d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)) {
      const x = Number(m[1]);
      const y = Number(m[2]);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (!Number.isFinite(x0)) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
