/**
 * 出典・ライセンス表記。**LP とツールの両方で使う。**
 *
 * 🔴 大会ルールの提出要件（要件 FR-8 / NFR-3）。消さないこと。
 * 🔴 地図の出典（国土数値情報）は `DATA.sources` に入っていない。
 *    `data/geo/tokyo-49.topo.json` は③が外部（国土交通省）から加工して作ったもので、
 *    **国土交通省はクレジット記載を求めている**。審査動画は YouTube で一般公開されるので、
 *    ここを落とすと実害がある（React 版で一度落ちていた）。
 */
import { DATA } from './data';

/** 地図の境界データ。都のカタログ外なので DATA.sources とは別に持つ */
export const MAP_SOURCE = {
  name: '国土数値情報（行政区域データ）',
  provider: '国土交通省',
  url: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-v3_1.html',
} as const;

export function Sources() {
  return (
    <div className="src">
      <p>
        <b>出典</b>　
        {DATA.sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 && '／'}
            <a href={s.url} target="_blank" rel="noreferrer">
              「{s.name}」
            </a>
            （{s.provider}・{s.license}・{s.retrievedAt}取得）
          </span>
        ))}
      </p>
      <p>
        <b>地図</b>　
        <a href={MAP_SOURCE.url} target="_blank" rel="noreferrer">
          「{MAP_SOURCE.name}」
        </a>
        （{MAP_SOURCE.provider}）を加工して作成
      </p>
      <p>本サービスは上記データを加工して作成しています。東京都が提供する公式サービスではありません。</p>
    </div>
  );
}
