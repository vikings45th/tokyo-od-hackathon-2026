/**
 * 「小1の壁」エリア選定サービス — 3人で合意する契約
 *
 * ⚠️ このファイルを変更したくなったら、必ず3人に声をかけてください。
 *    型の変更は全員の手を止めます（docs/10-roles-schedule.md §2）。
 *
 * 設計の根拠は docs/14-basic-design.md、要件は docs/13-requirements.md。
 */

// ─────────────────────────────────────────────────────────────
// 1. ①データ担当の出力 ＝ ②ロジック担当の入力
//    実体は data/app/*.json（①が生成してコミット）
// ─────────────────────────────────────────────────────────────

/** 学童データの注記の種別。区別しないと本物の供給不足が消える（設計書 §4-4） */
export type NoteKind =
  /**
   * 時点間でデータの計上方法が変わった疑い。
   * 🔴 トレンド計算から除外する（スコア計算には含めてよい）。
   * 実測：江戸川区 2023-05 は 4クラブ/141人 → 2025-05 は 72クラブ/6,623人
   */
  | 'series-break'
  /** 本物の供給不足。スコアに含める。実測：中央区（2025-05 登録1,291人・待機275人・顕在需要率0.163） */
  | 'real-shortage'
  /** 母数不足。対象範囲から除外。実測：利島村（母数11人） */
  | 'small-sample';

export interface Note {
  kind: NoteKind;
  /** 画面に出す文面。生成AI③が前処理で作り data/app/notes.json にコミットされる */
  text: string;
}

/** 学童クラブの実績。1時点ぶん */
export interface GakudoStat {
  /** 基準日。'2023-05-01' | '2025-05-01' | '2025-10-01' */
  asOf: string;
  /** クラブ数 */
  clubs: number;
  /** 登録児童数 */
  registered: number;
  /** 待機児童数。⚠️ 申込前に断念した人は含まれない（要件 §1-2 検証1） */
  waiting: number;
}

/** 自治体1件。data/app/munis.json は Muni[] */
export interface Muni {
  /** 全国地方公共団体コード（例 '13102'） */
  code: string;
  /** 例 '中央区' */
  name: string;
  /** 'ku' = 23区, 'shi' = 多摩26市 */
  area: 'ku' | 'shi';

  /** 都の公式推計：年度（西暦。令和7年度＝2025）→ 学年別児童数[6]。令和7〜12年度 */
  official: Array<{ year: number; grades: number[] }>;
  /** 就学予定者（＝入学者数）推計。令和7〜13年度入学 */
  entrants: Array<{ year: number; count: number }>;
  /**
   * 2025年度（令和7年度）の実績児童数（全学年）。r_latent の分母（設計書 §4-1 の N0）。
   * ✅ 学童の 2025-05-01 時点と基準年が揃っている（設計書 §4-3）
   */
  baseChildren: number;
  /** 2023年度（令和5年度）の実績児童数。トレンドの実測にのみ使う */
  children2023: number;

  /** 3時点（2023-05 / 2025-05 / 2025-10）。新しい順ではなく日付昇順で入れる */
  gakudo: GakudoStat[];
  note?: Note;
}

/** 学校1件。data/app/schools.json は School[]。②が予測の按分に使う */
export interface School {
  /** 学校番号（例 '201150'）。3ヴィンテージ共通のキー */
  id: string;
  /** 設置者（＝自治体名。Muni.name と一致） */
  muni: string;
  name: string;
  address: string;
  /**
   * 実績の学年別児童数。[令和5, 令和6, 令和7] の順。
   * 各要素は 1〜6年生の6要素。その年度に存在しない学校は null。
   */
  actual: Array<number[] | null>;
}

/** 全都の推計。bridged 区間の接続に使う（設計書 §5-2） */
export interface TokyoTotal {
  /** 年度 → 小学校1年生数。令和7〜20年度 */
  firstGraders: Array<{ year: number; count: number }>;
  /** 年度 → 小学校児童数（全学年）。令和7〜20年度 */
  allGrades: Array<{ year: number; count: number }>;
}

/** バックテストの実測誤差。data/app/backtest.json（設計書 §5-3） */
export interface Backtest {
  /** 何年先の推計を検証したか。実測できるのは 1 と 2 だけ */
  horizon: 1 | 2;
  /** 平均誤差（%）。実測：2年先 +0.26 */
  meanPct: number;
  /** 絶対誤差平均（%）。実測：2年先 1.51 */
  maePct: number;
  /** 誤差分布の10パーセンタイル（%） */
  p10Pct: number;
  /** 誤差分布の90パーセンタイル（%） */
  p90Pct: number;
  /** 検証に使った地区数。実測：57 */
  n: number;
}

/** ①の出力一式。data/sample.json もこの形 */
export interface AppData {
  munis: Muni[];
  schools: School[];
  tokyo: TokyoTotal;
  backtest: Backtest[];
  /** データセットごとの出典。画面に必ず出す（要件 FR-8・大会ルール） */
  sources: Source[];
}

export interface Source {
  name: string;
  provider: string;
  license: string;
  url: string;
  /** 取得日 'YYYY-MM-DD' */
  retrievedAt: string;
}

// ─────────────────────────────────────────────────────────────
// 2. シナリオ（②の入力。生成AI② または UI のスライダーが作る）
// ─────────────────────────────────────────────────────────────

export type HousingType =
  | '都営住宅' | '都民住宅' | 'UR賃貸'
  | '公社2DK' | '公社3DK以上'
  | '民間マンションA' | '民間マンションB';

export interface HousingPlan {
  /** Muni.name */
  muni: string;
  /** 完成年度（西暦） */
  year: number;
  /** 戸数。[0, 5000] にクランプする */
  units: number;
  type: HousingType;
}

