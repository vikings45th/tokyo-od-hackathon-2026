"""munis/schools/tokyo/backtest/sources を1つの AppData（src/types.ts）に集約する。

入力:
  data/processed/munis.json    … build_munis.py
  data/processed/schools.json  … build_schools.py
  data/processed/tokyo.json    … build_tokyo.py
  data/processed/backtest.json … build_backtest.py
  data/processed/sources.json  … data/SOURCES.md の #1〜7 を手で転記したもの（後述）

出力:
  data/app/data.json … AppData（src/types.ts）。data/app/ 直下は公開してよいものだけを置く
  （data/ 直下には転載不可のPDF・CSVがあるため。docs/07-team-workflow.md）。

backtest[] について:
  設計書 docs/14-basic-design.md §2 では backtest.ts（教育人口等推計3ヴィンテージを
  実際に突き合わせて誤差を計算するロジック）は②の担当と分担している。ただし
  シナリオに依存しない決定論的な集計（munis/schools/tokyoと同じ性質）なので、
  build_backtest.py として前処理側（①）に実装し、他の *.json と同じ流れで
  data/processed/backtest.json をコミットしている。②の設計と食い違う場合は要相談。

sources[] について:
  data/processed/sources.json は data/SOURCES.md の #1〜7（#8社会福祉施設等一覧は
  v1未使用のため含めない）を手で転記したもの。SOURCES.md を更新したらここも
  合わせて直すこと（二重管理だが、表からの自動抽出は「手を抜かない」要件に対して
  かえって間違いに気づきにくくなるため、あえて手で合わせる）。

使い方: python scripts/build_app_data.py （リポジトリルートで実行）
"""
import json, os

PROCESSED = "data/processed"
APP = "data/app"


def load(name):
    with open(f"{PROCESSED}/{name}", encoding="utf-8") as f:
        return json.load(f)


def main():
    munis = load("munis.json")
    schools = load("schools.json")
    tokyo = load("tokyo.json")
    backtest = load("backtest.json")
    sources = load("sources.json")

    assert len(munis) == 49, f"munis は49件のはずが {len(munis)} 件"
    assert len(schools) > 1000, f"schools が少なすぎる: {len(schools)} 件"
    assert len(sources) == 7, f"sources は7件のはずが {len(sources)} 件"

    app_data = {
        "munis": munis,
        "schools": schools,
        "tokyo": tokyo,
        "backtest": backtest,
        "sources": sources,
    }

    os.makedirs(APP, exist_ok=True)
    out_path = f"{APP}/data.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(app_data, f, ensure_ascii=False, indent=1)

    size_kb = os.path.getsize(out_path) / 1024
    print(f"{out_path}: {size_kb:.1f} KB")
    print(f"  munis={len(munis)} schools={len(schools)} "
          f"tokyo.allGrades={len(tokyo['allGrades'])} backtest={len(backtest)} sources={len(sources)}")


if __name__ == "__main__":
    main()
