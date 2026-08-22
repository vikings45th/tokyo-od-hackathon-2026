/**
 * ツールページ（`/tool/`）。**操作と結果だけを扱う。物語は LP（`/`）にある。**
 *
 * 2層のユーザーを1画面で受ける（docs/16 §2 の改訂）：
 *   - 主：共働き夫婦 → 地図＋自分の自治体の詳細
 *   - 副：行政（審査委員6人のうち3人）→ **49自治体×12年度のヒートマップ全体**
 *
 * 🔴 状態は URL に持つ（設計書 §9）。審査員に URL を渡せること、
 *    8/26〜31 の収録で同じ画面を再現できることが要件。
 */
import { useMemo, useState } from 'react';
import { PRESET_SCENARIOS, entryYearOf, isEarlyBirth, type CoreCell, type CoreResult } from '../core';
import type { Scenario } from '../types';
import { BIN_LABELS, PALETTES, binOf, fillOf } from './palette';
import { Choropleth } from './Choropleth';
import { Series } from './Series';
import { DATA, GEO, TREND, compute, fmt, missingMunis, pt } from './data';
import { bboxOf } from './geo';
import { readParam, useInView, useSyncUrl, useTheme, useZoomPan } from './hooks';
import { Sources } from './Sources';

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
 * ホバーで出す補足。
 * `aria-describedby` で本文と結びつけ、Esc で閉じられるようにしてある
 * （`title` 属性だとタッチとキーボードで読めない）。
 */
let tipSeq = 0;
function Tip({ children, body }: { children: React.ReactNode; body: string }) {
  const [id] = useState(() => `tip-${++tipSeq}`);
  const [open, setOpen] = useState(false);
  return (
    <span
      className="tip"
      tabIndex={0}
      aria-describedby={id}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      {children}
      <span className={`tipbody${open ? ' on' : ''}`} id={id} role="tooltip">
        {body}
      </span>
    </span>
  );
}

/** 「打てる手」のうち、クリックで別の自治体に飛ばないもの。中身を持たせて偽ボタンをやめる */
const ADVICE = [
  {
    head: '入学年度に合わせて',
    strong: '時期をずらす',
    body:
      '同じ自治体でも、入学年度が1年違うだけでリスクは変わります。下のヒートマップで、検討している自治体の行を左右に見比べてください。住み替えの時期を動かせるなら、色の薄い年度に合わせるという選択肢があります。',
  },
  {
    head: '民間学童を',
    strong: '資金計画に入れる',
    body:
      '公立の学童に入れなかった場合、民間学童の費用が毎月かかります。住宅ローンの返済計画に小1から小3までの分を先に織り込んでおくと、入学してから働き方を変えずに済みます。',
  },
];

