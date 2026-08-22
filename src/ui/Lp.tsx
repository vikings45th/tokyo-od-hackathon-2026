/**
 * ランディングページ（`/`）。**課題と主張だけを扱う。操作はしない。**
 *
 * ツール（`/tool/`）と分けた理由（docs/16 §2 の改訂）：
 *   - 1枚だった頃、ツールはページの78%地点にあった。公開URLを開いた審査員は
 *     9画面スクロールしないと何も触れなかった
 *   - LP＝説得／ツール＝提供。仕事が違うものを混ぜると、物語が操作バーで唐突に終わる
 *   - 審査基準「サービスデザイン＝持続的に提供できるか」に構造で効く
 *
 * 🔴 このページの各セクションは **2分動画の1ビートと1対1**（docs/19-narrative.md）。
 *    1920×1080 の 16:9 に収まる構図を保つこと。スライドの画面キャプチャに使う。
 */
import { entryYearOf } from '../core';
import { PALETTES } from './palette';
import { Choropleth } from './Choropleth';
import { DATA, GEO, TREND, compute, fmt, pt } from './data';
import { useCountUp, useInView, useScrollStep, useTheme } from './hooks';
import { Sources } from './Sources';

/** LP は入力を持たない。UC-1（docs/13-requirements.md §5）の具体例で語る */
const LP_BIRTH_YEAR = 2024;
const LP_BIRTH_MONTH = 6;
const LP_ENTRY_YEAR = entryYearOf(LP_BIRTH_YEAR, LP_BIRTH_MONTH);

const STORY_YEARS = [2027, 2031, 2038];
const STORY_CAPS: Record<number, string> = {
  2027: 'いまはまだ、ほとんどの区が足りている。',
  2031: 'いま0歳の子が、小1になる年。',
  2038: '受け皿が変わらなければ、ここまで広がる。',
};

