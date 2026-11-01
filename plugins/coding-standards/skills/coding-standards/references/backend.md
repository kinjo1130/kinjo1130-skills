# バックエンド（apps/api — Hono + Prisma）

Go のように「明示的・簡素・予測可能」に書く。魔法（デコレータ、DI コンテナ、グローバルな singleton）は使わない。

構成はモジュラーモノリスにする。アプリも DB も 1 つのまま、業務ロジックを業務のまとまり（ドメイン）ごとに分け、ドメインどうしは相手が公開した関数だけを通して触れ合う。
ここに書く決まりは、ほとんどが「どのファイルが何を import してよいか」の形をしている。dependency-cruiser（`templates/dependency-cruiser.cjs`）が CI で検査するので、文章の解釈に頼らない。

## ディレクトリ構成

```
apps/api/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── app.ts                    # createApp(): ミドルウェア + ルートのマウント（ランタイム非依存）
│   ├── app-env.ts                # AppEnv / AppBindings の型だけを置く（循環 import を防ぐ）
│   ├── deps.ts                   # Deps 型と buildDeps(): 依存の組み立て（唯一 new する場所）
│   ├── entry/
│   │   ├── worker.ts             # Cloudflare Workers のエントリ（fetch と scheduled）
│   │   └── node.ts               # Cloud Run 用のエントリ
│   ├── routes/                   # HTTP の入口。リソース（URL の名詞）ごとの sub app
│   │   ├── index.ts              # 全 sub app のマウント。ここを見れば全エンドポイントが分かる
│   │   └── albums.ts             # /albums 配下（/albums/:albumId/photos も含む）
│   ├── presenters/               # domains の戻り値 → contracts のレスポンス型への変換
│   │   ├── album-presenter.ts
│   │   └── photo-presenter.ts
│   ├── domains/                  # 業務ロジック。ドメインごとのディレクトリ。Hono を import しない
│   │   ├── album/
│   │   │   ├── index.ts          # 公開窓口（queries と usecases だけを re-export）
│   │   │   ├── rules.ts          # 業務ルール（I/O なし）
│   │   │   ├── queries.ts        # 読み取り
│   │   │   ├── mutations.ts      # 書き込み
│   │   │   └── usecases/         # 1 操作 1 ファイル
│   │   │       ├── create-album.ts
│   │   │       └── rename-album.ts
│   │   └── photo/
│   │       └── …                 # album と同じ形
│   ├── db/
│   │   ├── client.ts             # createPrismaClient() と Db / DbClient 型
│   │   └── prisma-errors.ts      # isUniqueViolation() など Prisma の既知のエラーの判定
│   ├── interfaces/               # 外部サービスの抽象（Storage・JobQueue・SessionReader・Logger）
│   │   └── storage.ts
│   ├── adapters/                 # ランタイム・外部サービスの具象（R2、S3 …）
│   │   └── storage/r2-storage.ts
│   ├── auth/
│   │   └── current-user.ts       # CurrentUser 型（routes と domains の両方が使う）
│   ├── middlewares/
│   │   ├── require-auth.ts
│   │   └── error-handler.ts
│   ├── errors/
│   │   └── app-error.ts
│   ├── lib/
│   │   └── pagination.ts         # toCursorPage() など I/O を持たない共通処理
│   ├── config/
│   │   └── env.ts                # loadConfig(): 環境変数の Zod 検証
│   └── generated/prisma/         # Prisma の生成物（git に入れない）
└── test/
```

## 依存の向き

import は **`routes` → `domains` → `db`** の一方向にする。逆向きには import しない。

| 置き場所 | 書くこと | 書かないこと |
|---|---|---|
| `routes/` | 入力の検証（`zValidator`）→ domains の関数を呼ぶ → presenter で変換して `return c.json()` | 業務の判断、`try-catch`、Prisma、`new` |
| `presenters/` | domains の戻り値 → contracts のレスポンス型（`Date` → ISO 文字列） | I/O |
| `domains/` | 業務ルール、権限の判定、読み書き | Hono（`Context`・`c`）、環境変数、レスポンスの形 |
| `db/` | Prisma client の生成と型 | 業務ルール |
| `adapters/` | ランタイム・外部 SDK の具象 | 業務ルール |
| `deps.ts` | 具象を `new` して `Deps` を組み立てる | 条件分岐を伴うロジック |

