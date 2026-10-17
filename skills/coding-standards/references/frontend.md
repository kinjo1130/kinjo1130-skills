# フロントエンド（apps/web — TanStack Start）

## ディレクトリ構成

```
apps/web/src/
├── routes/                         # ファイルベースのルート（最上層・最も薄い）
│   ├── __root.tsx
│   ├── index.tsx
│   └── albums/
│       ├── index.tsx
│       └── $albumId.tsx
├── router.tsx                      # createRouter(): QueryClient を router context に載せる
├── api/                            # API 通信層（最下層）
│   ├── client.ts                   #   sub app ごとの hc クライアント
│   ├── api-error.ts                #   エラーレスポンス → ApiError
│   ├── endpoints/                  #   ドメインごとの API 関数
│   │   └── album-api.ts
│   └── mappers/                    #   レスポンス → 画面用の型（既定値の解決はここだけ）
│       └── album-mapper.ts
├── hooks/
│   └── album/
│       ├── queries/                #   読み取り: queryOptions と useXxx
│       │   ├── album-queries.ts
│       │   └── use-album-list.ts
│       └── mutations/              #   書き込み: useMutation のラッパー
│           └── use-create-album.ts
├── components/
│   ├── ui/                         #   汎用部品（Props だけで描画する）
│   │   └── Button/
│   ├── domain/                     #   ドメインの表示（Presentational）
│   │   └── AlbumCard/
│   └── container/                  #   hooks を呼び、domain / ui に渡す
│       └── AlbumListContainer/
├── providers/                      # Context Provider（認証・テーマ）
├── types/                          # 画面専用の型（contracts にないもの）
├── constants/
├── utils/                          # 純粋関数（cn() など）
└── config/
    └── env.ts                      # 公開してよい環境変数の Zod 検証
```

## レイヤー間の import

依存は上から下への一方通行。違反は dependency-cruiser が CI で落とす。

```
routes    → container, providers, hooks/*/queries（loader 用の queryOptions）
container → hooks, domain, ui, providers, types, constants, utils
domain    → ui, types, constants, utils               （hooks・api は禁止）
ui        → types, constants, utils                   （それ以外は禁止）
hooks     → api/endpoints, api/api-error, providers, types, constants, utils （components は禁止）
api/endpoints → api/client, api/mappers, api/api-error
api/mappers   → types, constants, utils
```

- `@<product>/contracts` はどの層から import してもよい（スキーマと型しか持たないため）
- TanStack Router の `Link` はどの層で使ってもよい。`useNavigate` / `Route.useSearch()` などルーターの状態を読み書きする hook は routes と container だけで使う
- hooks は `ApiError` を画面向けのエラー型に変換してから返す。container は `api/` を import しない

## ルート（`routes/`）

- 書いてよいのは **loader・`validateSearch`・`errorComponent` / `notFoundComponent`・Container の配置** だけ
- データは loader で `ensureQueryData` して SSR に載せ、Container 側は同じ queryOptions を `useSuspenseQuery` で読む
- URL の検索パラメータ（絞り込み・ページ）は `validateSearch` に contracts か `types/` の Zod スキーマを渡して型を付ける
- `createServerFn` にビジネスロジックや DB アクセスを書かない。データの読み書きは必ず `apps/api` を通す

```tsx
// src/routes/albums/index.tsx
export const Route = createFileRoute('/albums/')({
  validateSearch: albumListSearchSchema,
  loaderDeps: ({ search }) => ({ cursor: search.cursor }),
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(albumListQuery(deps));
  },
  errorComponent: RouteErrorView,
  component: AlbumsPage,
});

const AlbumsPage = () => {
  const search = Route.useSearch();

  return <AlbumListContainer cursor={search.cursor} />;
};
```

## API 層（`api/`）

- HTTP クライアントは `hono/client` の `hc` だけを使う。`fetch` / axios を直接呼ばない
- `client.ts` で sub app ごとにクライアントを作る（`hc<AlbumRoutes>(...)`）。型は `import type` で `@<product>/api` から取る
- SSR のときはサーバー側で受け取った Cookie を API に転送する（`createIsomorphicFn` で、サーバー用とブラウザ用の取得方法を分ける）
- `endpoints/` の関数は「hc 呼び出し → `res.ok` でなければ `ApiError` を throw → mapper を通して返す」の形に固定する

```typescript
// src/api/endpoints/album-api.ts
export const albumApi = {
  list: async (query: ListAlbumsQuery): Promise<AlbumListPage> => {
    const response = await albumClient.index.$get({ query });

    if (!response.ok) {
      throw await toApiError(response);
    }

    const body = await response.json();

    return toAlbumListPage(body);
  },
};
```

