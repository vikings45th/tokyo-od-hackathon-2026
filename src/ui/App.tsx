/**
 * 画面本体。
 *
 * ── 2026-08-23 リデザイン ──
 * 旧版は S0〜S5 の6セクションを縦に流す構成で、`min-height:100vh` と同型の反復のせいで
 * 「パワポを PDF にしたもの」に見えていた。構造から作り直している：
 *
 *   .bar   固定ヘッダ。**主入力（子の生まれ）をここに置く**。読み物ではなく道具だと最初に名乗る
 *   .inst  常設の計器列。地図・年スクラバ・選択自治体の結果・出典が**スクロールしても消えない**
 *   .rail  解説列。高さも中身の型もそろえないパネルを流す
 *
 * 旧セクションの行き先：
 *   S0 ヒーロー（100vh）  → .bar ＋ 解説列の先頭パネル（表紙にしない）
 *   S1 タイムライン（100vh）→ 先頭パネルの中の小さなライブ年表
 *   S2 巨大な数字（100vh） → .inst の結果帯（常時表示・選択と年度に追従）
 *   S3 スクロール物語（340vh）→ 年スクラバ ＋ 解説列の #story（**同じ地図**を動かす）
 *   S4 ツール             → 画面そのもの
 *   S5 根拠・出典         → 解説列の #evidence / #sources ＋ .inst の常設クレジット
 *
 * 箱（枠線＋影のカード）は使わない。区切りは余白と1pxのヘアラインだけ。
 */
import { useEffect, useMemo, useState } from 'react';
import { PRESET_SCENARIOS, entryYearOf, isEarlyBirth, type CoreCell, type CoreResult } from '../core';
import type { Muni, Scenario, Source } from '../types';
import { BIN_LABELS, PALETTES, binOf, fillOf, type Palette } from './palette';
import { Choropleth } from './Choropleth';
import { Series } from './Series';
import { DATA, GEO, GEO_SOURCE, TREND, compute, fmt, missingMunis, pt } from './data';
import { bboxOf } from './geo';
import { useScrollSpy, useScrollStep, useTheme, useZoomPan } from './hooks';

/** 解説列のナビ。id は各パネルの id と一致させること */
const NAV = [
  { id: 'lede', label: 'はじめに' },
  { id: 'rank', label: '順位' },
  { id: 'muni', label: 'この自治体' },
  { id: 'story', label: 'この先' },
  { id: 'heat', label: '12年度の表' },
  { id: 'scenario', label: '条件' },
  { id: 'evidence', label: '精度' },
  { id: 'sources', label: '出典' },
] as const;

/** 行のスコアを引く。無ければ undefined */
const cellAt = (core: CoreResult, muni: string, year: number): CoreCell | undefined =>
  core.byMuni.get(muni)?.find((r) => r.year === year);

/** focusYear のスコア降順。null は末尾 */
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
 * `real-shortage` 7自治体を1文で括ると、悪化中（府中市・稲城市）と
 * 改善中だが残る（練馬区 292→47・足立区 263→179）が同じ扱いになる。
 * ①の note.text は区別できているので、要約側も待機児童の増減で出し分ける。
 */
