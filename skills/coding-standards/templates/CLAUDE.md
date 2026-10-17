# <product>

## コーディング規約

コードを書く・直す・レビューする前、および実装計画を作る前に、必ず `kinjo1130-skills:coding-standards` skill を読み込み、その規約に従う。
このファイルには、規約に対するこのプロダクト固有の差分だけを書く。

## コマンド

- commands.lint: "pnpm biome ci ."
- commands.typecheck: "pnpm -r typecheck"
- commands.test: "pnpm -r test -- --bail 1"
- commands.test_scoped: "pnpm vitest run {file}"
- commands.coverage: "pnpm -r test:coverage"

## カバレッジ

閾値はグローバル既定（100%）に従う。

- coverage.ci_artifact: coverage
- coverage.output_format: lcov

## ポート

P = <プロジェクト番号>

| 用途 | ポート |
|---|---|
| web | `3{P}{S}0` |
| api | `3{P}{S}1` |
| DB | `{P}{S}432` |
| DB（テスト） | `{P}{S}433` |

## このプロダクト固有の差分

- （例）写真の保存先は R2。`Storage` インターフェースの R2 実装を使う
