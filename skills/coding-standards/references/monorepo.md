# モノレポ構成と依存の方向

## 技術スタック（固定）

| 領域 | 採用 |
|---|---|
| パッケージ管理 | pnpm workspace（Node のバージョンは mise で固定） |
| 言語 | TypeScript（`templates/tsconfig.base.json`） |
| フロントエンド | React 19 + TanStack Start（SSR）+ TanStack Router + TanStack Query |
| UI | Tailwind CSS v4 / フォームは react-hook-form + `@hookform/resolvers/zod` / Storybook（ui 層のみ） |
| API | Hono + `@hono/zod-validator` / web からは `hono/client` の `hc` で呼ぶ |
| ORM / DB | Prisma（driver adapter）/ Neon（PostgreSQL） |
| 認証 | better-auth（Cookie セッション） |
| 実行基盤 | 現在は Cloudflare Workers、成長したら Cloud Run へ移す（→ ランタイムの移植性） |
| Format / Lint | Biome（`templates/biome.json`）+ dependency-cruiser（依存の方向） |
| テスト | Vitest / Testing Library / MSW / Playwright（E2E） |
| IaC | Terraform |

このリストにないライブラリを足すときは、実装の前にユーザーに確認する。

## ディレクトリ構成

```
<product>/
├── apps/
│   ├── web/                 # TanStack Start（→ frontend.md）
│   └── api/                 # Hono（→ backend.md）
├── packages/
│   └── contracts/           # Zod スキーマと、そこから作る型（web と api の唯一の共有物）
│       └── src/
│           ├── album.ts
│           ├── common.ts    # ページング・エラーレスポンス
│           └── index.ts
├── infra/                   # Terraform（→ infra.md）
├── .github/workflows/       # CI/CD
├── biome.json
├── tsconfig.base.json
├── .dependency-cruiser.cjs
├── pnpm-workspace.yaml
└── .claude/CLAUDE.md        # templates/CLAUDE.md を元に作る
```

パッケージ名は `@<product>/web` / `@<product>/api` / `@<product>/contracts` とする。

## パッケージ間の依存

```
apps/web ──▶ packages/contracts
   │
   └─(import type のみ)─▶ apps/api の routes の型（hc 用）

apps/api ──▶ packages/contracts
```

- `packages/contracts` は Zod 以外に依存しない。Prisma・Hono・React を import しない
- `apps/web` から `apps/api` への import は **`import type` だけ**（hc の型推論用）。実行時のコードを取り込まない
- `apps/api` から `apps/web` は import しない
- これらは `.dependency-cruiser.cjs` で CI が検査する
- web が型を取れるように、api の `package.json` は routes の型だけを subpath export する。`src/routes/index.ts` から全 sub app の型（`AlbumRoutes` など）を re-export する

```json
// apps/api/package.json（抜粋）
{
  "name": "@<product>/api",
  "exports": {
    "./routes": "./src/routes/index.ts"
  }
}
```

```typescript
// apps/web/src/api/client.ts
import type { AlbumRoutes } from '@<product>/api/routes';
```

## contracts に置くもの・置かないもの

| 置く | 置かない |
|---|---|
| API の入力スキーマ（`createAlbumInputSchema`） | Prisma の型・DB の行の形 |
| API のレスポンススキーマ（`albumSchema`） | 画面専用の表示用の型（web の `types/` に置く） |
| ページング・エラーレスポンスの共通形 | ビジネスロジック |
| 列挙値（`albumStatusSchema = z.enum([...])`） | 環境変数のスキーマ（各 app の `config/` に置く） |

## ランタイムの移植性（Workers → Cloud Run）

Workers 固有のもの（`c.env`、`ExecutionContext`、R2 / KV / Queues の binding）は **`apps/api/src/entry/` と `apps/api/src/adapters/` の中だけ**で触る。
それ以外のコードはどちらのランタイムでも同じものが動くようにする。

| 関心事 | ランタイム非依存の書き方 |
|---|---|
| 起動 | `createApp(deps)` を `app.ts` に置き、`entry/worker.ts` と `entry/node.ts` がそれぞれ deps を組み立てて呼ぶ |
| 環境変数 | `loadConfig(source)` が Zod で検証する。Workers は `env`、Node は `process.env` を渡す |
| DB | `createPrismaClient(config.databaseUrl)` を `adapters/db/` に置く |
| ファイル保存 | `interfaces/storage.ts` の `Storage` を介す。R2 binding 版と S3 互換 API 版の実装を `adapters/storage/` に置く |
| 非同期処理 | `interfaces/job-queue.ts` を介す（Workers は Queues、Cloud Run は Cloud Tasks） |
| ログ | `console` を直接呼ばず `logger` を注入する（JSON 1 行で出す） |

`process.env` と `c.env` を `entry/` 以外で参照していたら規約違反。

## 環境変数

- 各 app の `src/config/env.ts` に Zod スキーマを置き、起動時（Workers はリクエスト時）に parse する。足りなければ例外で止める
- 変数を足したら、同じ PR で `.env.example`（web / api それぞれ）とスキーマと Terraform を更新する
- ローカルの値は `apps/api/.dev.vars` と `apps/web/.env.local` に置く。どちらも git に入れない
- 本番の値は Terraform（`infra/`）から Workers の secret として登録する。手で `wrangler secret put` しない