- routes と domains は切り方の軸が違うので、別のディレクトリにする。リソースは URL の名詞で、API をどう見せるかで決まる。ドメインは業務のまとまりで、どのデータを誰が書き換えるかで決まる
- 両者がずれる endpoint は、URL のとおりに routes に置き、中で書き込む側のドメインの関数を呼ぶ。`POST /albums/:albumId/photos` は `routes/albums.ts` に置き、`photo` ドメインの `addPhoto` を呼ぶ
- domains は Hono を import しないので、cron（Workers の `scheduled`）やキューの consumer からも同じ関数を `deps` を渡して呼べる。それらの入口は `entry/` に置く
- **Prisma の生成物（`generated/prisma`）を import してよいのは `db/` と `domains/*/queries.ts`・`domains/*/mutations.ts` だけ**

## ドメインの中

ドメインのディレクトリには `index.ts`・`rules.ts`・`queries.ts`・`mutations.ts`・`usecases/` だけを置く。
関数をどのファイルに置くかは、**その関数が何に触るか**で決める。関数の大きさや「業務らしいか」では決めない。

| 触るもの | 置き場所 |
|---|---|
| DB も HTTP も外部サービスも使わない業務ルール | `rules.ts` |
| DB から読むだけ | `queries.ts` |
| DB に書くだけ | `mutations.ts` |
| それ以外（読んでから書く、ほかのドメインを呼ぶ、外部サービスを呼ぶ） | `usecases/<操作名>.ts` |

- **書き込みは、確かめることがなくても必ず usecase を通す**。タイトルを変えるだけの `renameAlbum` も、中で mutation を呼ぶだけの usecase にする。あとで確かめることが増えても置き場所が変わらない
- 読み取りだけのときは usecase を作らず、route が queries を直接呼ぶ
- usecase は 1 操作 1 ファイル。ファイル名は操作名の kebab-case（`create-album.ts` が `createAlbum` を export する）
- **同じドメインの usecase どうしは呼び合わない**。共通の手順は rules・queries・mutations に切り出す
- queries と mutations は DB だけに触る。同じドメインの `rules.ts` と、mutations から queries（`select` の定義）を import するのはよい
- queries の名前は、見つからないとき `null` を返すものを `find*`、`NotFoundError` を投げるものを `get*` にする
- 権限による絞り込みは queries の条件に含める（`getOwnedAlbum(db, ownerId, albumId)`）。他人のデータは「存在しない」として 404 にする
- ドメインの型は `queries.ts` の `select` から作り、`index.ts` から `export type` する

### 引数の形

- queries と mutations は第 1 引数に `db: DbClient` を取る
- usecase は第 1 引数に `deps: Pick<Deps, ...>` を取り、使う依存だけを `Pick` する。続けて「誰が（`currentUser`）」「何を（contracts の入力型）」の順に並べる
- 現在時刻が要る関数は `now: Date` を引数で受け取る。`new Date()` は route か entry で作る
- usecase の戻り値はドメインの型。contracts のレスポンス型への変換は route が presenter で行う
- 失敗は `AppError` のサブクラスを `throw` する。`null` や `{ ok: false }` を返さない（`find*` の `null` は「見つからない」という結果であって失敗ではない）

```typescript
// src/domains/album/rules.ts
export const canRename = (album: { ownerId: string }, currentUser: CurrentUser) =>
  album.ownerId === currentUser.id;
```

```typescript
// src/domains/album/queries.ts
export const albumSelect = {
  id: true,
  ownerId: true,
  title: true,
  description: true,
  createdAt: true,
} satisfies Prisma.AlbumSelect;

export type Album = Prisma.AlbumGetPayload<{ select: typeof albumSelect }>;

export const findAlbumByTitle = (db: DbClient, ownerId: string, title: string) =>
  db.album.findFirst({ where: { ownerId, title }, select: albumSelect });

export const getOwnedAlbum = async (db: DbClient, ownerId: string, albumId: string): Promise<Album> => {
  const album = await db.album.findFirst({ where: { id: albumId, ownerId }, select: albumSelect });

  if (!album) {
    throw new NotFoundError('ALBUM_NOT_FOUND', 'アルバムが見つかりません');
  }

  return album;
};
```

```typescript
// src/domains/album/mutations.ts
export const insertAlbum = async (db: DbClient, values: Prisma.AlbumUncheckedCreateInput): Promise<Album> => {
  try {
    return await db.album.create({ data: values, select: albumSelect });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('ALBUM_TITLE_TAKEN', '同じタイトルのアルバムが既にあります');
    }

    throw error;
  }
};
```

