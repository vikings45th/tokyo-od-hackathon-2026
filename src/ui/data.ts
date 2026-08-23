/**
 * データの読み込みと、②ロジックの呼び出し。
 *
 * 🔴 fetch していません。**import しています。**
 *    Vite が JSON をバンドルに畳み込むので、実行時のネットワークも
 *    `publicDir` の設定も要りません（NFR-4：ビルドがネットに触れないこと）。
 *
 * ①の `data/app/data.json`（49自治体・1,241校）に差し替え済み（2026-08-23）。
 */
import topo from '../../data/geo/tokyo-49.topo.json';
import type { AppData, Scenario } from '../types';
import { computeAll, measureTrend, type CoreResult } from '../core';
import { buildGeo, type GeoIndex } from './geo';

// 🔴 sample.json は import しない（バンドルに載ってしまう）。型の参照先としてのみ残す。
import appData from '../../data/app/data.json';

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
 * 実データ（49自治体）に差し替え済みなので、通常は空になる。
 */
export function missingMunis(core: CoreResult): string[] {
  const has = new Set(core.cells.map((c) => c.muni));
  return GEO.shapes.map((s) => s.name).filter((n) => !has.has(n));
}

export const fmt = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString('ja-JP');

/** 小数1桁のパーセントポイント表記（トレンド用） */
export const pt = (rate: number): string => `${rate >= 0 ? '+' : ''}${(rate * 100).toFixed(2)}pt`;
