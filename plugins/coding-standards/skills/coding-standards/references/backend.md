# バックエンド（apps/api — Hono + Prisma）

Go のように「明示的・簡素・予測可能」に書く。魔法（デコレータ、DI コンテナ、グローバルな singleton）は使わない。

## ディレクトリ構成

```
apps/api/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── app.ts                    # createApp(): ミドルウェア + ルートのマウント（ランタイム非依存）
│   ├── app-env.ts                # AppEnv / AppBindings / Services の型だけを置く（循環 import を防ぐ）
│   ├── entry/
│   │   ├── worker.ts             # Cloudflare Workers のエントリ（Workers の binding はここだけで触る）
│   │   └── node.ts               # Cloud Run 用のエントリ
│   ├── routes/
│   │   ├── index.ts              # 全 sub app のマウント。ここを見れば全エンドポイントが分かる
│   │   └── albums.ts             # sub app（ハンドラはインラインで書く）
│   ├── services/                 # ビジネスロジック
│   │   └── album-service.ts
│   ├── repositories/             # Prisma を使う実装
│   │   └── prisma-album-repository.ts
│   ├── interfaces/               # Repository・外部サービスの抽象
│   │   ├── album-repository.ts
│   │   └── storage.ts
│   ├── models/                   # API 内部のドメイン型（Date を持つ）
│   │   └── album.ts
│   ├── presenters/               # models → contracts のレスポンス型への変換
│   │   └── album-presenter.ts
│   ├── adapters/                 # ランタイム・外部サービスの具象（Prisma client、R2、S3 …）
│   │   ├── db/prisma-client.ts
│   │   └── storage/r2-storage.ts
│   ├── middlewares/
│   │   ├── require-auth.ts
│   │   └── error-handler.ts
│   ├── errors/
│   │   └── app-error.ts
│   ├── config/
│   │   └── env.ts                # loadConfig(): 環境変数の Zod 検証
│   ├── container.ts              # buildServices(): 依存の組み立て（唯一 new する場所）
│   └── generated/prisma/         # Prisma の生成物（git に入れない）
└── test/
```

## レイヤーと責務

| レイヤー | 書くこと | 書かないこと |
|---|---|---|
| `routes/` | 入力の検証（`zValidator`）→ Service 呼び出し → `return c.json()` | ロジック、`try-catch`、Prisma、`new` |
| `services/` | ビジネスルール、権限の判定、複数 Repository の調整 | Prisma のクエリ、HTTP（`Context`）、環境変数 |
| `repositories/` | Prisma のクエリ、Prisma の行 → `models/` の型への変換 | ビジネスルール |
| `presenters/` | `models/` → contracts のレスポンス型（`Date` → ISO 文字列） | I/O |
| `adapters/` | ランタイム・外部 SDK の具象 | ビジネスルール |
| `container.ts` | 具象を `new` して Service を組み立てる | 条件分岐を伴うロジック |

**Prisma の型（`generated/prisma` からの import）は `repositories/` と `adapters/db/` の外に出さない。**

## 依存の注入 — `c.env.services`

ランタイムごとの entry が設定と Service を組み立て、`app.fetch(request, { config, services })` の第 2 引数で渡す。
アプリ側は `c.env.config` と `c.env.services` を読むだけなので、Workers でも Cloud Run でも同じコードが動く。

```typescript
// src/app-env.ts — 型だけを置く。app.ts・routes・middlewares はここから import type する
export type Services = {
  albumService: AlbumService;
  sessionReader: SessionReader;
  logger: Logger;
};

export type AppBindings = {
  config: AppConfig;
  services: Services;
};

export type AppEnv = {
  Bindings: AppBindings;
};
```

```typescript
// src/app.ts
export const createApp = () => {
  const app = new Hono<AppEnv>()
    .use('*', requestLogger())
    .use(
      '*',
      cors({
        origin: (origin, c) => resolveAllowedOrigin(origin, c.env.config),
        credentials: true,
      }),
    )
    .route('/', routes);

  app.onError(handleError);

  return app;
};
```