```typescript
// src/domains/album/usecases/create-album.ts
export const createAlbum = async (
  deps: Pick<Deps, 'db'>,
  currentUser: CurrentUser,
  input: CreateAlbumInput,
): Promise<Album> => {
  const duplicated = await findAlbumByTitle(deps.db, currentUser.id, input.title);

  if (duplicated) {
    throw new ConflictError('ALBUM_TITLE_TAKEN', '同じタイトルのアルバムが既にあります');
  }

  return insertAlbum(deps.db, {
    ownerId: currentUser.id,
    title: input.title,
    description: input.description ?? null,
  });
};
```

## ドメインどうし

- ドメインの外から import できるのは、そのドメインの **`index.ts` と `rules.ts` だけ**
- `index.ts` は queries と usecases（とドメインの型）だけを公開する。**mutations は公開しない**ので、テーブルに書き込めるのはそのテーブルを持つドメインだけになる。ほかのドメインのデータを変えたいときは、そのドメインの usecase を呼ぶ
- ドメインどうしの依存の向きは、**後からできるほうが先にあるほうに依存する**形に揃える。写真はアルバムがないと作れないので、`photo` が `album` に依存する。逆向きの import を足したくなったら、設計を見直してユーザーに確認する
- いくつものドメインに書き込む操作は、関わるドメインのうち依存の向きで最も下流のドメインに usecase を 1 つ置き、その usecase が手順を持って各ドメインの usecase を順に呼ぶ
- 子のデータをまとめて消すだけなら、外部キーの `onDelete: Cascade` に任せ、usecase を連鎖させない

```typescript
// src/domains/album/index.ts
export type { Album } from './queries';
export { findAlbumByTitle, getOwnedAlbum, listAlbums } from './queries';
export { createAlbum } from './usecases/create-album';
export { renameAlbum } from './usecases/rename-album';
```

```typescript
// src/domains/photo/usecases/add-photo.ts
import { getOwnedAlbum } from '../../album';
import { countPhotos } from '../queries';
import { insertPhoto } from '../mutations';
import { canAddPhoto } from '../rules';

export const addPhoto = async (
  deps: Pick<Deps, 'db'>,
  currentUser: CurrentUser,
  albumId: string,
  input: AddPhotoInput,
): Promise<Photo> => {
  const album = await getOwnedAlbum(deps.db, currentUser.id, albumId);
  const photoCount = await countPhotos(deps.db, album.id);

  if (!canAddPhoto(photoCount)) {
    throw new ConflictError('ALBUM_PHOTO_LIMIT_REACHED', 'このアルバムにはこれ以上写真を追加できません');
  }

  return insertPhoto(deps.db, { albumId: album.id, storageKey: input.storageKey });
};
```

### トランザクション

- いくつもの書き込みを 1 つのトランザクションにする usecase は、`deps.db.$transaction` を開き、中で呼ぶ関数には `tx` を渡す（usecase には `{ ...deps, db: tx }`）
- `Deps['db']` と queries・mutations の `db` は `DbClient`（`Prisma.TransactionClient`）型にする。トランザクションを開く usecase だけが `deps: { db: Db }`（`PrismaClient`）を要求する。こうすると、トランザクションの中でトランザクションを開くコードは型エラーになる

```typescript
// src/db/client.ts
export type Db = PrismaClient;
export type DbClient = Prisma.TransactionClient;
```

## 依存の注入 — `c.env.deps`

ランタイムごとの entry が設定と `Deps` を組み立て、`app.fetch(request, { config, deps })` の第 2 引数で渡す。
アプリ側は `c.env.config` と `c.env.deps` を読むだけなので、Workers でも Cloud Run でも同じコードが動く。

```typescript
// src/deps.ts
export type Deps = {
  db: DbClient;
  storage: Storage;
  sessionReader: SessionReader;
  logger: Logger;
};

export const buildDeps = (config: AppConfig, runtime: { db: Db; storage: Storage }): { db: Db } & Deps => ({
  db: runtime.db,
  storage: runtime.storage,
  sessionReader: createSessionReader(runtime.db, config.auth),
  logger: createJsonLogger(config.logLevel),
});
```