function shortageLine(muni: Muni | undefined): string {
  const prev = muni?.gakudo.find((g) => g.asOf === '2023-05-01');
  const cur = muni?.gakudo.find((g) => g.asOf === '2025-05-01');
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

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const palette = PALETTES[theme];

  const [birthYear, setBirthYear] = useState(2024);
  const [birthMonth, setBirthMonth] = useState(6);
  const [trend, setTrend] = useState<number>(TREND.trend);
  const [presetId, setPresetId] = useState('baseline');
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  /**
   * 画面ぜんぶが「いま何年度を見ているか」を1つの時計で共有する。
   * 既定はあなたの子が小1になる年度。スクラバと #story がこれを上書きする。
   * 🔴 地図・ランキング・ヒートマップの強調・結果帯は必ず viewYear で描くこと。
   *    どれか1つが別の年度を見ていると、そこから先の数字が全部信用されなくなる。
   */
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
  /** 表の射程（2027〜）の外に出た年度は、外に出たと明示したうえで端に寄せる（FR-1） */
  const outOfRange = rawFocus < firstYear || rawFocus > lastYear;
  const focusYear = Math.min(Math.max(rawFocus, firstYear), lastYear);
  const viewYear = yearOverride ?? focusYear;

  const order = useMemo(() => rankMunis(core, viewYear), [core, viewYear]);
  /** 未選択のときの既定。🔴 viewYear ではなく focusYear で決める（年を動かすたび選択が飛ぶのを防ぐ） */
  const defaultSel = useMemo(() => rankMunis(core, focusYear)[0] ?? null, [core, focusYear]);
  const sel = selected ?? defaultSel;

  const selCell = sel ? cellAt(core, sel, viewYear) : undefined;
  const selMuni = DATA.munis.find((m) => m.name === sel);
  const selGakudo = selMuni?.gakudo.find((g) => g.asOf === '2025-05-01');
  const note = sel ? core.notes.get(sel) : undefined;

  // 「打てる手」＝ 地理的に隣接していて、スコアが低い自治体
  const alternatives = useMemo(() => {
    if (!sel) return [];
    return (GEO.byName.get(sel)?.neighbors ?? [])
      .map((n) => ({ muni: n, score: cellAt(core, n, viewYear)?.score ?? null }))
      .filter((x): x is { muni: string; score: number } => x.score !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, 3);
  }, [sel, core, viewYear]);

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

  /**
   * #story の段。旧 S3 の3枚（2027 / 小1の年 / 2038）をそのまま持ってきているが、
   * 動かすのは**同じ地図**で、別の全画面セクションは作らない。
   * 先頭と末尾は「物語の外」で、ここに入ったら年度をあなたの子の年に戻す。
   */
  const storySteps = useMemo(() => {
    const items: Array<{ year: number; cap: string; note: string }> = [];
    const push = (year: number, cap: string, note: string) => {
      const y = Math.min(Math.max(year, firstYear), lastYear);
      if (!items.some((i) => i.year === y)) items.push({ year: y, cap, note });
    };
    // 🔴 焦点年度を先に積む。2027 や最終年度と重なったとき、こちらの文を残したいため
    push(focusYear, `${birthYear}年${birthMonth}月生まれの子が、小1になる年。`, 'ここが、家を決めるときには見えていない年度です。');
    push(firstYear, 'いまはまだ、多くの自治体で希望した子が入れている。', '色が薄いほど、需要のうち入れない割合が小さい。');
    push(lastYear, '受け皿がいまのままなら、ここまで広がる。', `${core.bridgeFrom}年度から先は、都の全都推計の伸びで接続した推定です。`);
    return items.sort((a, b) => a.year - b.year);
  }, [focusYear, birthYear, birthMonth, firstYear, lastYear, core.bridgeFrom]);

  // 先頭・末尾のダミー段を含めた数。IntersectionObserver は要素に紐づくので数を合わせる
  const [step, stepRef] = useScrollStep(storySteps.length + 2);
  const activeNav = useScrollSpy(NAV.map((n) => n.id));
  const zp = useZoomPan();

  // 段が変わったら地図の年度を動かす。物語の外（先頭・末尾）では手を放す
  useEffect(() => {
    const s = storySteps[step - 1];
    setYearOverride(s ? s.year : null);
  }, [step, storySteps]);

  const heatRows = expanded ? order : [...new Set([...order.slice(0, 10), ...(sel ? [sel] : [])])];
  const bridged = viewYear >= core.bridgeFrom;
  const pct = (y: number) => ((y - firstYear) / (lastYear - firstYear)) * 100;

  const yearOptions = Array.from({ length: 13 }, (_, i) => 2019 + i);

  return (
    <>
      {/* ══ 固定ヘッダ。主入力はここ ══ */}
      <header className="bar">
        <span className="brand">小1の壁マップ</span>
        <span className="brandsub">東京都オープンデータ ／ 49自治体 × 12年度</span>
        <span className="sep" />
        <div className="ctl">
          <span className="k">子の生まれ</span>
          <select
            className="pick"
            value={birthYear}
            aria-label="子の生まれ年"
            onChange={(e) => setBirthYear(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}年
              </option>
            ))}
          </select>
          <select
            className="pick"
            value={birthMonth}
            aria-label="子の生まれ月"
            onChange={(e) => setBirthMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}月
              </option>
            ))}
          </select>
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

      <div className="work">
        {/* ══ 計器列。スクロールしても消えない ══ */}
        <div className="inst">
          {/* スマホではここだけを sticky にする（結果帯まで貼り付けると画面の半分が埋まる） */}
          <div className="instmain">
            <div className="instmap">
            <div className="zoombar">
              <button
                className="zb"
                disabled={!sel}
                onClick={() => sel && zp.zoomTo(bboxOf(GEO, [sel, ...(GEO.byName.get(sel)?.neighbors ?? [])]))}
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
            <div className="legend">
              <span>入れない割合</span>
              <span>低</span>
              <span className="bar-ramp">
                {palette.ramp.map((c, i) => (
                  <Tip key={c} body={`${BIN_LABELS[i]}　需要のうち受け皿に入れない割合`}>
                    <i style={{ background: c, display: 'inline-block', width: 28, height: 8 }} />
                  </Tip>
                ))}
              </span>
              <span>高</span>
            </div>
            <p className="hint">スクロールで拡大・ドラッグで移動・ダブルクリックで戻る</p>
            {missing.length > 0 && (
              <p className="stub">
                ⚠️ グレーの{missing.length}自治体はデータがありません（0点ではありません）
              </p>
            )}
          </div>

          {/* 年スクラバ。旧 S3 の物語は、この操作子と #story の両方から動く */}
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

          </div>

          {/* 結果帯。旧 S2 の巨大な数字を、消えない1行に溶かしたもの */}
          <div className="result">
            <p className="who">
              {sel ?? '—'}　{viewYear}年度
            </p>
            <div className="row">
              <div className="big tab">
                {fmt(selCell?.detail.gap)}
                <small>人が、入れない</small>
              </div>
              <div className="facts">
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
                  クラブ <b className="tab">{fmt(selGakudo?.clubs)}</b> か所
                </span>
              </div>
            </div>
            {/* 🔴 出典は画面から消える瞬間を作らない（FR-8）。詳しい一覧は #sources */}
            <p className="credit">
              出典：東京都オープンデータカタログサイト「教育人口等推計」「公立学校統計調査報告書【東京都公立学校一覧】」
              「学童クラブ事業の区市町村別実施状況」（東京都教育庁・東京都福祉局／CC BY 4.0）、
              地図の区市町村境界は「国土数値情報（行政区域データ）」（国土交通省）を加工して作成。{' '}
              <a href="#sources">出典の一覧 →</a>
            </p>
          </div>
        </div>

        {/* ══ 解説列 ══ */}
        <div className="rail">
          <nav className="railnav" aria-label="このページの中身">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} className={activeNav === n.id ? 'on' : undefined}>
                {n.label}
              </a>
            ))}
          </nav>

          {/* ── はじめに。表紙にはしない。左の地図はもう動いている ── */}
          <section className="p p-lede" id="lede">
            <h1>
              保育園には、入れた。
              <br />
              <em>小1の壁は、どこにある？</em>
            </h1>
            <p className="lede">
              学童に入れないと、親のどちらかが働き方を変えることになる。
              そしてそれは、家を決めたあとでは動かせない。
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
                いま。家を決める
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
            <p className="now">
              左の地図は、いま <b className="tab">{viewYear}年度</b> の49自治体を出しています。
              色は「学童を必要とする子のうち、受け皿に入れない割合」。
              自治体をクリックすると、その数が左下に出ます。
            </p>
            {outOfRange && (
              <p className="outrange">
                {rawFocus}年度は、都の推計が届く範囲（{firstYear}〜{lastYear}年度）の外です。
                地図は端の{focusYear}年度を出しています。
              </p>
            )}
          </section>

          {/* ── 順位。地図の相棒。ここから選ばせる ── */}
          <section className="p" id="rank">
            <div className="phd">
              <p className="k">入れない割合が高い順</p>
              <span className="pmeta">{viewYear}年度・上位10件</span>
            </div>
            <div className="rank">
              {order.slice(0, 10).map((m, i) => {
                const c = cellAt(core, m, viewYear);
                const s = c?.score ?? null;
                return (
                  <div
                    className={`rr${m === sel ? ' on' : ''}`}
                    key={m}
                    onClick={() => setSelected(m)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setSelected(m)}
                  >
                    <span className="i tab">{i + 1}</span>
                    <span className="nm">{m}</span>
                    <span className="v tab">{s === null ? '—' : `${Math.round(s)}%`}</span>
                    <span className="sp">
                      <i
                        style={{
                          display: 'block',
                          width: `${Math.max(2, ((s ?? 0) / 45) * 100)}%`,
                          background: fillOf(s, palette),
                        }}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── 選んだ自治体。数字そのものは左に出ているので、ここは「読み方」 ── */}
          <section className="p" id="muni">
            <div className="phd">
              <p className="k">{sel ?? '—'} を、くわしく</p>
              <span className="pmeta">必要な数と入れる数（人）</span>
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

            {sel && <Series core={core} muni={sel} theme={theme} />}

            <p className="k" style={{ marginTop: 26, marginBottom: 4 }}>
              打てる手は、まだある。
            </p>
            {/* 🔴 押せるもの（.act）と、読むだけの助言（.advice）を見た目で分ける。
                同じ見た目で片方だけ押せるのが、体験として一番よくない */}
            <div className="acts">
              {alternatives.length === 0 ? (
                <span className="advice">この自治体に隣接する自治体のデータがありません。</span>
              ) : (
                alternatives.map((a) => (
                  <span
                    className="act"
                    key={a.muni}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(a.muni)}
                    onKeyDown={(e) => e.key === 'Enter' && setSelected(a.muni)}
                  >
                    隣の<b>{a.muni}</b>　{Math.round(a.score)}%
                  </span>
                ))
              )}
            </div>
            <ul className="advices">
              <li>住み替えの時期を、入学年度に合わせてずらす</li>
              <li>民間学童の費用を、最初から資金計画に入れる</li>
              <li>保育園を選ぶ段階で、学童併設・学校併設を条件に入れる</li>
            </ul>
          </section>

          {/* ── この先。スクロールで左の地図の年度が動く。別の地図は作らない ── */}
          <section className="p story" id="story">
            <div className="phd">
              <p className="k">受け皿が、いまのままなら</p>
              <span className="pmeta">スクロールで地図の年度が動きます</span>
            </div>
            <div className="step edge" ref={stepRef(0)}>
              <p className="st">
                下にスクロールすると、左の地図が {firstYear} 年度から {lastYear} 年度へ進みます。
              </p>
              <p className="sn">
                動いているのは「受け皿（学童の受け入れ実績）は増えない」という前提の1本だけです。
                前提そのものは、下の「条件」で変えられます。
              </p>
            </div>
            {storySteps.map((s, i) => (
              <div className={`step${step === i + 1 ? ' on' : ''}`} key={s.year} ref={stepRef(i + 1)}>
                <p className="sy tab">{s.year}年度</p>
                <p className="st">{s.cap}</p>
                <p className="sn">{s.note}</p>
              </div>
            ))}
            <div className="step edge" ref={stepRef(storySteps.length + 1)}>
              <p className="st">地図は、あなたの子の年（{focusYear}年度）に戻りました。</p>
              <p className="sn">
                左のスライダーを掴めば、どの年度でも自分で見に行けます。
              </p>
            </div>
          </section>

          {/* ── 12年度の表。いつ悪化するかを1枚で ── */}
          <section className="p" id="heat">
            <div className="hmhd">
              <p className="k">いつ、そうなるか</p>
              <button className="more-btn" onClick={() => setExpanded((v) => !v)}>
                {expanded ? '上位10件に戻す' : `${core.munis.length}自治体すべて`}
              </button>
            </div>
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
            <p className="bridge-note">
              <i />
              <span>
                {core.bridgeFrom}年度から右は、全都の公式推計の伸びで接続した<strong>推定</strong>です
                （区市町村別の公式推計は{core.bridgeFrom - 1}年度まで。この区間の誤差は実測していません）
              </span>
            </p>
          </section>

          {/* ── 条件 ── */}
          <section className="p" id="scenario">
            <div className="phd">
              <p className="k">条件を変えて計算する</p>
              <span className="pmeta">
                いまの仮定 <span className="eq tab">{pt(core.scenario.trend)}</span>／年
                {offMeasured && <span className="offtag" style={{ marginLeft: 8 }}>実測から外れた仮定</span>}
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
            <details className="tweak">
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
                <button className="zb" onClick={() => setTrend(TREND.trend)} disabled={presetId === 'trend15'}>
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
          </section>

          {/* ── 精度 ── */}
          <section className="p" id="evidence">
            <div className="phd">
              <p className="k">この予測が、どれくらい当たるか</p>
              <span className="pmeta">都の推計を、あとから出た実数と突き合わせた結果</span>
            </div>
            <div className="ev">
              {DATA.backtest.map((b) => (
                <div key={b.horizon}>
                  <div className="n tab">
                    {b.maePct.toFixed(2)}
                    <small style={{ fontSize: '.5em' }}>%</small>
                  </div>
                  <div className="l">
                    {b.horizon}年先の絶対誤差平均（{b.n}自治体・10〜90パーセンタイル {b.p10Pct.toFixed(2)}〜
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
                  {TREND.excluded.length > 0 && `／${TREND.excluded.join('・')}は計上方法が変わったため除外`}
                </div>
              </div>
            </div>
            <p className="lede" style={{ marginTop: 22 }}>
              誤差を実測できるのは1年先と2年先だけです（都の推計が3世代しかないため）。
              {core.bridgeFrom}年度以降は、都の公式推計どうしを接続した推定であることを、
              地図の「推定」表示とヒートマップのハッチで区別しています。
            </p>
          </section>

          {/* ── 出典 ──
              🔴 ライセンスごとに束ねる。カタログ掲載の CC BY 4.0 と、
                 カタログ未掲載の資料・地図データを混ぜて「いずれも CC BY」と書かない（FR-8）。 */}
          <section className="p" id="sources">
            <div className="phd">
              <p className="k">出典とライセンス</p>
              <span className="pmeta">
                {DATA.sources.length + 1}件 · muni_code で結合
              </span>
            </div>
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
              <p className="joinnote">
                4種類のデータは、すべて <b>muni_code（全国地方公共団体コード5桁）</b>{' '}
                で結合しています。自治体名の表記ゆれ（「東京都府中市」と「府中市」など）を
                一度も踏んでいないのはこのためです。出力は{' '}
                <b className="tab">
                  {core.munis.length}自治体 × {core.years.length}年度 ＝{' '}
                  {core.munis.length * core.years.length}セル
                </b>
                。計算はすべてブラウザの中で走っていて、サーバーに送っているデータはありません。
              </p>
            </div>
          </section>
        </div>
      </div>
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
