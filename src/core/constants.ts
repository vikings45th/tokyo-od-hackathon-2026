/**
 * ②ロジックの定数。数字はすべて出典つきで、ここ以外に散らばらせないこと。
 * 根拠：docs/14-basic-design.md（設計書）／docs/13-requirements.md（要件）
 */
import type { HousingType } from '../types';

/** 全ての起点。学童 2025-05-01・公立学校一覧 令和7年度・都の推計 令和7年度起点が揃う年（設計書 §4-3） */
export const BASE_YEAR = 2025;

/** 学童実績の基準日。r_latent の分子はここから取る（設計書 §4-1） */
export const GAKUDO_BASE_DATE = '2025-05-01';
/** トレンド実測の起点。2時点しかないので直線1本（要件 §10 未解決事項2） */
export const GAKUDO_PREV_DATE = '2023-05-01';

/**
 * 登録率の年あたり上昇幅の既定値。
 * 実測：48自治体・2023-05→2025-05 で 0.2423 → 0.2592、年あたり +0.0084（設計書 §0-2）。
 * 🔴 この1つの値がモデルを支配する。画面でスライダーにすること（要件 NFR-5）。
 */
export const DEFAULT_TREND = 0.0084;

/** 顕在需要率の上限。これ以上は現実的でない（設計書 §4-2） */
export const RATE_CAP = 0.6;

/** Scenario.trend のクランプ範囲（設計書 §7・docs/15-interfaces.md §4） */
export const TREND_MIN = -0.05;
export const TREND_MAX = 0.05;

/** HousingPlan.units のクランプ範囲（同上） */
export const UNITS_MIN = 0;
export const UNITS_MAX = 5000;

/** 母数不足の閾値。これ未満は対象範囲から除外（設計書 §4-4。実測：利島村 11人） */
export const SMALL_SAMPLE_N0 = 500;

/** 系列断絶の判定。2023-05 と 2025-05 で registered が何倍変わったら疑うか（設計書 §4-4） */
export const SERIES_BREAK_RATIO = 3;

/** 本物の供給不足の判定。r_latent がこの分位より下、かつ待機 > 0（設計書 §4-4） */
export const REAL_SHORTAGE_QUANTILE = 0.2;

/**
 * bridged 区間の予測区間をさらに広げる倍率。
 * ⚠️ 仮定。この区間は誤差を実測していない（ヴィンテージが3世代しかない・設計書 §5-3）。
 * 画面に「測っていない」と明記すること。
 */
export const BRIDGED_WIDEN = 1.5;

/** latentFloor の既定分位。都内で受け皿が厚い側の水準（P75） */
export const DEFAULT_LATENT_FLOOR_Q = 0.75;

/**
 * 生まれ年 → 小1になる年度のオフセット（4月2日以降生まれ）。
 * UC-1「2024年4月生まれ → 2031年度」に一致（要件 §5）。
 */
export const ENTRY_AGE_OFFSET = 7;

/**
 * 早生まれ（1〜3月生まれ）のオフセット。1年早く入学する。
 * 学校教育法：4月2日〜翌年4月1日生まれが同学年。
 * 早生まれは全体の約1/4なので、ここを間違えると見せる年度の列がまるごとずれる。
 */
export const EARLY_ENTRY_AGE_OFFSET = 6;

/**
 * 早生まれと見なす最後の月。
 * ⚠️ 厳密には「4月1日生まれ」も早生まれだが、月までしか受け取らないので区別できない。
 *    4月生まれは +7 として扱う（該当するのは4月1日生まれの1日ぶんだけ）。
 */
export const EARLY_BIRTH_LAST_MONTH = 3;

/** ヒートマップの最初の列。これ以前は住宅購入の意思決定に間に合わない（設計書 §6-1） */
export const FIRST_ENTRY_YEAR = 2027;

/** 「打てる手」に出す近隣自治体の件数（要件 FR-6） */
export const ALTERNATIVES_COUNT = 3;

/**
 * 住宅種別 × 学年別の児童発生率（1戸あたり）。東京都 `25es_survey` の実測値（設計書 §4-5）。
 * 🔴 数値を作るのは都の係数であって、LLMではない。
 * 配列は小1〜小6。
 */
export const HOUSING_COEFF: Record<HousingType, readonly number[]> = {
  都営住宅: [0.059, 0.054, 0.05, 0.047, 0.044, 0.042],
  都民住宅: [0.03, 0.027, 0.026, 0.025, 0.024, 0.024],
  UR賃貸: [0.01, 0.01, 0.0, 0.02, 0.02, 0.0],
  公社2DK: [0.019, 0.016, 0.014, 0.012, 0.01, 0.009],
  '公社3DK以上': [0.038, 0.032, 0.027, 0.023, 0.02, 0.018],
  民間マンションA: [0.013, 0.011, 0.01, 0.009, 0.008, 0.007],
  民間マンションB: [0.027, 0.025, 0.022, 0.02, 0.017, 0.015],
};

/** 低学年＝1〜3年（設計書 §4-2。分母は常に全学年にすること） */
export const LOWER_GRADE_COUNT = 3;