```typescript
// src/app-env.ts — 型だけを置く。app.ts・routes・middlewares はここから import type する
export type AppBindings = {
  config: AppConfig;
  deps: { db: Db } & Deps;
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

const buildWorkerDeps = (env: WorkerBindings) => {
  const config = loadConfig(env);
  const deps = buildDeps(config, {
    db: createPrismaClient(config.databaseUrl),
    storage: createR2Storage(env.PHOTOS_BUCKET),
  });

  return { config, deps };
};

export default {
  fetch: (request: Request, env: WorkerBindings, executionContext: ExecutionContext) => {
    const { config, deps } = buildWorkerDeps(env);

    return app.fetch(request, { config, deps }, executionContext);
  },
  scheduled: async (controller: ScheduledController, env: WorkerBindings) => {
    const { deps } = buildWorkerDeps(env);

    await purgeExpiredUploads(deps, new Date(controller.scheduledTime));
  },
};
```

```typescript
// src/entry/node.ts
const app = createApp();
const config = loadConfig(process.env);
const deps = buildDeps(config, {
  db: createPrismaClient(config.databaseUrl),
  storage: createS3Storage(config.storage),
});

serve({
  fetch: (request) => app.fetch(request, { config, deps }),
  port: config.port,
});
```

- `buildDeps` の第 2 引数（ランタイムごとに違う具象）は、必要なものがあるときだけ足す
- Workers ではリクエストごとに `buildDeps` を呼ぶ（Prisma client もリクエスト単位）
- Node（Cloud Run）では起動時に 1 回だけ呼ぶ
- モジュールのトップレベルで Prisma client や外部サービスの client を `new` しない

## ルーティング

- routes はリソース（URL の名詞）ごとに 1 ファイルにする。ドメインと 1 対 1 にしなくてよい
- routes が domains から import してよいのは `domains/<name>/index.ts` だけ
- `.get()` / `.post()` / `.use()` / `.route()` は**必ず method chaining で繋ぐ**。別の文にすると戻り値の型が捨てられ、`hc` の型推論が効かなくなる
- ハンドラは**ルート定義の中にインラインで書く**。別ファイルに `(c: Context) => ...` として切り出すと `c.req.valid()` の型が失われ、`as` が必要になる
- ハンドラ本体は「入力の取り出し → domains の関数を呼ぶ → presenter で変換して return」の 3 段落だけにする。それ以上になるなら業務の判断が混ざっているので、usecase に移す
- sub app ごとに型を export し、web 側も sub app 単位で `hc` を作る（全体の型を 1 つにすると tsserver が重くなる）

