/**
 * 画面本体。
 *
 * ── 2026-08-23 リデザイン（第3版）──
 * 骨格は第2版の「1本の縦スクロール」を踏襲。モード転換の合図は幅：
 *
 *     .read  660px 中央寄せ  #lede → #why → #ask                       … 読む
 *     ──────────────────────────────────────────────────  ← ここで幅が変わる
 *     .wide 1360px          #tool → #choose → #muni → #heat → #scenario … 使う
 *     ──────────────────────────────────────────────────  ← ここで幅が戻る
 *     .read                 #evidence → #sources                        … 確かめる
 *
 * 第3版で変えたこと：
 *   - 地図を全幅にして一番の見せ場にした。選択中の明細（.selbar）は地図の**真下に横1行**。
 *     クリックの結果が視線の先で変わる
 *   - **#choose を新設。**「学童に入れないのはどこか」だけでなく「どこに住めばいいか」を答える
 *   - 順位は「いま厳しい順」と「全員入れる期間が長い順」の2本立て（別の問いなので混ぜない）
 *
 * 🔴 年度は viewYear 1本。地図・順位・明細・ヒートマップの強調列は必ずこれで描く。
 *    どれか1つが別の年度を見ていると、そこから先の数字が全部信用されなくなる。
 * 🔴 単軸（学童）しか持っていないので「総合おすすめ度」は名乗らない。
 *    通勤時間・住宅価格は docs/13-requirements.md §4 で意識的に捨てた軸。
 *    #choose には必ず「学童の受け皿だけを見た順です」と断りを出す。
 *
 * 箱（枠線＋影のカード）は使わない。区切りは余白と1pxのヘアラインだけ。
 */
import { useMemo, useState } from 'react';
import { PRESET_SCENARIOS, entryYearOf, isEarlyBirth, type CoreCell, type CoreResult } from '../core';
import type { Muni, Scenario, Source } from '../types';
import { BIN_LABELS, PALETTES, binOf, fillOf, type Palette } from './palette';
import { Choropleth } from './Choropleth';
import { Series } from './Series';
import { HeroMark } from './HeroMark';
import { DATA, GEO, GEO_SOURCE, TREND, compute, fmt, missingMunis, pt } from './data';
import { bboxOf } from './geo';
import { useTheme, useZoomPan } from './hooks';

/** 学童実績の基準日。②の GAKUDO_BASE_DATE と同じ日付を見る */
const GAKUDO_NOW = '2025-05-01';

/** 行のスコアを引く。無ければ undefined */
const cellAt = (core: CoreResult, muni: string, year: number): CoreCell | undefined =>
  core.byMuni.get(muni)?.find((r) => r.year === year);

/** 指定年度のスコア降順。null は末尾 */
function rankMunis(core: CoreResult, year: number): string[] {
  return core.munis
    .map((m) => m.name)
    .sort((a, b) => {
      const sa = cellAt(core, a, year)?.score ?? null;
      const sb = cellAt(core, b, year)?.score ?? null;
      if (sa === null && sb === null) return a.localeCompare(b, 'ja');
      if (sa === null) return 1;
      if (sb === null) return -1;
      return sb - sa || a.localeCompare(b, 'ja');
    });
}

/**
 * 「どこに住めばいいか」を答えるための指標。
 *
 * 🔴 素直に「入れない割合が低い順」を出すと、下位に 0% が大量に並んで順位にならない
 *    （上位は 41 / 13 / 12 … だが、下に行くほど 0 が連続する分布）。
 *    そこで「**入れない子が1人でも出る最初の年度**」で並べる。
 *    % ではなく人数を閾値にしているのは、恣意的な %閾値を持ち込まずに済むから。
 *    同着（最後まで0人）は「最終年度のスコア昇順 → 最終年度の余裕人数 降順」で割る。
 *
 * この指標はこのサービスの論点そのもの（意思決定と痛みが最大6年ずれる）に直結している。
 */
interface Hold {
  muni: string;
  /**
   * 最初に不足が出る年度。最後まで出なければ null。
   * ⚠️ 「その年から先ずっと不足する」ではない。需要は年で上下するので、
   *    いったん不足してから戻る自治体がある。文言も「最初に不足するのは」にしてある。
   */
  breakYear: number | null;
  /** 最終年度のスコア。同着を割る第2キー */
  lastScore: number;
  /** 最終年度の余裕人数（受け入れ − 必要）。同着を割る第3キー */
  margin: number;
  /**
   * いま見ている年度に入れない子の人数。表示用。
   * 🔴 % ではなく人数を出す。数人の不足は四捨五入で 0% になるので、
   *    「2027年度から入れない子が出る」の隣に「0%」が並んで矛盾して見える。
   */
  gap: number | null;
}