export default function Lp() {
  const [theme] = useTheme();
  const palette = PALETTES[theme];

  // LP は既定シナリオ（実測どおり）だけを見せる。入力に依存しない
  const core = compute({});
  const cellAt = (muni: string, year: number) => core.byMuni.get(muni)?.find((r) => r.year === year);

  // S2：LP_ENTRY_YEAR に最も足りない自治体
  const worst = core.munis
    .map((m) => m.name)
    .filter((m) => (cellAt(m, LP_ENTRY_YEAR)?.score ?? null) !== null)
    .sort((a, b) => (cellAt(b, LP_ENTRY_YEAR)!.score ?? 0) - (cellAt(a, LP_ENTRY_YEAR)!.score ?? 0))[0];
  const worstCell = worst ? cellAt(worst, LP_ENTRY_YEAR) : undefined;

  const rise = useInView<HTMLElement>();
  const [gap, gapRef] = useCountUp(Math.round(worstCell?.detail.gap ?? 0));
  const [step, stepRef] = useScrollStep(STORY_YEARS.length);
  const storyYear = STORY_YEARS[step];

  return (
    <>
      <header className="wm-bar">
        <a className="wm" href="/">
          小1の壁マップ
        </a>
      </header>

      <main>
        {/* ══ S0 ══ */}
        <section id="s0" aria-labelledby="s0h">
          <div className="ghost" aria-hidden="true">
            <Choropleth geo={GEO} palette={palette} cellOf={(m) => cellAt(m, 2038)} decorative />
          </div>
          <div className="scrim" aria-hidden="true" />
          <div className="mid">
            <p className="eyebrow rise" ref={rise}>
              東京都オープンデータ ／ 49自治体
            </p>
            <h1 id="s0h" className="rise" ref={rise}>
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
          <div className="scrollhint" aria-hidden="true">
            <span>SCROLL</span>
            <i />
          </div>
        </section>

        {/* ══ S1 ══ */}
        <section id="s1" aria-labelledby="s1h">
          <div className="mid">
            <h2 id="s1h" className="rise" ref={rise}>
              家を決めるのは、いま。
              <br />
              <span className="dim">詰むのは、{LP_ENTRY_YEAR - 2026}年後。</span>
            </h2>
            <div className="tl rise" ref={rise}>
              <div className="line" />
              <div className="fill" />
              <div className="pt on" style={{ left: 0 }}>
                <b />
              </div>
              <div className="yr on" style={{ left: 12 }}>
                2026
              </div>
              <div className="cap" style={{ left: 60 }}>
                {LP_BIRTH_YEAR}年生まれ。家を買う
              </div>
              <div className="pt on" style={{ left: 'calc(100% - 25px)' }}>
                <b />
              </div>
              <div className="yr on" style={{ left: 'calc(100% - 12px)' }}>
                {LP_ENTRY_YEAR}
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
        <section id="s2" aria-labelledby="s2h">
          <div className="mid" style={{ width: '100%' }}>
            <p className="eyebrow rise" ref={rise}>
              都内で最も足りない自治体では ／ {LP_ENTRY_YEAR}年度の予測
            </p>
            <div className="n tab" ref={gapRef}>
              {fmt(gap)}
            </div>
            <h2 id="s2h" className="unit rise" ref={rise}>
              人分、足りない。
            </h2>
            <p className="lede rise" ref={rise} style={{ margin: '26px auto 0' }}>
              需要 {fmt(worstCell?.detail.demand)}人 に対して、いまの受け入れ実績は{' '}
              {fmt(worstCell?.detail.supply)}人。
            </p>
          </div>
        </section>

        {/* ══ S3 ══ */}
        <section id="s3" aria-label="年度が進むと不足がどこまで広がるか">
          <div className="stick">
            <div className="yrbig tab" aria-hidden="true">
              {storyYear}
            </div>
            <Choropleth geo={GEO} palette={palette} cellOf={(m) => cellAt(m, storyYear)} decorative />
            <div className="cap">
              <div className="y tab">{storyYear}年度</div>
              <div className="t">{STORY_CAPS[storyYear]}</div>
            </div>
          </div>
          <div className="steps" aria-hidden="true">
            {STORY_YEARS.map((y, i) => (
              <div className="step" key={y} ref={stepRef(i)} />
            ))}
          </div>
        </section>

        {/* ══ CTA ══ 物語からツールへの受け渡し。2分動画の場面転換はここ */}
        <section id="cta" aria-labelledby="ctah">
          <div className="mid">
            <h2 id="ctah" className="rise" ref={rise}>
              では、あなたの街は。
            </h2>
            <p className="lede rise" ref={rise}>
              子の生まれ年月を選ぶだけで、小1になる年度の学童リスクを49自治体で比べられます。
            </p>
            <a className="cta-btn rise" ref={rise} href="/tool/">
              あなたの街を調べる
            </a>
          </div>
        </section>

        {/* ══ 根拠 ══ 「データ活用」の主張。最下部ではなく主役の1つとして置く */}
        <section id="ev" aria-labelledby="evh">
          <div className="mid">
            <p className="eyebrow rise" ref={rise}>
              根拠
            </p>
            <h2 id="evh" className="sect-sm rise" ref={rise}>
              予測ではなく、当たり外れを測ってあります。
            </h2>
            <div className="ev">
              {DATA.backtest.map((b) => (
                <div className="rise" key={b.horizon} ref={rise}>
                  <div className="n tab">
                    {b.maePct.toFixed(2)}
                    <small>%</small>
                  </div>
                  <div className="l">
                    {b.horizon}年先の絶対誤差平均。東京都の推計を{b.n}地区で世代間突き合わせした実測値
                  </div>
                </div>
              ))}
              <div className="rise" ref={rise}>
                <div className="n tab">
                  {DATA.sources.length + 1}
                  <small>件</small>
                </div>
                <div className="l">
                  使用しているオープンデータ。うち{DATA.sources.length}件は東京都オープンデータ
                  カタログの CC BY 4.0
                </div>
              </div>
            </div>
            <p className="lede rise" ref={rise}>
              登録率の上昇は都の3時点データから実測した {pt(TREND.trend)}／年。
              誤差を実測できるのは1年先と2年先だけで、それ以降が推定であることは画面に明示しています。
            </p>
          </div>
        </section>
      </main>

      <footer className="ft">
        <div className="mid">
          <a className="cta-btn sm" href="/tool/">
            あなたの街を調べる
          </a>
          <Sources />
        </div>
      </footer>
    </>
  );
}
