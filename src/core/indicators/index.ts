/**
 * 軸の登録簿（設計書 §3・要件 FR-9）。
 *
 * 軸を追加する手順：
 *   1. src/core/indicators/<id>.ts に Indicator を実装する
 *   2. この配列に足す
 *   3. 重みを決める
 *   4. **画面もヒートマップも変更不要**
 */
import type { Indicator } from '../../types';
import { gakudoIndicator } from './gakudo';

export const INDICATORS: readonly Indicator[] = [gakudoIndicator];

export { gakudoIndicator };