function holdOf(core: CoreResult, muni: string, viewYear: number): Hold {
  const rows = (core.byMuni.get(muni) ?? []).filter((r) => !r.excluded);
  // 🔴 四捨五入しない。0.6人を「1人」に丸めると、モデルの分解能を超えた主張になる
  const bad = rows.find((r) => (r.detail.gap ?? 0) >= 1);
  const last = rows[rows.length - 1];
  return {
    muni,
    breakYear: bad?.year ?? null,
    lastScore: last?.score ?? Number.POSITIVE_INFINITY,
    margin: (last?.detail.supply ?? 0) - (last?.detail.demand ?? 0),
    gap: cellAt(core, muni, viewYear)?.detail.gap ?? null,
  };
}

/** 良い順（長く持ちこたえる順）。null（最後まで不足なし）が先 */
function compareHold(a: Hold, b: Hold): number {
  const ka = a.breakYear ?? Number.POSITIVE_INFINITY;
  const kb = b.breakYear ?? Number.POSITIVE_INFINITY;
  if (ka !== kb) return kb - ka;
  if (a.lastScore !== b.lastScore) return a.lastScore - b.lastScore;
  if (a.margin !== b.margin) return b.margin - a.margin;
  return a.muni.localeCompare(b.muni, 'ja');
}

/**
 * `real-shortage` 7自治体を1文で括ると、悪化中（府中市・稲城市）と
 * 改善中だが残る（練馬区 292→47・足立区 263→179）が同じ扱いになる。
 * ①の note.text は区別できているので、要約側も待機児童の増減で出し分ける。
 */
function shortageLine(muni: Muni | undefined): string {
  const prev = muni?.gakudo.find((g) => g.asOf === '2023-05-01');
  const cur = muni?.gakudo.find((g) => g.asOf === GAKUDO_NOW);
  if (!prev || !cur) return '需要が無いのではなく、受け皿が足りていません。';
  return cur.waiting > prev.waiting
    ? '受け皿の拡大が、需要の伸びに追いついていません。'
    : '改善は進んでいますが、まだ全員は入れていません。';
}

function Tip({ children, body }: { children: React.ReactNode; body: string }) {
  return (
    <span className="tip" tabIndex={0}>
      {children}
      <span className="tipbody" role="tooltip">
        {body}
      </span>
    </span>
  );
}

/** 生まれ年月の選択。ヘッダ（.bar）と蝶番（#ask）で同じ state を共有する */
function BirthPicker({
  birthYear,
  birthMonth,
  onYear,
  onMonth,
  idPrefix,
}: {
  birthYear: number;
  birthMonth: number;
  onYear: (v: number) => void;
  onMonth: (v: number) => void;
  idPrefix: string;
}) {
  return (
    <>
      <select
        className="pick"
        value={birthYear}
        aria-label={`子の生まれ年（${idPrefix}）`}
        onChange={(e) => onYear(Number(e.target.value))}
      >
        {Array.from({ length: 13 }, (_, i) => 2019 + i).map((y) => (
          <option key={y} value={y}>
            {y}年
          </option>
        ))}
      </select>
      <select
        className="pick"
        value={birthMonth}
        aria-label={`子の生まれ月（${idPrefix}）`}
        onChange={(e) => onMonth(Number(e.target.value))}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={m}>
            {m}月
          </option>
        ))}
      </select>
    </>
  );
}

