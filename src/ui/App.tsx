/**
 * 画面本体。S0〜S5 をスクロールで縦に流す。
 *
 * 設計は docs/16-ui-detail-design.md。
 * 箱（枠線＋影のカード）は使わない。区切りは余白と1pxのヘアラインだけ。
 */
import { useMemo, useState } from 'react';
import { PRESET_SCENARIOS, entryYearOf, isEarlyBirth, type CoreCell, type CoreResult } from '../core';
import type { Scenario } from '../types';
import { BIN_LABELS, PALETTES, binOf, fillOf } from './palette';
import { Choropleth } from './Choropleth';
import { Series } from './Series';
import { DATA, GEO, TREND, compute, fmt, missingMunis, pt } from './data';
import { bboxOf } from './geo';
import { useInView, useScrollStep, useTheme, useZoomPan } from './hooks';

const STORY_YEARS = [2027, 2031, 2038];
const STORY_CAPS: Record<number, string> = {
  2027: 'いまはまだ、ほとんどの区が足りている。',
  2031: 'あなたの子が小1になる年。',
  2038: '受け皿が変わらなければ、ここまで広がる。',
};

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

  const focusYear = entryYearOf(birthYear, birthMonth);
  const preset = PRESET_SCENARIOS.find((p) => p.id === presetId) ?? PRESET_SCENARIOS[0];

  // シナリオ＝プリセット ＋ スライダーの trend。trend は常にユーザーの値が勝つ
  const scenario: Scenario = useMemo(() => {
    const base = preset.build({ data: DATA, muni: selected ?? undefined });
    return presetId === 'trend15' ? base : { ...base, trend };
  }, [preset, presetId, selected, trend]);

  const core = useMemo(() => compute(scenario), [scenario]);
  const storyCore = useMemo(() => compute({}), []);
  const missing = useMemo(() => missingMunis(core), [core]);

  const order = useMemo(() => rankMunis(core, focusYear), [core, focusYear]);
  const sel = selected ?? order[0] ?? null;
  const selCell = sel ? cellAt(core, sel, focusYear) : undefined;
  const selMuni = DATA.munis.find((m) => m.name === sel);
  const selGakudo = selMuni?.gakudo.find((g) => g.asOf === '2025-05-01');
  const note = sel ? core.notes.get(sel) : undefined;

  // S2 の巨大な数字：focusYear で最も足りない自治体
  const worst = order[0];
  const worstCell = worst ? cellAt(core, worst, focusYear) : undefined;

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
  const [step, stepRef] = useScrollStep(STORY_YEARS.length);
  const storyYear = STORY_YEARS[step];
  const zp = useZoomPan();

  const heatRows = expanded ? order : [...new Set([...order.slice(0, 10), ...(sel ? [sel] : [])])];

  return (
    <>
      <button className="theme-btn" onClick={toggleTheme}>
        {theme === 'light' ? 'DARK' : 'LIGHT'}
      </button>

      {/* ══ S0 ══ */}
      <section id="s0">
        <div className="ghost" aria-hidden="true">
          <Choropleth
            geo={GEO}
            palette={palette}
            cellOf={(m) => cellAt(storyCore, m, 2038)}
            decorative
          />
        </div>
        <div className="scrim" aria-hidden="true" />
        <div className="mid">
          <p className="eyebrow rise" ref={rise}>
            東京都オープンデータ ／ 49自治体
          </p>
          <h1 className="rise" ref={rise}>
            保育園には、入れた。
            <br />
            <em>でも、小1で詰んだ。</em>
          </h1>
          <p className="lede rise" ref={rise}>
            学童に入れないと、親のどちらかが働き方を変えることになる。
            <br />
            そしてそれは、家を決めたあとでは動かせない。
          </p>
        </div>
        <div className="scrollhint">
          <span>SCROLL</span>
          <i />
        </div>
      </section>

      {/* ══ S1 ══ */}
      <section id="s1">
        <div className="mid">
          <h2 className="rise" ref={rise}>
            家を決めるのは、いま。
            <br />
            <span className="dim">詰むのは、{focusYear - 2026}年後。</span>
          </h2>
          <div className="tl rise" id="tl" ref={rise}>
            <div className="line" />
            <div className="fill" />
            <div className="pt on" style={{ left: 0 }}>
              <b />
            </div>
            <div className="yr on" style={{ left: 12 }}>
              2026
            </div>
            <div className="cap" style={{ left: 60 }}>
              {birthYear}年生まれ。家を買う
            </div>
            <div className="pt on" style={{ left: 'calc(100% - 25px)' }}>
              <b />
            </div>
            <div className="yr on" style={{ left: 'calc(100% - 12px)' }}>
              {focusYear}
            </div>
            <div className="cap" style={{ left: 'calc(100% - 62px)' }}>
              小1。学童に入れない
            </div>
          </div>
          <p className="lede rise" ref={rise} style={{ marginTop: 52 }}>
            不動産サイトも区役所も、答えるのは<span className="hl">今年の</span>待機児童数だけ。
          </p>
        </div>
      </section>

      {/* ══ S2 ══ */}
      <section id="s2">
        <div className="mid" style={{ width: '100%' }}>
          <p className="eyebrow rise" ref={rise}>
            {worst} ／ {focusYear}年度の予測
          </p>
          <div className="n rise tab" ref={rise}>
            {fmt(worstCell?.detail.gap)}
          </div>
          <div className="unit rise" ref={rise}>
            人分、足りない。
          </div>
          <p className="lede rise" ref={rise} style={{ margin: '26px auto 0' }}>
            需要 {fmt(worstCell?.detail.demand)}人 に対して、いまの受け入れ実績は{' '}
            {fmt(worstCell?.detail.supply)}人。
          </p>
        </div>
      </section>

      {/* ══ S3 ══ */}
      <section id="s3">
        <div className="stick">
          <div className="yrbig tab">{storyYear}</div>
          <Choropleth
            geo={GEO}
            palette={palette}
            cellOf={(m) => cellAt(storyCore, m, storyYear)}
            decorative
          />
          <div className="cap">
            <div className="y tab">{storyYear}年度</div>
            <div className="t">{STORY_CAPS[storyYear]}</div>
          </div>
        </div>
        <div className="steps">
          {STORY_YEARS.map((y, i) => (
            <div className="step" key={y} ref={stepRef(i)} />
          ))}
        </div>
      </section>

      {/* ══ S4 ══ */}
      <section id="s4">
        <div className="mid">
          <div className="tool-hd rise" ref={rise}>
            <h2 style={{ fontSize: 'clamp(26px,3vw,42px)' }}>あなたの子の年で、調べる。</h2>
          </div>

          <div className="ctl rise" ref={rise}>
            <div className="g">
              <span className="k">子の生まれ</span>
              <select
                className="pick"
                value={birthYear}
                aria-label="生まれ年"
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
            <div className="g" style={{ marginLeft: 'auto' }}>
              <span className="k">登録率は毎年</span>
              <input
                className="rng"
                type="range"
                min={0}
                max={0.02}
                step={0.0002}
                value={trend}
                aria-label="登録率の年あたり上昇幅"
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

          <div className="stage rise" ref={rise} style={{ marginTop: 34 }}>
            <div className="mapbox">
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
                cellOf={(m) => cellAt(core, m, focusYear)}
                selected={sel}
                onSelect={setSelected}
                viewBox={zp.viewBox}
                svgRef={zp.ref}
                handlers={zp.handlers}
                scale={zp.scale}
              />
              <div className="legend">
                <span>低</span>
                <span className="bar">
                  {palette.ramp.map((c, i) => (
                    <Tip key={c} body={`${BIN_LABELS[i]}　需要のうち受け皿に入れない割合`}>
                      <i style={{ background: c, display: 'inline-block', width: 30, height: 8 }} />
                    </Tip>
                  ))}
                </span>
                <span>高</span>
                <span style={{ marginLeft: 12 }}>
                  {selCell?.basis === 'bridged' ? (
                    <Tip body={`区市町村別の都の公式推計は${core.bridgeFrom - 1}年度まで。それ以降は全都の公式推計の伸びで接続した推定です。誤差も実測していません。`}>
                      推定
                    </Tip>
                  ) : (
                    <Tip body="区市町村別の都の公式推計そのものです。">公式</Tip>
                  )}
                </span>
              </div>
              <p className="hint">スクロールで拡大・ドラッグで移動・ダブルクリックで戻る</p>
              {missing.length > 0 && (
                <p className="stub">
                  ⚠️ グレーの{missing.length}自治体はまだデータがありません（①のデータ整備待ち。
                  いまは {DATA.munis.length}自治体のサンプルで動いています）
                </p>
              )}
            </div>
            <div>
              <p className="k" style={{ marginBottom: 12 }}>
                リスクの高い自治体
              </p>
              <div className="rank">
                {order.slice(0, 10).map((m, i) => {
                  const c = cellAt(core, m, focusYear);
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
                      <span className="v tab">{s === null ? '—' : Math.round(s)}</span>
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
            </div>
          </div>

          {/* 選択中の詳細。箱は使わず巨大な数字ひとつ */}
          <div className="detail rise" ref={rise}>
            <p className="who">
              {sel}　{focusYear}年度
            </p>
            <div className="big tab">
              {fmt(selCell?.detail.gap)}
              <small>人分、足りない</small>
            </div>
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
                <span className="ic">{note.kind === 'real-shortage' ? '⚠' : 'ⓘ'}</span>
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

            <div className="acts">
              {alternatives.length === 0 && (
                <span className="act" style={{ cursor: 'default', color: 'var(--ink-3)' }}>
                  隣接自治体のデータがまだありません（①のデータ整備待ち）
                </span>
              )}
              {alternatives.map((a) => (
                <span className="act" key={a.muni} onClick={() => setSelected(a.muni)}>
                  隣接：<b>{a.muni}</b> {Math.round(a.score)}
                </span>
              ))}
              <span className="act">
                入学年度に合わせて<b>時期をずらす</b>
              </span>
              <span className="act">
                民間学童を<b>資金計画に入れる</b>
              </span>
            </div>
          </div>

          {/* ヒートマップ */}
          <div className="hm rise" ref={rise}>
            <div className="hmhd">
              <p className="k">いつ悪化するか</p>
              <button className="more-btn" onClick={() => setExpanded((v) => !v)}>
                {expanded ? '上位10件に戻す' : `${core.munis.length}自治体すべて`}
              </button>
            </div>
            <div className="grid">
              <div />
              {core.years.map((y) => (
                <div className={`gh${y === core.bridgeFrom ? ' br bridge-start' : ''}`} key={y}>
                  {String(y).slice(2)}
                </div>
              ))}
              {heatRows.map((m) => (
                <Row key={m} muni={m} core={core} sel={sel} palette={palette} />
              ))}
            </div>
            <p className="bridge-note">
              <i />
              {core.bridgeFrom}年度から右は、全都の公式推計の伸びで接続した<strong>推定</strong>です
              （区市町村別の公式推計は{core.bridgeFrom - 1}年度まで。この区間の誤差は実測していません）
            </p>
          </div>

          {/* シナリオ */}
          <div className="scen rise" ref={rise} style={{ display: 'block' }}>
            <p className="k" style={{ marginBottom: 12 }}>
              条件を変えて計算する
            </p>
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
          </div>
        </div>
      </section>

      {/* ══ S5 ══ */}
      <section id="s5">
        <div className="mid">
          <p className="eyebrow rise" ref={rise}>
            根拠
          </p>
          <h2 className="rise" ref={rise} style={{ fontSize: 'clamp(26px,3vw,42px)', marginTop: 14 }}>
            この予測が、どれくらい当たるか。
          </h2>
          <div className="ev">
            {DATA.backtest.map((b) => (
              <div className="rise" key={b.horizon} ref={rise}>
                <div className="n tab">
                  {b.maePct.toFixed(2)}
                  <small style={{ fontSize: '.5em' }}>%</small>
                </div>
                <div className="l">
                  {b.horizon}年先の絶対誤差平均。都の推計ヴィンテージを{b.n}地区で突き合わせた実測
                  （10〜90パーセンタイル {b.p10Pct.toFixed(2)}〜{b.p90Pct.toFixed(2)}%）
                </div>
              </div>
            ))}
            <div className="rise" ref={rise}>
              <div className="n tab">
                {pt(TREND.trend).replace('pt', '')}
                <small style={{ fontSize: '.5em' }}>pt</small>
              </div>
              <div className="l">
                登録率の年あたり上昇。{TREND.n}自治体の実測（
                {(TREND.rateFrom * 100).toFixed(1)}% → {(TREND.rateTo * 100).toFixed(1)}%）
                {TREND.excluded.length > 0 && `／${TREND.excluded.join('・')}は計上方法が変わったため除外`}
              </div>
            </div>
          </div>
          <p className="lede rise" ref={rise} style={{ marginBottom: 34 }}>
            誤差を実測できるのは1年先と2年先だけです（都の推計が3世代しかないため）。
            {core.bridgeFrom}年度以降は、都の公式推計どうしを接続した推定であることを画面に明示しています。
          </p>
          <div className="src rise" ref={rise}>
            <b>出典</b>　
            {DATA.sources.map((s, i) => (
              <span key={s.url}>
                {i > 0 && '／'}
                <a href={s.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
                  「{s.name}」
                </a>
                （{s.provider}・{s.license}・{s.retrievedAt}取得）
              </span>
            ))}
            <br />
            本サービスは上記データを加工して作成しています。
          </div>
        </div>
      </section>
    </>
  );
}

function Row({
  muni,
  core,
  sel,
  palette,
}: {
  muni: string;
  core: CoreResult;
  sel: string | null;
  palette: ReturnType<() => (typeof PALETTES)['light']>;
}) {
  return (
    <>
      <div className={`gn${muni === sel ? ' on' : ''}`}>{muni}</div>
      {core.years.map((y) => {
        const c = cellAt(core, muni, y);
        const s = c && !c.excluded ? c.score : null;
        return s === null ? (
          <div
            className={`c${y === core.bridgeFrom ? ' bridge-start' : ''}`}
            key={y}
            style={{ background: palette.nodata }}
            title={`${muni} ${y}年度 データなし`}
          />
        ) : (
          <div
            className={`c${c?.basis === 'bridged' ? ' br' : ''}${y === core.bridgeFrom ? ' bridge-start' : ''}`}
            key={y}
            style={{ background: fillOf(s, palette), color: palette.ink[binOf(s)] }}
            title={`${muni} ${y}年度　リスク ${Math.round(s)}　不足 ${fmt(c?.detail.gap)}人`}
          >
            {Math.round(s)}
          </div>
        );
      })}
    </>
  );
}