```typescript
// src/routes/albums.ts
export const albumRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)
  .get('/', zValidator('query', listAlbumsQuerySchema, validationHook), async (c) => {
    const query = c.req.valid('query');

    const page = await listAlbums(c.env.deps.db, c.var.currentUser.id, query);

    return c.json(toAlbumPageResponse(page), 200);
  })
  .post('/', zValidator('json', createAlbumInputSchema, validationHook), async (c) => {
    const input = c.req.valid('json');

    const album = await createAlbum(c.env.deps, c.var.currentUser, input);

    return c.json(toAlbumResponse(album), 201);
  })
  .post(
    '/:albumId/photos',
    zValidator('param', albumParamSchema, validationHook),
    zValidator('json', addPhotoInputSchema, validationHook),
    async (c) => {
      const { albumId } = c.req.valid('param');
      const input = c.req.valid('json');

      const photo = await addPhoto(c.env.deps, c.var.currentUser, albumId, input);

      return c.json(toPhotoResponse(photo), 201);
    },
  );

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

- better-auth のセッションを `c.env.deps.sessionReader` で読み、`c.set('currentUser', ...)` する `requireAuth` を作る
- `requireAuth` は `createMiddleware<{ Bindings: AppBindings; Variables: { currentUser: CurrentUser } }>` で型を付ける。chain に `.use('*', requireAuth)` を入れた sub app のハンドラでだけ `c.var.currentUser` が型付きで使える
- 配置は**認証が要る sub app ごとに、chain の先頭で `.use('*', requireAuth)`**。`routes/index.ts` には置かない（`/health` と `/auth` が常に public なため）
- 権限（「このアルバムの持ち主か」）の判定は domains で行う（`rules.ts` の判定か、queries の絞り込み）。ミドルウェアは「ログインしているか」だけ

## ページング

- 一覧は cursor 方式。並び順は `id` の降順（UUIDv7 は生成順に並ぶ）で、cursor は前のページの最後の `id`
- `limit` は既定 20、上限 100。contracts の `cursorPageQuerySchema` / `cursorPageSchema(itemSchema)` を使う
- 一覧の query（`listAlbums`）は `limit + 1` 件を読み、`lib/pagination.ts` の `toCursorPage(rows, limit)` で次のページの有無と `nextCursor` を出して返す

## Prisma

- generator と driver adapter（`@prisma/adapter-neon`）の設定は、Prisma 公式の Cloudflare Workers 手順に合わせる。Cloud Run に移っても同じ adapter で動く
- client は `db/client.ts` の `createPrismaClient(databaseUrl)` からだけ作る。呼んでよいのは `entry/` と `deps.ts`
- `select` は必要なカラムだけ取る。N+1 になる書き方（ループの中で `findUnique`）をしない
- 一意性は DB の unique 制約で保証する。usecase の事前チェック（`findAlbumByTitle`）は分かりやすいエラーを返すためのもので、競合の防止は制約に任せる
- モデルの決まりごと

| 項目 | 規則 |
|---|---|
| 主キー | `id String @id @default(uuid(7)) @db.Uuid` |
| 日時 | `createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)` と `updatedAt ... @updatedAt` を全テーブルに置く |
| 命名 | model は単数形 PascalCase、テーブルは `@@map("albums")` で複数形 snake_case、カラムは `@map` で snake_case |
| 持ち主 | テーブルごとに書き込んでよいドメインを 1 つに決める（`albums` は `album`、`photos` は `photo`） |
| 削除 | 物理削除。履歴が要件になったときだけ `deletedAt` を足す |
| 外部キー | `onDelete` を必ず明示する |
| 列挙 | Prisma の `enum` を使い、contracts の `z.enum` と値を揃える |

- マイグレーションはローカルで `prisma migrate dev`、CI / 本番で `prisma migrate deploy`。`prisma db push` は使わない
- 生成された SQL は PR で読む。破壊的変更（カラム削除・型変更）は「追加 → 移行 → 削除」の 2 回のリリースに分ける

## エラーハンドリング

- routes・rules・usecases に `try-catch` を書かない。例外は `app.onError(handleError)` で一括して HTTP レスポンスにする
- `try-catch` を書いてよいのは 2 箇所だけ。外部 API の失敗を翻訳する `adapters/` と、Prisma の既知のエラー（`P2002` 一意制約違反、`P2025` 対象なし）を `ConflictError` / `NotFoundError` に翻訳する `domains/*/mutations.ts`。それ以外の例外はそのまま投げる
- `AppError` は Hono を import しない（domains から使うため）。状態コードは自前の型で持つ
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
export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 422;

export class AppError extends Error {
  constructor(
    readonly status: ErrorStatus,
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

## lint で強制する決まり

`templates/dependency-cruiser.cjs` の `api-*` ルールが次を検査する。違反を見つけたら、エラーメッセージの指示どおりに import 先を直す。ルールを緩めて通さない。

| ルール | 検査すること |
|---|---|
| `api-prisma-stays-in-db-access` | Prisma の生成物を `db/` と queries・mutations の外で import しない |
| `api-db-from-domains-and-entry` | `db/` の値を import するのは domains・`entry/`・`deps.ts` だけ（型の import はどこからでもよい） |
| `api-adapters-from-entry-only` | `adapters/` の値を import するのは `entry/` と `deps.ts` だけ |
| `api-domains-have-no-http` | domains が Hono・routes・presenters・middlewares・entry・`app.ts`・`app-env.ts` を import しない |
| `api-routes-use-domain-index` | routes・middlewares・entry・presenters は domains を `index.ts` 経由で使う |
| `api-cross-domain-through-index-or-rules` | ほかのドメインは `index.ts` と `rules.ts` だけを import する |
| `api-domain-index-exports-queries-and-usecases` | ドメインの `index.ts` は queries と usecases だけを re-export する |
| `api-usecases-do-not-call-sibling-usecases` | 同じドメインの usecase どうしは import しない |
| `api-rules-have-no-io` | `rules.ts` は DB・外部サービス・同じドメインのほかのファイルを import しない |
| `api-queries-and-mutations-touch-db-only` | queries・mutations はほかのドメイン・usecases・外部サービスを import しない |