- `ApiError` は contracts の `errorResponseSchema` で parse した `code` を持つ。画面は `code` で分岐する

## hooks

- `queries/` と `mutations/` を同じファイルに混ぜない
- queryOptions（キーと取得関数）は `album-queries.ts` に集め、loader と hook の両方がそれを使う
- query key は `albumKeys` のようなキーファクトリから作る。配列リテラルを直接書かない
- mutation 成功時の `invalidateQueries` は、キーファクトリのキーで行う
- hooks で UI の状態（モーダルの開閉など）を持たない。それは Container の `useState`

```typescript
// src/hooks/album/queries/album-queries.ts
export const albumKeys = {
  all: ['albums'] as const,
  list: (query: ListAlbumsQuery) => [...albumKeys.all, 'list', query] as const,
  detail: (albumId: string) => [...albumKeys.all, 'detail', albumId] as const,
};

export const albumListQuery = (query: ListAlbumsQuery) =>
  queryOptions({
    queryKey: albumKeys.list(query),
    queryFn: () => albumApi.list(query),
  });
```

## コンポーネントの 3 層

```
hooks を呼ぶ？                     → Container（テスト必須・Storybook 不要）
ドメインのデータを Props で受け取る？ → Domain（テスト必須）
どちらでもない汎用部品？             → UI（テスト + Storybook 必須）
```

- 1 コンポーネント = 1 ディレクトリ。`AlbumCard/AlbumCard.tsx` + `AlbumCard.test.tsx`（+ UI は `AlbumCard.stories.tsx`）+ `index.ts`（re-export だけ）
- テストは同じディレクトリに置く（`__tests__/` を作らない）
- Props の型は `type XxxProps = { ... }` としてコンポーネントの直前に書く

## フォーム

- react-hook-form + `zodResolver(contracts のスキーマ)` を使う。`FormData` を手で読まない
- `useForm` は **Container で呼び**、Domain のフォームには `form`（`UseFormReturn<CreateAlbumInput>`）と `onSubmit` を props で渡す。Domain は描画だけをする
- 送信は Container で `form.handleSubmit` → `mutation.mutate(input, { onSuccess, onError })` の形にする
  - 成功したら `onSuccess` の中で `form.reset()`
  - サーバーの `VALIDATION_ERROR` は `onError` の中で `details` を `form.setError` に戻す（`useEffect` で props の変化を見張らない）

```tsx
// src/components/container/CreateAlbumFormContainer/CreateAlbumFormContainer.tsx
export const CreateAlbumFormContainer = () => {
  const form = useForm<CreateAlbumInput>({
    resolver: zodResolver(createAlbumInputSchema),
    defaultValues: { title: '', description: undefined },
  });
  const { createAlbum, isCreating } = useCreateAlbum();

  const handleSubmit = form.handleSubmit((input) => {
    createAlbum(input, {
      onSuccess: () => form.reset(),
      onError: (error) => applyFieldErrors(form, error),
    });
  });

  return (
    <CreateAlbumForm
      form={form}
      isSubmitting={isCreating}
      onSubmit={handleSubmit}
    />
  );
};
```

## 状態管理

| データ | 置き場所 |
|---|---|
| サーバーのデータ | TanStack Query（`useState` + `useEffect` + `fetch` で取らない） |
| URL で共有したい状態（絞り込み・ページ・タブ） | 検索パラメータ（`validateSearch`）。一覧のページ送りは `?cursor=` を持つ「次へ」リンクにする |
| アプリ全体の設定（認証・テーマ） | Context（`providers/`） |
| 画面内の一時的な UI 状態 | Container の `useState` / `useReducer` |

サーバーのデータを Context に入れない。

## useEffect

使ってよいのは次の 3 つだけ。使うときは「なぜ Effect が要るか」をコメントに書く。

1. ブラウザ API との同期（`addEventListener`、`IntersectionObserver` など）
2. サードパーティライブラリの初期化と後片付け
3. `ref` 経由の DOM 操作

派生値の計算、props の変化への反応、データ取得には使わない。

## エラー表示

- 画面単位のエラーはルートの `errorComponent`、存在しないデータは `notFoundComponent`（loader で `notFound()` を throw）
- mutation のエラーはそのフォームの中で表示する
- コンポーネントと hooks の中で `try-catch` しない

## スタイル

- Tailwind CSS v4 のユーティリティクラスで書く。`style` 属性とコンポーネントごとの CSS ファイルは作らない
- 色・余白・角丸などのトークンは CSS の `@theme` に定義し、任意値（`text-[#3b82f6]`）を使わない
- クラスの結合は `utils/cn.ts`（clsx + tailwind-merge）を使う
- 複数箇所で使う文字列（列挙値の表示名など）と数値の閾値は `constants/` に置く