/** #choose の1行。左（近くの候補）と右（順位）で使い回す */
function ChooseRow({
  hold,
  lastYear,
  rank,
  current,
  onSelect,
}: {
  hold: Hold;
  lastYear: number;
  rank?: number;
  current?: boolean;
  onSelect: (m: string) => void;
}) {
  return (
    <div
      className={`crow${current ? ' cur' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(hold.muni)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(hold.muni)}
    >
      {rank !== undefined && <span className="ci tab">{rank}</span>}
      <span className="cn">
        {hold.muni}
        {current && <em>いま見ている</em>}
      </span>
      <span className={`ch${hold.breakYear === null ? ' ok' : ''}`}>
        {hold.breakYear === null ? (
          <>
            {lastYear}年度まで、どの年も全員入れる
          </>
        ) : (
          <>
            最初に不足するのは <b className="tab">{hold.breakYear}</b>年度
          </>
        )}
      </span>
      <span className="cv tab">{hold.gap === null ? '—' : `${fmt(hold.gap)}人`}</span>
    </div>
  );
}

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const palette = PALETTES[theme];

  const [birthYear, setBirthYear] = useState(2024);
  const [birthMonth, setBirthMonth] = useState(6);
  const [trend, setTrend] = useState<number>(TREND.trend);
  const [presetId, setPresetId] = useState('baseline');
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  /** #choose 右の並べ替え。「長く持つ順」と「いま厳しい順」は別の問いなので混ぜない */
  const [rankMode, setRankMode] = useState<'hold' | 'risk'>('hold');

  /** 年スクラバで上書きした年度。null なら「あなたの子が小1になる年度」 */
  const [yearOverride, setYearOverride] = useState<number | null>(null);

  const preset = PRESET_SCENARIOS.find((p) => p.id === presetId) ?? PRESET_SCENARIOS[0];

  // シナリオ＝プリセット ＋ スライダーの trend。trend は常にユーザーの値が勝つ
  const scenario: Scenario = useMemo(() => {
    const base = preset.build({ data: DATA, muni: selected ?? undefined });
    return presetId === 'trend15' ? base : { ...base, trend };
  }, [preset, presetId, selected, trend]);

  const core = useMemo(() => compute(scenario), [scenario]);
  const missing = useMemo(() => missingMunis(core), [core]);

  const firstYear = core.years[0];
  const lastYear = core.years[core.years.length - 1];
  const rawFocus = entryYearOf(birthYear, birthMonth);
  /** 表の射程外に出た年度は、外に出たと明示したうえで端に寄せる（FR-1） */
  const outOfRange = rawFocus < firstYear || rawFocus > lastYear;
  const focusYear = Math.min(Math.max(rawFocus, firstYear), lastYear);
  const viewYear = yearOverride ?? focusYear;

  const order = useMemo(() => rankMunis(core, viewYear), [core, viewYear]);
  /** 未選択のときの既定。🔴 viewYear ではなく focusYear で決める（年を動かすたび選択が飛ぶのを防ぐ） */
  const defaultSel = useMemo(() => rankMunis(core, focusYear)[0] ?? null, [core, focusYear]);
  const sel = selected ?? defaultSel;

  const selCell = sel ? cellAt(core, sel, viewYear) : undefined;
  const selMuni = DATA.munis.find((m) => m.name === sel);
  const selGakudo = selMuni?.gakudo.find((g) => g.asOf === GAKUDO_NOW);
  const note = sel ? core.notes.get(sel) : undefined;

  /** 全自治体を「長く持ちこたえる順」に並べたもの。#choose の右で使う */
  const holdRank = useMemo(
    () => core.munis.map((m) => holdOf(core, m.name, viewYear)).sort(compareHold),
    [core, viewYear],
  );
  /** 最後まで1人も不足しない自治体の数。#choose の見出しに出す */
  const safeCount = useMemo(() => holdRank.filter((h) => h.breakYear === null).length, [holdRank]);

  /** 選択自治体と、地理的に隣接する自治体を良い順に。#choose の左で使う */
  const nearby = useMemo(() => {
    if (!sel) return [];
    return (GEO.byName.get(sel)?.neighbors ?? [])
      .filter((n) => core.byMuni.has(n))
      .map((n) => holdOf(core, n, viewYear))
      .sort(compareHold);
  }, [sel, core, viewYear]);
  const selHold = useMemo(() => (sel ? holdOf(core, sel, viewYear) : null), [sel, core, viewYear]);

  /**
   * #why の3点目「待機児童数では順位が付かない」の根拠。
   * 🔴 実データから数える。docs/20 に書いてある数字を写経しない（データが更新されたら嘘になる）。
   */
  const waitingStat = useMemo(() => {
    const rows = DATA.munis
      .map((m) => m.gakudo.find((g) => g.asOf === GAKUDO_NOW))
      .filter((g): g is NonNullable<typeof g> => !!g);
    return { zero: rows.filter((g) => g.waiting === 0).length, total: rows.length };
  }, []);

  /**
   * 出典をライセンスごとに束ねる。出現順は data.json の順を保つ。
   * 🔴 地図のポリゴン（国土数値情報）は data.json の sources に入っていないので③が足している。
   *    カタログ掲載の CC BY 4.0 と混ぜて「いずれも CC BY」と書かない（FR-8）。
   */
  const licenseGroups = useMemo(() => {
    const m = new Map<string, Source[]>();
    for (const s of [...DATA.sources, GEO_SOURCE as Source]) {
      const g = m.get(s.license);
      if (g) g.push(s);
      else m.set(s.license, [s]);
    }
    return [...m.entries()];
  }, []);

  // 実測値からどれだけ離れているか。0.3pt/年 以上ずれたら画面に出す
  const offMeasured = Math.abs(core.scenario.trend - TREND.trend) > 0.003;

  const zp = useZoomPan();
  // 🔴 選択自治体が上位10件の外なら、末尾ではなく先頭に出す。
  //    地図で選んだ結果が表のどこに出たのか探させない
  const top10 = order.slice(0, 10);
  const heatRows = expanded ? order : sel && !top10.includes(sel) ? [sel, ...top10] : top10;
  const bridged = viewYear >= core.bridgeFrom;
  const pct = (y: number) => ((y - firstYear) / (lastYear - firstYear)) * 100;

  return (
    <>
      {/* ══ 固定ヘッダ。ペインではなくツールバー ══ */}
      <header className="bar">
        <span className="brand">小1の壁マップ</span>
        <span className="sep" />
        <div className="ctl">
          <span className="k">子の生まれ</span>
          <BirthPicker
            birthYear={birthYear}
            birthMonth={birthMonth}
            onYear={setBirthYear}
            onMonth={setBirthMonth}
            idPrefix="ヘッダ"
          />
          <span className="k">→ 小1は</span>
          <span className="eq tab">{rawFocus}年度</span>
          {isEarlyBirth(birthMonth) && (
            <Tip body="学校教育法では4月2日〜翌年4月1日生まれが同学年です。1〜3月生まれ（早生まれ）は入学年度が1年早くなります。">
              <span className="k" style={{ color: 'var(--warn)' }}>
                早生まれ
              </span>
            </Tip>
          )}
        </div>
        <div className="right">
          <a className="barlink go" href="#tool">
            地図で調べる ↓
          </a>
          <a className="barlink" href="#evidence">
            精度
          </a>
          <a className="barlink" href="#sources">
            出典
          </a>
          <button className="theme-btn" onClick={toggleTheme}>
            {theme === 'light' ? 'DARK' : 'LIGHT'}
          </button>
        </div>
      </header>

      <main>
        {/* ══════════ 読む ══════════ */}

        {/* ── #lede ── 表紙にしない。1画面は占有させない ── */}
        <section id="lede">
          <div className="read">
            <HeroMark />
            <div>
              <h1>
                保育園には、入れた。
                <br />
                <em>小1の壁は、どこにある？</em>
              </h1>
              {/* 🔴 「親のどちらかが働き方を変える」から始めない。
                  読者が学童の意味を知っていること・家を買おうとしていることを前提にしていて、
                  初見だと唐突。学童とは何か → 何が起きるか → このページは何をするか、の順にする。 */}
              <p className="lede">
                小学校に上がると、放課後の預け先は保育園から「<b>学童クラブ</b>」に変わります。
                定員に入れなかったとき、保育園のような次の受け皿がありません。
              </p>
              <p className="lede">
                このページは、東京都の公式データから{' '}
                <b className="tab">
                  {core.munis.length}自治体 × {core.years.length}年度
                </b>{' '}
                の学童の過不足を予測して、あなたの子が小1になる年の地図にするものです。
              </p>
              <div className="tl">
              <div className="line" />
              <div className="fill" />
              <div className="pt" style={{ left: 0 }}>
                <b />
              </div>
              <div className="yr" style={{ left: 0 }}>
                2026
              </div>
              <div className="cap" style={{ left: 0 }}>
                いま。住む場所を決める
              </div>
              <div className="mid">{Math.max(0, rawFocus - 2026)}年</div>
              <div className="pt" style={{ left: 'calc(100% - 15px)' }}>
                <b />
              </div>
              <div className="yr" style={{ right: 0 }}>
                {rawFocus}
              </div>
              <div className="cap" style={{ right: 0 }}>
                小1。学童の抽選
              </div>
            </div>
              {outOfRange && (
                <p className="outrange">
                  {rawFocus}年度は、都の推計が届く範囲（{firstYear}〜{lastYear}年度）の外です。
                  この先の地図と表は、端の{focusYear}年度を出します。
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ── #why ── なぜ「いま」わからないのか。数字を持った困りごと3つ ── */}
        <section id="why">
          <div className="read">
            <h2>いま、比べる方法がありません。</h2>
            <div className="why-list">
              <div>
                <p className="wn">
                  不動産サイトも区役所も、答えるのは<b>「今年の」待機児童数</b>だけ。
                </p>
                <p className="wt">
                  あなたの子が小1になるのは{rawFocus}年度です。その年の見通しは、どこにも載っていません。
                  入れなかったときは、民間学童の費用を負担するか、家庭のどちらかが働き方を変えるかになります。
                </p>
              </div>
              <div>
                <p className="wn">
                  待機児童数では、順位が付きません。{waitingStat.total}自治体のうち{' '}
                  <b className="tab">{waitingStat.zero}が待機ゼロ</b>です。
                </p>
                <p className="wt">
                  しかも「申込む前に諦めた人」は、待機にも登録にも数えられません。
                  この課題の当事者そのものが、指標に現れないということです。
                  （東京都福祉局・{GAKUDO_NOW.replace(/-/g, '/')}時点の実測）
                </p>
              </div>
              <div>
                <p className="wn">
                  データは公開されています。ただ、<b>比べられる形になっていません。</b>
                </p>
                <p className="wt">
                  CSVはヘッダが6行目から始まり、区部と市町村部が横に2ブロック並び、数値は
                  <code>&quot;1,261 &quot;</code> のような文字列。購入を検討している人が扱える形ではありません。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── #ask ── 蝶番。ここで「一般の話」が「あなたの話」になる ── */}
        <section id="ask">
          <div className="read">
            <h2>あなたの子は、何年生まれですか。</h2>
            <div className="askrow">
              <BirthPicker
                birthYear={birthYear}
                birthMonth={birthMonth}
                onYear={setBirthYear}
                onMonth={setBirthMonth}
                idPrefix="本文"
              />
              <span className="arrow">→ 小1になるのは</span>
              <span className="askeq tab">{rawFocus}年度</span>
              {isEarlyBirth(birthMonth) && (
                <Tip body="学校教育法では4月2日〜翌年4月1日生まれが同学年です。1〜3月生まれ（早生まれ）は入学年度が1年早くなります。">
                  <span className="k" style={{ color: 'var(--warn)' }}>
                    早生まれ
                  </span>
                </Tip>
              )}
            </div>
            <a className="askgo" href="#tool">
              {focusYear}年度の東京49自治体を見る ↓
            </a>
          </div>
        </section>

        {/* ══════════ 使う（ここから幅が変わる）══════════ */}

        {/* ── #tool ── 地図が一番の見せ場。全幅で置く ── */}
        <section id="tool">
          <div className="wide">
            <div className="secthd">
              <h2>
                <span className="tab">{viewYear}</span>年度、学童に入れない子がどれくらい出るか。
              </h2>
              {/* ズームは地図に重ねない。拡大・移動すると地形と重なって読めなくなる */}
              <div className="zoombar">
                <button
                  className="zb"
                  disabled={!sel}
                  onClick={() =>
                    sel && zp.zoomTo(bboxOf(GEO, [sel, ...(GEO.byName.get(sel)?.neighbors ?? [])]))
                  }
                >
                  {sel ? `${sel}の周辺へ` : '周辺へ'}
                </button>
                <button className="zb" onClick={() => zp.zoomTo(bboxOf(GEO, GEO.kuNames))}>
                  23区へ
                </button>
                <button className="zb" onClick={zp.reset}>
                  全体
                </button>
              </div>
            </div>

            <div className="mapstage">
              <Choropleth
                geo={GEO}
                palette={palette}
                cellOf={(m) => cellAt(core, m, viewYear)}
                selected={sel}
                onSelect={setSelected}
                viewBox={zp.viewBox}
                svgRef={zp.ref}
                handlers={zp.handlers}
                scale={zp.scale}
              />
            </div>

            <div className="legend">
              <span>入れない割合</span>
              <span>低</span>
              <span className="bar-ramp">
                {palette.ramp.map((c, i) => (
                  <Tip key={c} body={`${BIN_LABELS[i]}　需要のうち受け皿に入れない割合`}>
                    <i style={{ background: c, display: 'inline-block', width: 30, height: 8 }} />
                  </Tip>
                ))}
              </span>
              <span>高</span>
              <span className="hint">自治体をクリックで選択・スクロールで拡大・ドラッグで移動・ダブルクリックで戻る</span>
            </div>
            {missing.length > 0 && (
              <p className="stub">
                ⚠️ グレーの{missing.length}自治体はデータがありません（0点ではありません）
              </p>
            )}

            {/* 🔴 選択中の明細は地図の真下に横1行。クリックの結果が視線の先で変わる */}
            <div className="selbar">
              <span className="who">
                {sel ?? '—'}　{viewYear}年度
              </span>
              <span className="big tab">
                {fmt(selCell?.detail.gap)}
                <small>人が、入れない</small>
              </span>
              <span className="facts">
                <span>
                  必要な数 <b className="tab">{fmt(selCell?.detail.demand)}</b> 人
                </span>
                <span>
                  いまの受け入れ <b className="tab">{fmt(selCell?.detail.supply)}</b> 人
                </span>
                <span>
                  いまの待機児童 <b className="tab">{fmt(selGakudo?.waiting)}</b> 人
                </span>
                <span>
                  学童クラブ <b className="tab">{fmt(selGakudo?.clubs)}</b> か所
                </span>
              </span>
            </div>

            {/* 年スクラバ。2026→2038 の物語は、スクロール演出ではなくこの1本に集約した */}
            <div className="scrub">
              <div className="scrub-hd">
                <span className="scrub-y tab">{viewYear}年度</span>
                {bridged ? (
                  <Tip
                    body={`区市町村別の都の公式推計は${core.bridgeFrom - 1}年度まで。それ以降は全都の公式推計の伸びで接続した推定です。誤差も実測していません。`}
                  >
                    <span className="scrub-tag est">推定</span>
                  </Tip>
                ) : (
                  <Tip body="区市町村別の都の公式推計そのものです。">
                    <span className="scrub-tag">都の公式推計</span>
                  </Tip>
                )}
                <span className="scrub-why">
                  {lastYear}年度まで動かすと、受け皿がいまのままだった場合の広がりが見えます
                </span>
                {viewYear !== focusYear && (
                  <button className="zb scrub-back" onClick={() => setYearOverride(null)}>
                    {focusYear}年度（小1）に戻す
                  </button>
                )}
              </div>
              <input
                className="rng scrub-rng"
                type="range"
                min={firstYear}
                max={lastYear}
                step={1}
                value={viewYear}
                aria-label="地図に出す年度"
                onChange={(e) => setYearOverride(Number(e.target.value))}
              />
              <div className="scrub-ax">
                <span className="lo">{firstYear}</span>
                <span className="you" style={{ left: `${pct(focusYear)}%` }}>
                  ▾ 小1（{focusYear}）
                </span>
                <span style={{ left: `${pct(core.bridgeFrom)}%` }}>{core.bridgeFrom}〜 推定</span>
                <span className="hi">{lastYear}</span>
              </div>
            </div>

            {/* 🔴 出典は地図のすぐ下に必ず1行出す（FR-8）。完全な一覧は #sources */}
            <p className="minisrc">
              出典：東京都オープンデータカタログサイト「教育人口等推計」「公立学校統計調査報告書【東京都公立学校一覧】」
              「学童クラブ事業の区市町村別実施状況」（東京都教育庁・東京都福祉局／CC BY 4.0）、
              地図の区市町村境界は「国土数値情報（行政区域データ）」（国土交通省）を加工して作成。{' '}
              <a href="#sources">出典とライセンスの一覧 →</a>
            </p>
          </div>
        </section>

        {/* ── #choose ── 「入れないのはどこか」だけでなく「どこに住めばいいか」を答える ── */}
        <section id="choose">
          <div className="wide">
            <div className="secthd">
              <h2>じゃあ、どこに住めばいいか。</h2>
              <span className="pmeta">
                {firstYear}〜{lastYear}年度の<b>どの年も</b>不足しないのは{' '}
                <b className="tab">{safeCount}</b> 自治体
              </span>
            </div>

            <div className="choosegrid">
              <div>
                <div className="clabelrow">
                  <p className="k clabel">{sel ?? '—'}の近くなら</p>
                  <span className="pmeta">{viewYear}年度に入れない子</span>
                </div>
                {selHold && (
                  <ChooseRow hold={selHold} lastYear={lastYear} current onSelect={setSelected} />
                )}
                {nearby.length === 0 ? (
                  <p className="advice">この自治体に隣接する自治体のデータがありません。</p>
                ) : (
                  nearby.map((h) => (
                    <ChooseRow key={h.muni} hold={h} lastYear={lastYear} onSelect={setSelected} />
                  ))
                )}
                <p className="cnote">
                  隣接は地図の境界を共有しているかどうかで判定しています（行政区分ではありません）。
                </p>
              </div>

              <div>
                <div className="clabelrow">
                  <p className="k clabel">
                    {rankMode === 'hold' ? '全員入れる期間が長い順' : `いま厳しい順（${viewYear}年度）`}
                  </p>
                  {/* 🔴 「長く持つ」と「いま厳しい」は別の問い。逆順にせず、切り替えで出し分ける */}
                  <span className="pmeta">{viewYear}年度に入れない子</span>
                </div>
                <p className="crankswitch">
                  <button
                    className="more-btn"
                    onClick={() => setRankMode((m) => (m === 'hold' ? 'risk' : 'hold'))}
                  >
                    {rankMode === 'hold' ? 'いま厳しい順を見る' : '長く持つ順に戻す'}
                  </button>
                </p>
                {(rankMode === 'hold'
                  ? holdRank.slice(0, 10)
                  : order.slice(0, 10).map((m) => holdOf(core, m, viewYear))
                ).map((h, i) => (
                  <ChooseRow
                    key={h.muni}
                    hold={h}
                    lastYear={lastYear}
                    rank={i + 1}
                    current={h.muni === sel}
                    onSelect={setSelected}
                  />
                ))}
              </div>
            </div>

            {/* 🔴 単軸しか持っていない。総合おすすめを名乗らない（docs/13 §4） */}
            <p className="cdisclaimer">
              この順位は<b>学童の受け皿だけ</b>を見たものです。通勤時間・家賃・保育園の入りやすさは含んでいません。
            </p>
          </div>
        </section>

        {/* ── #muni ── 数字は上に出ているので、ここは読み方 ── */}
        <section id="muni">
          <div className="wide">
            <div className="secthd">
              <h2>{sel ?? '—'}で、学童が要る子と入れる子はどう動くか。</h2>
              {/* グラフ自身が「必要な数と、入れる数（人）」を出すので、ここでは範囲だけ言う */}
              <span className="pmeta">
                {firstYear}〜{lastYear}年度
              </span>
            </div>

            {note && (
              <div className="notice">
                <span className="ic">{note.kind === 'real-shortage' ? '⚠' : 'ⓘ'}</span>
                <div>
                  {note.kind === 'real-shortage'
                    ? shortageLine(selMuni)
                    : note.kind === 'series-break'
                      ? '2023年と2025年で計上方法が変わっています。'
                      : '対象児童数が少なく、比率が安定しません。'}
                  <details className="more">
                    <summary>詳しく</summary>
                    <p>{note.text}</p>
                  </details>
                </div>
              </div>
            )}

            {sel && <Series core={core} muni={sel} theme={theme} w={1280} h={340} />}

            <p className="k" style={{ marginTop: 30, marginBottom: 4 }}>
              引っ越し先を変える以外に、打てる手。
            </p>
            <ul className="advices">
              <li>住み替えの時期を、入学年度に合わせてずらす</li>
              <li>民間学童の費用を、最初から資金計画に入れる</li>
              <li>保育園を選ぶ段階で、学童併設・学校併設を条件に入れる</li>
            </ul>
          </div>
        </section>

        {/* ── #heat ── 表（左）と、その読み方（右）── */}
        <section id="heat">
          <div className="wide">
            <div className="secthd">
              <h2>どの自治体が、いつから足りなくなるか。</h2>
              <span className="pmeta">
                {core.munis.length}自治体 × {core.years.length}年度 ＝{' '}
                {core.munis.length * core.years.length}セル
              </span>
            </div>
            {/* 🔴 表を地図と同じ全幅にする。読み方の注記は右柱ではなく表の下 */}
            <div className="grid">
                <div />
                {core.years.map((y) => (
                  <div
                    className={`gh${y === core.bridgeFrom ? ' br bridge-start' : ''}${y === viewYear ? ' now' : ''}`}
                    key={y}
                  >
                    {String(y).slice(2)}
                  </div>
                ))}
              {heatRows.map((m) => (
                <Row
                  key={m}
                  muni={m}
                  core={core}
                  sel={sel}
                  viewYear={viewYear}
                  palette={palette}
                  onSelect={setSelected}
                />
              ))}
            </div>
            <div className="heatnote">
              <p>
                行＝自治体、列＝入学年度、セルの数字＝入れない割合（%）。自治体名を押すと、
                上の地図とグラフがその自治体に切り替わります。枠が付いている列が、
                いま地図が見ている{viewYear}年度です。
              </p>
              <p className="bridge-note">
                <i />
                <span>
                  {core.bridgeFrom}年度から右は、全都の公式推計の伸びで接続した
                  <strong>推定</strong>です（区市町村別の公式推計は{core.bridgeFrom - 1}年度まで。
                  この区間の誤差は実測していません）
                </span>
              </p>
              <button className="more-btn" onClick={() => setExpanded((v) => !v)}>
                {expanded ? '上位10件に戻す' : `${core.munis.length}自治体すべて表示`}
              </button>
            </div>
          </div>
        </section>

        {/* ── #scenario ── */}
        <section id="scenario">
          <div className="wide">
            <div className="secthd">
              <h2>前提を変えると、どう変わるか。</h2>
              <span className="pmeta">
                いまの仮定 <span className="eq tab">{pt(core.scenario.trend)}</span>／年
                {offMeasured && (
                  <span className="offtag" style={{ marginLeft: 8 }}>
                    実測から外れた仮定
                  </span>
                )}
              </span>
            </div>
            <div className="presets">
              {PRESET_SCENARIOS.map((p) => (
                <button
                  key={p.id}
                  className={`preset${p.id === presetId ? ' on' : ''}`}
                  onClick={() => setPresetId(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="preset-why">
              {preset.description}
              {preset.id === 'latent' && <span className="assume">　※これは仮定です</span>}
            </p>

            {/* 🔴 スライダーは主導線に置かない。
                「学童を使う子の割合が年に何pt上がるか」を、家を探している親が判断できるはずがない。
                主導線はプリセット（それぞれ description に根拠がある）にして、
                スライダーは「自分で動かす」を開いた人にだけ出す。 */}
            <details className="tweak" open>
              <summary>自分で仮定を変える</summary>
              <div className="tweakbody">
                <span className="k">学童を使う子の割合は毎年</span>
                <input
                  className="rng"
                  type="range"
                  min={0}
                  max={0.02}
                  step={0.0002}
                  value={trend}
                  aria-label="学童を使う子の割合の、年あたり上昇幅"
                  disabled={presetId === 'trend15'}
                  onChange={(e) => setTrend(Number(e.target.value))}
                />
                <span className="eq tab">{pt(core.scenario.trend)}</span>
                <button
                  className="zb"
                  onClick={() => setTrend(TREND.trend)}
                  disabled={presetId === 'trend15'}
                >
                  実測値 {pt(TREND.trend)} に戻す
                </button>
                <p className="tweak-why">
                  既定値は、都のデータ（{TREND.n}自治体）から実測した値です。
                  {offMeasured && (
                    <strong className="offnote">
                      　いまの値は実測から外れています。根拠のある数字ではありません。
                    </strong>
                  )}
                </p>
              </div>
            </details>
          </div>
        </section>

        {/* ══════════ 確かめる（ここで幅が戻る）══════════ */}

        <section id="evidence">
          <div className="read">
            <h2>この予測が、どれくらい当たるか。</h2>
            <div className="ev">
              {DATA.backtest.map((b) => (
                <div key={b.horizon}>
                  <div className="n tab">
                    {b.maePct.toFixed(2)}
                    <small style={{ fontSize: '.5em' }}>%</small>
                  </div>
                  <div className="l">
                    {b.horizon}年先の絶対誤差平均。都が出している推計を、あとから出た実数と
                    {b.n}自治体で突き合わせた結果です（10〜90パーセンタイル {b.p10Pct.toFixed(2)}〜
                    {b.p90Pct.toFixed(2)}%）
                  </div>
                </div>
              ))}
              <div>
                <div className="n tab">
                  {pt(TREND.trend).replace('pt', '')}
                  <small style={{ fontSize: '.5em' }}>pt</small>
                </div>
                <div className="l">
                  学童を使う子の割合の、年あたり上昇。{TREND.n}自治体の実測（
                  {(TREND.rateFrom * 100).toFixed(1)}% → {(TREND.rateTo * 100).toFixed(1)}%）
                  {TREND.excluded.length > 0 &&
                    `／${TREND.excluded.join('・')}は計上方法が変わったため除外`}
                </div>
              </div>
            </div>
            <p className="lede">
              誤差を実測できるのは1年先と2年先だけです（都の推計が3世代しかないため）。
              {core.bridgeFrom}年度以降は、都の公式推計どうしを接続した推定であることを、
              地図の「推定」表示とヒートマップのハッチで区別しています。
            </p>
            {/* 🔴 出典（＝どこから来たか）ではなく、作り方の信頼性の話なので #evidence に置く */}
            <p className="joinnote">
              4種類のデータは、すべて <b>muni_code（全国地方公共団体コード5桁）</b>{' '}
              で結合しています。自治体名の表記ゆれ（「東京都府中市」と「府中市」など）を
              一度も踏んでいないのはこのためです。計算はすべてブラウザの中で走っていて、
              サーバーに送っているデータはありません。
            </p>
          </div>
        </section>

        {/* ── #sources ──
            🔴 ライセンスごとに束ねる。カタログ掲載の CC BY 4.0 と、
               カタログ未掲載の資料・地図データを混ぜて「いずれも CC BY」と書かない（FR-8）。 */}
        <section id="sources">
          <div className="read">
            <h2>出典とライセンス。</h2>
            <div className="src">
              {licenseGroups.map(([license, items]) => (
                <div className="srcgrp" key={license}>
                  <p className="srclic">{license}</p>
                  <ul className="srclist">
                    {items.map((s) => (
                      <li key={s.url + s.name}>
                        <a href={s.url} target="_blank" rel="noreferrer">
                          {s.name}
                        </a>
                        <span className="srcmeta">
                          {s.provider}・{s.retrievedAt}取得
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="srcnote">本サービスは上記データを加工して作成しています。</p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

function Row({
  muni,
  core,
  sel,
  viewYear,
  palette,
  onSelect,
}: {
  muni: string;
  core: CoreResult;
  sel: string | null;
  viewYear: number;
  palette: Palette;
  onSelect: (m: string) => void;
}) {
  return (
    <>
      <div
        className={`gn${muni === sel ? ' on' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => onSelect(muni)}
        onKeyDown={(e) => e.key === 'Enter' && onSelect(muni)}
      >
        {muni}
      </div>
      {core.years.map((y) => {
        const c = cellAt(core, muni, y);
        const s = c && !c.excluded ? c.score : null;
        const mark = `${y === core.bridgeFrom ? ' bridge-start' : ''}${y === viewYear ? ' now' : ''}`;
        return s === null ? (
          <div
            className={`c${mark}`}
            key={y}
            style={{ background: palette.nodata }}
            title={`${muni} ${y}年度 データなし`}
          />
        ) : (
          <div
            className={`c${c?.basis === 'bridged' ? ' br' : ''}${mark}`}
            key={y}
            style={{ background: fillOf(s, palette), color: palette.ink[binOf(s)] }}
            title={`${muni} ${y}年度　入れない割合 ${Math.round(s)}%（${fmt(c?.detail.gap)}人）`}
          >
            {Math.round(s)}
          </div>
        );
      })}
    </>
  );
}
