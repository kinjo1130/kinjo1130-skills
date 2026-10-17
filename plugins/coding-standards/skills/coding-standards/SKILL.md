---
name: coding-standards
description: >-
  TanStack Start + Hono + Prisma の pnpm モノレポでプロダクトを作るときのコーディング規約。
  コードを書く・直す・レビューする時、アイデアから実装計画を作る時、新規プロダクトを立ち上げる時に必ず読み込む。
  プロジェクトの CLAUDE.md / AGENTS.md が「coding-standards に従う」と指示している時にも使用する。
---

# コーディング規約

この規約の目的は、誰が（どのセッションが）書いても**同じ形のコード**になることです。
規約に書いていない判断が必要になったら、自分で決めずにユーザーに確認してください。

## 読み込む reference

コードを 1 行でも書く前に、作業に応じて次のファイルを読んでください。
**`formatting.md` と `typescript.md` は毎回読みます。**

| 作業 | 読むファイル |
|---|---|
| すべての作業 | `references/formatting.md`、`references/typescript.md` |
| 新規プロダクトの立ち上げ・パッケージをまたぐ変更・実装計画の作成 | `references/monorepo.md` |
| `apps/api`（Hono・Prisma・DB スキーマ） | `references/backend.md` |
| `apps/web`（TanStack Start・React） | `references/frontend.md` |
| テストを書く・TDD で進める | `references/testing.md` |
| Terraform・CI/CD・環境変数 | `references/infra.md` |

実装計画（plan）の中のコード例や、レビューで示す修正例にも同じ規約を適用します。

## 新規プロダクトを立ち上げるとき

1. `references/monorepo.md` の構成どおりにディレクトリを作る
2. `templates/` のファイルをルートにコピーする
   - `templates/biome.json` → `biome.json`
   - `templates/tsconfig.base.json` → `tsconfig.base.json`
   - `templates/dependency-cruiser.cjs` → `.dependency-cruiser.cjs`
   - `templates/biome-plugins/` → `biome-plugins/`
   - `templates/CLAUDE.md` → `.claude/CLAUDE.md`（Claude Code 用）
   - `templates/AGENTS.md` → `AGENTS.md`（Codex 用）
   - どちらも `<product>` とプロジェクト番号を埋める。両方のツールで開発するなら両方置く
3. 最初の PR に CI（`references/infra.md` の `ci.yml`）を入れる。規約の多くは Biome・tsc・dependency-cruiser が機械的に検査する

## 書き終えたら確認すること

コードを出力・コミットする前に、書いたコードを次の観点で読み直してください。1 つでも当てはまれば直してから出します。

- [ ] 関数本体が段落（取り出し → 検証 → 本処理 → 返却）に分かれ、段落の間に空行があるか
- [ ] 1 行に複数の文、1 行の `if (...) return`、ネストした三項演算子がないか
- [ ] `a` `e` `res` `tmp` `data` のような省略名・意味のない名前がないか
- [ ] `any`・`as`（`as const` 以外）・`!`・`@ts-ignore` がないか。外部の値を Zod で parse しているか
- [ ] 型を contracts の Zod スキーマから作っているか（同じ形の型を手書きしていないか）
- [ ] レイヤーの境界を越えていないか（Prisma の型が Repository の外に出ていない、domain コンポーネントが hooks を呼んでいない など）
- [ ] `process.env` / `c.env` の binding を `entry/` と `config/` 以外で読んでいないか
- [ ] Hono のルート・ミドルウェアが method chaining で繋がっているか。ハンドラがインラインか
- [ ] `try-catch` を `adapters/` と `repositories/`（Prisma のエラー翻訳）以外に書いていないか
- [ ] テストを先に書き、デシジョンテーブルの行を網羅しているか
- [ ] 環境変数を足したなら、スキーマ・`.env.example`・Terraform を同じ変更に入れたか