```typescript
// src/entry/worker.ts
const app = createApp();

export default {
  fetch: (request: Request, env: WorkerBindings, executionContext: ExecutionContext) => {
    const config = loadConfig(env);
    const services = buildServices(config, {
      storage: createR2Storage(env.PHOTOS_BUCKET),
    });

    return app.fetch(request, { config, services }, executionContext);
  },
};
```

```typescript
// src/entry/node.ts
const app = createApp();
const config = loadConfig(process.env);
const services = buildServices(config, {
  storage: createS3Storage(config.storage),
});

serve({
  fetch: (request) => app.fetch(request, { config, services }),
  port: config.port,
});
```

- `buildServices` の第 2 引数（ランタイムごとに違う adapter）は、必要な adapter があるときだけ足す

- Workers ではリクエストごとに `buildServices` を呼ぶ（Prisma client もリクエスト単位）
- Node（Cloud Run）では起動時に 1 回だけ呼ぶ
- モジュールのトップレベルで Prisma client や Service を `new` しない

## ルーティング

- `.get()` / `.post()` / `.use()` / `.route()` は**必ず method chaining で繋ぐ**。別の文にすると戻り値の型が捨てられ、`hc` の型推論が効かなくなる
- ハンドラは**ルート定義の中にインラインで書く**。別ファイルに `(c: Context) => ...` として切り出すと `c.req.valid()` の型が失われ、`as` が必要になる
- ハンドラ本体は「入力の取り出し → Service 呼び出し → return」の 3 段落だけにする。それ以上になるならロジックを Service に移す
- sub app ごとに型を export し、web 側も sub app 単位で `hc` を作る（全体の型を 1 つにすると tsserver が重くなる）

```typescript
// src/routes/albums.ts
export const albumRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)
  .get('/', zValidator('query', listAlbumsQuerySchema, validationHook), async (c) => {
    const query = c.req.valid('query');
    const { albumService } = c.env.services;

    const page = await albumService.list(c.var.currentUser, query);

    return c.json(page, 200);
  })
  .post('/', zValidator('json', createAlbumInputSchema, validationHook), async (c) => {
    const input = c.req.valid('json');
    const { albumService } = c.env.services;

    const album = await albumService.create(c.var.currentUser, input);

    return c.json(album, 201);
  });

export type AlbumRoutes = typeof albumRoutes;
```

```typescript
// src/routes/index.ts
export const routes = new Hono<AppEnv>()
  .route('/health', healthRoutes)
  .route('/auth', authRoutes)
  .route('/albums', albumRoutes);
```

## 認証ミドルウェア

- better-auth のセッションを `c.env.services.sessionReader` で読み、`c.set('currentUser', ...)` する `requireAuth` を作る
- `requireAuth` は `createMiddleware<{ Bindings: AppBindings; Variables: { currentUser: CurrentUser } }>` で型を付ける。chain に `.use('*', requireAuth)` を入れた sub app のハンドラでだけ `c.var.currentUser` が型付きで使える
- 配置は**認証が要る sub app ごとに、chain の先頭で `.use('*', requireAuth)`**。`routes/index.ts` には置かない（`/health` と `/auth` が常に public なため）
- 権限（「このアルバムの持ち主か」）の判定は Service で行う。ミドルウェアは「ログインしているか」だけ

## Service

- class で書き、依存は constructor で受け取る（`private readonly`）
- 引数は「誰が（`currentUser`）」「何を（contracts の入力型）」の順
- 戻り値は contracts のレスポンス型（`presenters/` で変換する）
- 失敗は `AppError` のサブクラスを `throw` する。`null` や `{ ok: false }` を返さない

```typescript
// src/services/album-service.ts
export class AlbumService {
  constructor(
    private readonly albumRepository: AlbumRepository,
    private readonly storage: Storage,
  ) {}

  async create(currentUser: CurrentUser, input: CreateAlbumInput): Promise<AlbumResponse> {
    const duplicated = await this.albumRepository.findByTitle(currentUser.id, input.title);

    if (duplicated) {
      throw new ConflictError('ALBUM_TITLE_TAKEN', '同じタイトルのアルバムが既にあります');
    }

    const album = await this.albumRepository.create({
      ownerId: currentUser.id,
      title: input.title,
      description: input.description ?? null,
    });

    return toAlbumResponse(album);
  }
}
```