export default function Tool() {
  const [theme, toggleTheme] = useTheme();
  const palette = PALETTES[theme];

  // ── URL から初期値を復元する ──
  const birth0 = (readParam('birth') ?? '').match(/^(\d{4})-(\d{1,2})$/);
  const [birthYear, setBirthYear] = useState(birth0 ? Number(birth0[1]) : 2024);
  const [birthMonth, setBirthMonth] = useState(birth0 ? Number(birth0[2]) : 6);
  const [trend, setTrend] = useState<number>(Number(readParam('trend')) || TREND.trend);
  const [presetId, setPresetId] = useState(
    PRESET_SCENARIOS.some((p) => p.id === readParam('preset')) ? readParam('preset')! : 'baseline',
  );
  const [selected, setSelected] = useState<string | null>(readParam('muni'));
  const [expanded, setExpanded] = useState(readParam('all') === '1');

  const focusYear = entryYearOf(birthYear, birthMonth);
  const preset = PRESET_SCENARIOS.find((p) => p.id === presetId) ?? PRESET_SCENARIOS[0];

  // シナリオ＝プリセット ＋ スライダーの trend。trend は常にユーザーの値が勝つ
  const scenario: Scenario = useMemo(() => {
    const base = preset.build({ data: DATA, muni: selected ?? undefined });
    return presetId === 'trend15' ? base : { ...base, trend };
  }, [preset, presetId, selected, trend]);

  const core = useMemo(() => compute(scenario), [scenario]);
  const missing = useMemo(() => missingMunis(core), [core]);

  const order = useMemo(() => rankMunis(core, focusYear), [core, focusYear]);
  const sel = selected ?? order[0] ?? null;
  const selCell = sel ? cellAt(core, sel, focusYear) : undefined;
  const selMuni = DATA.munis.find((m) => m.name === sel);
  const selGakudo = selMuni?.gakudo.find((g) => g.asOf === '2025-05-01');
  const note = sel ? core.notes.get(sel) : undefined;

  useSyncUrl({
    birth: `${birthYear}-${String(birthMonth).padStart(2, '0')}`,
    muni: selected,
    trend: presetId === 'trend15' ? null : trend.toFixed(4),
    preset: presetId === 'baseline' ? null : presetId,
    all: expanded ? '1' : null,
  });

  // 「打てる手」＝ 地理的に隣接していて、スコアが低い自治体
  const alternatives = useMemo(() => {
    if (!sel) return [];
    return (GEO.byName.get(sel)?.neighbors ?? [])
      .map((n) => ({ muni: n, score: cellAt(core, n, focusYear)?.score ?? null }))
      .filter((x): x is { muni: string; score: number } => x.score !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, 3);
  }, [sel, core, focusYear]);

  const rise = useInView<HTMLElement>();
  const zp = useZoomPan();

  const heatRows = expanded ? order : [...new Set([...order.slice(0, 10), ...(sel ? [sel] : [])])];

  return (
    <>
      <header className="wm-bar tool">
        <a className="wm" href="/">
          小1の壁マップ
        </a>
        <nav>
          <a className="back" href="/">
            なぜ作ったか
          </a>
          <button className="theme-btn" onClick={toggleTheme} aria-pressed={theme === 'dark'}>
            {theme === 'light' ? '🌙' : '☀️'}
            <span className="lbl">{theme === 'light' ? ' ダークにする' : ' ライトにする'}</span>
          </button>
        </nav>
      </header>

      <main id="s4">
        <div className="mid">
          <h1 className="tool-h1">あなたの子の年で、調べる。</h1>

          <div className="ctl">
            <div className="g">
              <label className="k" htmlFor="by">
                子の生まれ
              </label>
              <select
                className="pick"
                id="by"
                value={birthYear}
                onChange={(e) => setBirthYear(Number(e.target.value))}
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
                aria-label="生まれ月"
                onChange={(e) => setBirthMonth(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}月
                  </option>
                ))}
              </select>
            </div>
            <div className="g">
              <span className="k">小1になるのは</span>
              <span className="eq tab">{focusYear}年度</span>
              {isEarlyBirth(birthMonth) && (
                <Tip body="学校教育法では4月2日〜翌年4月1日生まれが同学年です。1〜3月生まれ（早生まれ）は入学年度が1年早くなります。">
                  <span className="k" style={{ color: 'var(--warn)' }}>
                    早生まれ
                  </span>
                </Tip>
              )}
            </div>
            <div className="g right">
              <label className="k" htmlFor="tr">
                登録率は毎年
              </label>
              <input
                className="rng"
                id="tr"
                type="range"
                min={0}
                max={0.02}
                step={0.0002}
                value={trend}
                disabled={presetId === 'trend15'}
                onChange={(e) => setTrend(Number(e.target.value))}
              />
              <span className="eq tab">{pt(core.scenario.trend)}</span>
              <Tip
                body={`都の3時点データ（2023-05→2025-05・${TREND.n}自治体）から実測した値です。自治体間のばらつきが大きいため、都平均の1点を全自治体に当てている仮定です。`}
              >
                <span className="tag">実測値 {pt(TREND.trend)}</span>
              </Tip>
            </div>
          </div>

          {/* 🔴 「リスク 41」の 41 が何なのか、ホバーせずに読めるようにする。
                 動画にもスライドのキャプチャにも、ツールチップは写らない */}
          <p className="def">
            <b>リスク</b>
            ＝ その年度に学童を希望すると見込まれる子のうち、<b>受け皿に入れない割合（％）</b>。
            東京都の公式推計と学童クラブの実施状況から算出しています。
          </p>

          <div className="stage rise" ref={rise}>
            <div className="mapbox">
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
                <button className="zb" onClick={() => zp.zoomBy(1.4)} aria-label="拡大">
                  ＋
                </button>
                <button className="zb" onClick={() => zp.zoomBy(1 / 1.4)} disabled={zp.atFull} aria-label="縮小">
                  −
                </button>
                <button className="zb" onClick={zp.reset} disabled={zp.atFull}>
                  全体
                </button>
              </div>
              <Choropleth
                geo={GEO}
                palette={palette}
                cellOf={(m) => cellAt(core, m, focusYear)}
                selected={sel}
                onSelect={setSelected}
                viewBox={zp.viewBox}
                svgRef={zp.ref}
                handlers={zp.handlers}
                scale={zp.scale}
              />
              <div className="legend">
                <span className="k">リスク</span>
                {palette.ramp.map((c, i) => (
                  <span className="sw" key={c}>
                    <i style={{ background: c }} />
                    {BIN_LABELS[i]}
                  </span>
                ))}
                <span className="sw">
                  <i style={{ background: palette.nodata }} />
                  データなし
                </span>
                <span className="sw basis">
                  <span className="k">この年度の根拠</span>
                  {selCell?.basis === 'bridged' ? (
                    <Tip
                      body={`区市町村別の都の公式推計は${core.bridgeFrom - 1}年度まで。それ以降は全都の公式推計の伸びで接続した推定です。誤差も実測していません。`}
                    >
                      推定
                    </Tip>
                  ) : (
                    <Tip body="区市町村別の都の公式推計そのものです。">公式</Tip>
                  )}
                </span>
              </div>
              <p className="hint">
                クリックで選択・ドラッグで移動・⌘/Ctrl＋スクロールで拡大・ダブルクリックで戻る
              </p>
              {missing.length > 0 && (
                <p className="stub">
                  グレーの{missing.length}自治体はデータ整備中のため表示できません
                  （現在は{DATA.munis.length}自治体で動作しています）
                </p>
              )}
            </div>
            <div>
              <h2 className="blk rank-h">リスクの高い自治体（{focusYear}年度）</h2>
              <div className="rank">
                {order.slice(0, 10).map((m, i) => {
                  const c = cellAt(core, m, focusYear);
                  const s = c?.score ?? null;
                  const on = m === sel;
                  return (
                    <button
                      className={`rr${on ? ' on' : ''}`}
                      key={m}
                      onClick={() => setSelected(m)}
                      aria-current={on ? 'true' : undefined}
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
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 選択中の詳細。箱は使わず巨大な数字ひとつ */}
          <section className="detail rise" ref={rise} aria-labelledby="dh">
            <p className="who">
              {sel}　{focusYear}年度
            </p>
            <h2 id="dh" className="big tab">
              {fmt(selCell?.detail.gap)}
              <small>人分、足りない</small>
            </h2>
            <div className="facts">
              <span>
                需要 <b className="tab">{fmt(selCell?.detail.demand)}</b> 人
              </span>
              <span>
                受け入れ実績 <b className="tab">{fmt(selCell?.detail.supply)}</b> 人
              </span>
              <span>
                いまの待機児童 <b className="tab">{fmt(selGakudo?.waiting)}</b> 人
              </span>
              <span>
                クラブ <b className="tab">{fmt(selGakudo?.clubs)}</b> か所
              </span>
            </div>

            {note && (
              <div className="notice">
                <span className="ic" aria-hidden="true">
                  {note.kind === 'real-shortage' ? '⚠' : 'ⓘ'}
                </span>
                <div>
                  {note.kind === 'real-shortage'
                    ? '需要が無いのではなく、受け皿が足りていません。'
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

            <h3 className="blk acts-h">打てる手</h3>
            <div className="acts">
              {alternatives.length === 0 && (
                <span className="act flat">隣接自治体のデータは整備中です</span>
              )}
              {alternatives.map((a) => (
                <button className="act" key={a.muni} onClick={() => setSelected(a.muni)}>
                  隣接：<b>{a.muni}</b> {Math.round(a.score)}%
                </button>
              ))}
              {ADVICE.map((a) => (
                <details className="act adv" key={a.strong}>
                  <summary>
                    {a.head}
                    <b>{a.strong}</b>
                  </summary>
                  <p>{a.body}</p>
                </details>
              ))}
            </div>
          </section>

          {/* ヒートマップ。行政（＝審査委員の3人）が読むのはここ */}
          <section className="hm rise" ref={rise} aria-labelledby="hmh">
            <div className="hmhd">
              <div>
                <h2 id="hmh" className="blk">
                  いつ悪化するか
                </h2>
                <p className="hmsub">行＝自治体／列＝入学年度／数字＝リスク（％）</p>
              </div>
              <div className="seg" role="group" aria-label="表示する自治体">
                <button className={expanded ? '' : 'on'} onClick={() => setExpanded(false)} aria-pressed={!expanded}>
                  上位10件
                </button>
                <button className={expanded ? 'on' : ''} onClick={() => setExpanded(true)} aria-pressed={expanded}>
                  {core.munis.length}自治体すべて
                </button>
              </div>
            </div>
            <div className="hmscroll">
              <div className="grid" role="table" aria-label="自治体×入学年度のリスク">
                <div role="row" style={{ display: 'contents' }}>
                  <div className="gh corner" role="columnheader" />
                  {core.years.map((y) => (
                    <div
                      className={`gh${y === core.bridgeFrom ? ' br bridge-start' : ''}`}
                      role="columnheader"
                      key={y}
                    >
                      {String(y).slice(2)}
                    </div>
                  ))}
                </div>
                {heatRows.map((m) => (
                  <Row key={m} muni={m} core={core} sel={sel} palette={palette} onSelect={setSelected} />
                ))}
              </div>
            </div>
            <p className="bridge-note">
              <i aria-hidden="true" />
              {core.bridgeFrom}年度から右は、全都の公式推計の伸びで接続した<strong>推定</strong>です
              （区市町村別の公式推計は{core.bridgeFrom - 1}年度まで。この区間の誤差は実測していません）
            </p>
          </section>

          {/* シナリオ */}
          <section className="scen rise" ref={rise} aria-labelledby="sch">
            <h2 id="sch" className="blk" style={{ marginBottom: 14 }}>
              条件を変えて計算する
            </h2>
            <div className="presets">
              {PRESET_SCENARIOS.map((p) => (
                <button
                  key={p.id}
                  className={`preset${p.id === presetId ? ' on' : ''}`}
                  onClick={() => setPresetId(p.id)}
                  aria-pressed={p.id === presetId}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="preset-why">
              {preset.description}
              {preset.id === 'latent' && <span className="assume">　※これは仮定です</span>}
            </p>
          </section>

          {/* 根拠 */}
          <section className="ev-sec rise" ref={rise} aria-labelledby="evh">
            <p className="eyebrow">根拠</p>
            <h2 id="evh" className="sect-sm">
              この予測が、どれくらい当たるか。
            </h2>
            <div className="ev">
              {DATA.backtest.map((b) => (
                <div key={b.horizon}>
                  <div className="n tab">
                    {b.maePct.toFixed(2)}
                    <small>%</small>
                  </div>
                  <div className="l">
                    {b.horizon}年先の絶対誤差平均。都の推計ヴィンテージを{b.n}地区で突き合わせた実測
                    （10〜90パーセンタイル {b.p10Pct.toFixed(2)}〜{b.p90Pct.toFixed(2)}%）
                  </div>
                </div>
              ))}
              <div>
                <div className="n tab">
                  {pt(TREND.trend).replace('pt', '')}
                  <small>pt</small>
                </div>
                <div className="l">
                  登録率の年あたり上昇。{TREND.n}自治体の実測（
                  {(TREND.rateFrom * 100).toFixed(1)}% → {(TREND.rateTo * 100).toFixed(1)}%）
                  {TREND.excluded.length > 0 && `／${TREND.excluded.join('・')}は計上方法が変わったため除外`}
                </div>
              </div>
            </div>
            <p className="lede">
              誤差を実測できるのは1年先と2年先だけです（都の推計が3世代しかないため）。
              {core.bridgeFrom}年度以降は、都の公式推計どうしを接続した推定であることを画面に明示しています。
            </p>
          </section>
        </div>
      </main>

      <footer className="ft">
        <div className="mid">
          <Sources />
        </div>
      </footer>
    </>
  );
}

function Row({
  muni,
  core,
  sel,
  palette,
  onSelect,
}: {
  muni: string;
  core: CoreResult;
  sel: string | null;
  palette: (typeof PALETTES)['light'];
  onSelect: (m: string) => void;
}) {
  return (
    <div role="row" style={{ display: 'contents' }}>
      <button
        className={`gn${muni === sel ? ' on' : ''}`}
        role="rowheader"
        onClick={() => onSelect(muni)}
        aria-current={muni === sel ? 'true' : undefined}
      >
        {muni}
      </button>
      {core.years.map((y) => {
        const c = cellAt(core, muni, y);
        const s = c && !c.excluded ? c.score : null;
        const bs = y === core.bridgeFrom ? ' bridge-start' : '';
        return s === null ? (
          <div
            className={`c${bs}`}
            role="cell"
            key={y}
            style={{ background: palette.nodata }}
            aria-label={`${muni} ${y}年度 データなし`}
          />
        ) : (
          <div
            className={`c${c?.basis === 'bridged' ? ' br' : ''}${bs}`}
            role="cell"
            key={y}
            style={{ background: fillOf(s, palette), color: palette.ink[binOf(s)] }}
            aria-label={`${muni} ${y}年度 リスク ${Math.round(s)}パーセント 不足 ${fmt(c?.detail.gap)}人`}
          >
            {Math.round(s)}
          </div>
        );
      })}
    </div>
  );
}
