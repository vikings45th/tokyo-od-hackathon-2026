/**
 * データの読み込みと、②ロジックの呼び出し。
 *
 * 🔴 fetch していません。**import しています。**
 *    Vite が JSON をバンドルに畳み込むので、実行時のネットワークも
 *    `publicDir` の設定も要りません（NFR-4：ビルドがネットに触れないこと）。
 *
 * 読んでいるのは①の `data/app/data.json`（49自治体・出典7件）です。
 * `data/sample.json`（6自治体）は②③が先に書くための実測ベースのダミーで、
 * **画面からは参照しません。** core のテストは `__tests__/fixtures.ts` を使います。
 */
import appData from '../../data/app/data.json';
import topo from '../../data/geo/tokyo-49.topo.json';
import type { AppData, Scenario } from '../types';
import { computeAll, measureTrend, type CoreResult } from '../core';
import { buildGeo, type GeoIndex } from './geo';

export const DATA: AppData = appData as unknown as AppData;
export const GEO: GeoIndex = buildGeo(topo);

/** 実測トレンド。画面に「既定値の根拠」を出すため（要件 NFR-5） */
export const TREND = measureTrend(DATA);

/** シナリオを当てて全自治体×全年度を1回で計算する */
export function compute(scenario?: Scenario): CoreResult {
  return computeAll(DATA, scenario);
}

/**
 * 地図に描く自治体のうち、データが1件も無いもの。
 * `data/app/data.json` は地図と同じ49自治体を持つので、通常は空になる。
 * 空でなくなったら①のパイプラインと `tokyo-49.topo.json` がずれている合図。
 */
export function missingMunis(core: CoreResult): string[] {
  const has = new Set(core.cells.map((c) => c.muni));
  return GEO.shapes.map((s) => s.name).filter((n) => !has.has(n));
}

export const fmt = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString('ja-JP');

/** 小数1桁のパーセントポイント表記（トレンド用） */
export const pt = (rate: number): string => `${rate >= 0 ? '+' : ''}${(rate * 100).toFixed(2)}pt`;