## Repository

- インターフェースを `interfaces/` に、Prisma 実装を `repositories/prisma-*.ts` に置く
- 戻り値は `models/` の型。Prisma の行を返さない（`toAlbum(row)` で変換する）
- 1 つの集約（アルバムとその写真など）にまたがる更新は、Repository の 1 メソッドの中で `$transaction` を使う
- `select` / `include` は必要なカラムだけ取る。N+1 になる書き方（ループの中で `findUnique`）をしない
- 一意性は DB の unique 制約で保証する。Service の事前チェック（`findByTitle`）は分かりやすいエラーを返すためのもので、競合の防止は制約に任せる
- Prisma の既知のエラー（`P2002` 一意制約違反、`P2025` 対象なし）は、Repository の中で `try-catch` して `ConflictError` / `NotFoundError` に翻訳する。それ以外の例外はそのまま投げる

## ページング

- 一覧は cursor 方式。並び順は `id` の降順（UUIDv7 は生成順に並ぶ）で、cursor は前のページの最後の `id`
- `limit` は既定 20、上限 100。contracts の `cursorPageQuerySchema` / `cursorPageSchema(itemSchema)` を使う
- Repository は `limit + 1` 件を返すだけにする。次のページがあるかの判定と `nextCursor` の算出は `services/pagination.ts` の `toCursorPage(rows, limit)` で行う

## Prisma

- generator と driver adapter（`@prisma/adapter-neon`）の設定は、Prisma 公式の Cloudflare Workers 手順に合わせる。Cloud Run に移っても同じ adapter で動く
- client は `adapters/db/prisma-client.ts` の `createPrismaClient(databaseUrl)` からだけ作る
- モデルの決まりごと

| 項目 | 規則 |
|---|---|
| 主キー | `id String @id @default(uuid(7)) @db.Uuid` |
| 日時 | `createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)` と `updatedAt ... @updatedAt` を全テーブルに置く |
| 命名 | model は単数形 PascalCase、テーブルは `@@map("albums")` で複数形 snake_case、カラムは `@map` で snake_case |
| 削除 | 物理削除。履歴が要件になったときだけ `deletedAt` を足す |
| 外部キー | `onDelete` を必ず明示する |
| 列挙 | Prisma の `enum` を使い、contracts の `z.enum` と値を揃える |

- マイグレーションはローカルで `prisma migrate dev`、CI / 本番で `prisma migrate deploy`。`prisma db push` は使わない
- 生成された SQL は PR で読む。破壊的変更（カラム削除・型変更）は「追加 → 移行 → 削除」の 2 回のリリースに分ける

## エラーハンドリング

- ハンドラ・Service・Repository に `try-catch` を書かない。例外は `app.onError(handleError)` で一括して HTTP レスポンスにする
- `try-catch` を書いてよいのは 2 箇所だけ。外部 API の失敗を翻訳する `adapters/` と、Prisma の既知のエラーを翻訳する `repositories/`
- エラーレスポンスの形は contracts の `errorResponseSchema` に固定する

```typescript
// packages/contracts/src/common.ts
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
```

```typescript
// src/errors/app-error.ts
export class AppError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(code: string, message: string) {
    super(404, code, message);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}
```

- `code` は `UPPER_SNAKE_CASE` の機械可読な文字列（`ALBUM_NOT_FOUND`）。web はこれで分岐し、`message` の文言では分岐しない
- `zValidator` には共通の `validationHook` を渡し、Zod のエラーを `400 VALIDATION_ERROR`（`details` に issues）にする
- 想定外の例外は `logger.error` に出し、レスポンスは `500 INTERNAL_ERROR` だけ返す（スタックトレースを返さない）
