/**
 * ①のデータ受け入れ検査。
 *
 * 実データ（data/app/*.json）が来た瞬間に鳴らすブザー。
 * 1.5日しかないので、形が違うデータを黙って食べて変な数字を出すのが一番怖い。
 */
import type { AppData, Muni } from '../types';
import { BASE_YEAR, GAKUDO_BASE_DATE, GAKUDO_PREV_DATE } from './constants';
import { gakudoAt, n0Of } from './scope';
import { sum } from './stats';

export interface ValidationReport {
  ok: boolean;
  /** 致命的。これがあると数字が信用できない */
  problems: string[];
  /** 気づきレベル。動きはする */
  warnings: string[];
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

export function validateAppData(input: unknown): ValidationReport {
  const problems: string[] = [];
  const warnings: string[] = [];
  const d = input as Partial<AppData> | null;

  if (!d || typeof d !== 'object') {
    return { ok: false, problems: ['AppData がオブジェクトではありません'], warnings };
  }
  for (const key of ['munis', 'schools', 'tokyo', 'backtest', 'sources'] as const) {
    if (d[key] === undefined) problems.push(`AppData.${key} がありません`);
  }
  if (!isArray(d.munis) || d.munis.length === 0) {
    problems.push('AppData.munis が空です');
    return { ok: false, problems, warnings };
  }

  // FR-8・大会ルール：出典が無いと提出要件を満たさない
  if (!isArray(d.sources) || d.sources.length === 0) {
    problems.push('AppData.sources が空です（FR-8：出典・ライセンス表記は必須）');
  }

  const names = new Set<string>();
  for (const m of d.munis as Muni[]) {
    const at = (msg: string) => `${m?.name ?? '(名前なし)'}: ${msg}`;
    if (!m?.name) {
      problems.push('name の無い自治体があります（name は全ファイル共通の結合キー）');
      continue;
    }
    if (names.has(m.name)) problems.push(at('自治体名が重複しています'));
    names.add(m.name);

    const base = m.official?.find((o) => o.year === BASE_YEAR);
    if (!base) {
      problems.push(at(`official に ${BASE_YEAR} 年度がありません（N0 の出どころ）`));
    } else if (base.grades?.length !== 6) {
      problems.push(at(`official[${BASE_YEAR}].grades が6要素ではありません`));
    } else {
      // 🔴 決定1の検算：baseChildren と official[2025] は同じ年の同じ値のはず。
      //    sample.json の品川区で 25% ずれていた（14,417 vs 18,041）。
      const officialSum = sum(base.grades);
      if (m.baseChildren > 0 && officialSum > 0) {
        const diff = Math.abs(officialSum - m.baseChildren) / m.baseChildren;
        if (diff > 0.01) {
          problems.push(
            at(
              `baseChildren (${m.baseChildren.toLocaleString()}) と official[${BASE_YEAR}] の合計 ` +
                `(${officialSum.toLocaleString()}) が ${(diff * 100).toFixed(1)}% 食い違います。` +
                'r_latent の分母は official[2025] を使いますが、出所の突合が必要です',
            ),
          );
        }
      }
    }

    if (n0Of(m) <= 0) problems.push(at('N0（2025年度の全学年児童数）が 0 以下です'));

    if (!isArray(m.gakudo) || m.gakudo.length === 0) {
      problems.push(at('gakudo が空です'));
    } else {
      if (!gakudoAt(m, GAKUDO_BASE_DATE)) problems.push(at(`gakudo に ${GAKUDO_BASE_DATE} がありません（Reg/Wait の基準日）`));
      if (!gakudoAt(m, GAKUDO_PREV_DATE)) warnings.push(at(`gakudo に ${GAKUDO_PREV_DATE} がありません（トレンド実測に使えません）`));
      const dates = m.gakudo.map((g) => g.asOf);
      if ([...dates].sort().join() !== dates.join()) warnings.push(at('gakudo が日付昇順ではありません'));
    }

    if (!m.children2023 || m.children2023 <= 0) {
      warnings.push(at('children2023 がありません（トレンド実測から外れます）'));
    }
  }

  // schools の muni が munis に居るか（結合キーの確認）
  if (isArray(d.schools)) {
    const orphan = new Set<string>();
    for (const s of d.schools as AppData['schools']) {
      if (s?.muni && !names.has(s.muni)) orphan.add(s.muni);
    }
    if (orphan.size) warnings.push(`schools.muni が munis に無い: ${[...orphan].join(', ')}`);
  }

  // tokyo：bridged 接続に必要
  const tokyoYears = d.tokyo?.allGrades?.map((t) => t.year) ?? [];
  if (tokyoYears.length === 0) {
    problems.push('tokyo.allGrades が空です（bridged 区間を計算できません）');
  } else {
    const officialYears = (d.munis as Muni[]).flatMap((m) => m.official?.map((o) => o.year) ?? []);
    const lastOfficial = officialYears.length ? Math.max(...officialYears) : 0;
    if (!tokyoYears.includes(lastOfficial)) {
      problems.push(`tokyo.allGrades に ${lastOfficial} 年度がありません（接続の起点に使います）`);
    }
  }

  // backtest：予測区間の出どころ
  const horizons = new Set((d.backtest ?? []).map((b) => b.horizon));
  if (!horizons.has(1) || !horizons.has(2)) {
    warnings.push('backtest に horizon 1 と 2 が揃っていません（予測区間が 0 幅になります）');
  }

  return { ok: problems.length === 0, problems, warnings };
}