export interface Scenario {
  /**
   * 登録率の年あたり上昇幅。既定 0.0084（＝+0.84pt/年・実測値）。
   *
   * 🔴 これがモデルを支配する（設計書 §0-2）。0 にすると49自治体中45が0点になる。
   *    都の3時点データ（2023-05 → 2025-05・48自治体）から実測した値。
   *    ただし自治体間のばらつきが大きい（p10 +0.28pt / p90 +1.87pt・豊島区は -1.82pt）ため、
   *    「都平均の1点を全自治体に当てている仮定」だと画面に明示すること。
   *    [-0.05, +0.05] にクランプする。
   */
  trend?: number;
  /**
   * 顕在需要率の下限。未指定なら下限なし（＝実測の r_latent をそのまま使う・既定）。
   *
   * 「申込前に断念した人」は登録にも待機にも入っていない（要件 §1-2 検証1）。
   * r_latent は需要の下限でしかないので、これを指定すると
   * 「抑制された需要が、受け皿の厚い区並みに満たされたら」を計算できる。
   * 値は `latentFloorFromData(data)`（都内 P75・実測分布）で出す。定数を捏造しないこと。
   */
  latentFloor?: number;
  /** 年度ごとの供給倍率。既定はすべて 1.0（＝クラブが増えない） */
  supplyGrowth?: Array<{ year: number; factor: number }>;
  housing?: HousingPlan[];
}

// ─────────────────────────────────────────────────────────────
// 3. 予測エンジンと指標プラグイン（②の内部。軸追加の受け口）
// ─────────────────────────────────────────────────────────────

/** 予測値の根拠区分。画面に必ず出す（要件 NFR-5・設計書 §5-2） */
export type Basis =
  /** 区市町村別の都の公式推計そのもの。令和9〜13年度入学 */
  | 'official'
  /** 全都の公式推計の伸び率を接続した推定。令和14〜20年度入学。区ごとの伸びの差は失われる */
  | 'bridged';

/** 1自治体・1年度の児童数予測 */
export interface Projection {
  muni: string;
  year: number;
  basis: Basis;
  /** 全学年児童数の予測 */
  children: number;
  /** 低学年（1〜3年）の予測。詳細画面の補助表示用 */
  lowerGrades: number;
  /** 予測区間（全学年児童数） */
  band: { lo: number; hi: number };
}

export interface IndicatorInput {
  muni: Muni;
  /** 入学年度（西暦） */
  year: number;
  projection: Projection;
  scenario: Required<Pick<Scenario, 'trend'>> & Scenario;
}

export interface IndicatorResult {
  /** 0〜100。100 が最も悪い */
  score: number;
  /** 画面の詳細表示用。軸ごとに中身が違ってよい */
  detail: Record<string, number>;
  note?: Note;
  /** true ならスコア対象外・別枠表示。🔴 ヒートマップの色計算に入れないこと */
  excluded?: boolean;
}

/**
 * 軸。v1は 'gakudo' 1つだけ登録し weight = 1.0。
 * 軸2・3は src/core/indicators/index.ts の配列に足すだけでよい（設計書 §3）。
 */
export interface Indicator {
  id: string;
  label: string;
  weight: number;
  higherIsWorse: true;
  /** ⚠️ 純関数にすること。49自治体 × 年度ぶん呼ばれる */
  compute(input: IndicatorInput): IndicatorResult | null;
}

// ─────────────────────────────────────────────────────────────
// 4. ②の出力 ＝ ③UI担当の入力
// ─────────────────────────────────────────────────────────────

export interface HeatmapCell {
  muni: string;
  year: number;
  /** 総合スコア 0〜100。null はデータなし（グレー表示。0点として扱わない） */
  score: number | null;
  basis: Basis;
  excluded: boolean;
}

export interface Heatmap {
  /** 行の並び。既定は focusYear のスコア降順 */
  munis: string[];
  /** 列の並び。入学年度 */
  years: number[];
  cells: HeatmapCell[];
  /** ユーザーの子が小1になる年度 */
  focusYear: number;
  /** official と bridged の境界year。この年度から bridged */
  bridgeFrom: number;
  /** excluded の自治体（別枠表示用） */
  excludedMunis: Array<{ muni: string; note: Note }>;
}

/** 自治体を選んだときの詳細 */
export interface MuniDetail {
  muni: Muni;
  /** 年度ごとの内訳。軸1の detail をそのまま含む */
  series: Array<{
    year: number;
    basis: Basis;
    score: number;
    /** 需要（人） */
    demand: number;
    /** 供給（人） */
    supply: number;
    /** 不足人数 */
    gap: number;
    /** 登録率（目標） */
    targetRate: number;
    band: { lo: number; hi: number };
  }>;
  note?: Note;
  /** 打てる手を出すための近隣比較（スコアが低い順に数件） */
  alternatives: Array<{ muni: string; score: number }>;
}

// ─────────────────────────────────────────────────────────────
// 5. /api/scenario（②の内部。③はローディングと失敗表示のために形だけ知る）
// ─────────────────────────────────────────────────────────────

export interface ScenarioRequest {
  /** ユーザーが書いた自然文 */
  text: string;
  /** 選択肢を絞るために自治体名の一覧を渡す */
  munis: string[];
}

export type ScenarioResponse =
  | { ok: true; scenario: Scenario; /** 画面に出す解釈結果の要約 */ summary: string }
  /**
   * 解釈に失敗。⚠️ このときも UI はベースラインのスコアとヒートマップを
   * 表示し続けること（要件 NFR-2）
   */
  | { ok: false; reason: string };
