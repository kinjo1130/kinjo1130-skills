# インフラと CI/CD

## IaC

- クラウドのリソース（Cloudflare の Workers・R2・DNS、Neon のプロジェクトと branch、将来の Cloud Run）は**すべて Terraform で管理する**。ダッシュボードで手作業の作成・変更をしない
- 変更は `infra/` への PR で行い、`terraform plan` の結果を PR で確認してから apply する
- tfstate はリモート（R2 の S3 互換 backend）に置く。ローカルに持たない

```
infra/
├── modules/
│   ├── api-worker/          # Workers + secrets + route
│   ├── web-worker/
│   ├── database/            # Neon のプロジェクト・role・branch
│   └── storage/             # R2 bucket
├── environments/
│   ├── preview/
│   │   ├── main.tf
│   │   └── terraform.tfvars
│   └── production/
├── backend.tf
└── versions.tf              # provider のバージョンを固定する
```

- 環境の違いは `terraform.tfvars` だけで表す。モジュールの中に環境名で分岐する値を書かない
- 命名: リソース名は kebab-case（`album-photos`）、変数と module は snake_case（`database_url`）
- Cloud Run への移行時は `modules/api-cloud-run/` を足し、`environments/*` で差し替える

## 環境

| 環境 | 用途 | DB |
|---|---|---|
| local | 開発 | docker の PostgreSQL（ポートはグローバル規約の `{P}{S}432`） |
| preview | PR ごとの確認 | Neon の branch（PR 単位で作り、マージで消す） |
| production | 本番 | Neon の main branch |

## 環境変数を足す手順

1. 各 app の `src/config/env.ts` のスキーマに足す
2. `.env.example`（web / api それぞれ）に変数名・説明・必須か任意かを書く
3. 秘密の値なら Terraform の secret として登録し、そうでなければ `terraform.tfvars` に書く
4. 1〜3 を同じ PR に入れる

## CI（`.github/workflows/`）

| ワークフロー | PR 時 | main へのマージ時 |
|---|---|---|
| `ci.yml` | `biome ci` → `tsc --noEmit`（全パッケージ）→ dependency-cruiser → Vitest（カバレッジを artifact `coverage` で upload）→ build | — |
| `migrate.yml` | `prisma migrate diff` で生成 SQL を PR にコメント | `prisma migrate deploy`（production） |
| `infra.yml` | `terraform fmt -check` → `validate` → `plan`（PR にコメント）→ `tflint` / `trivy config` | `apply`（production は手動承認つき） |
| `deploy.yml` | preview 環境へデプロイ | production へデプロイ（migrate の後） |
| `e2e.yml` | preview 環境に対して Playwright | — |

- ワークフローの中でシークレットを `echo` しない。GitHub の Environment secrets を使う
- action はバージョンをコミット SHA で固定する
