# テスト

## 進め方

- TDD で進める。テストを先に書いて落ちることを確かめ、それから実装する
- 条件分岐のある処理は、実装の前にデシジョンテーブルを書き、行ごとにテストを 1 つ作る
- テスト名は「条件 → 期待結果」を日本語で書く（`it('同じタイトルが既にあるとき ConflictError を投げる')`）

```markdown
| 認証 | タイトル重複 | 入力 | 期待結果 |
|---|---|---|---|
| なし | - | - | 401 UNAUTHORIZED |
| あり | なし | 正常 | 201 + アルバム |
| あり | あり | 正常 | 409 ALBUM_TITLE_TAKEN |
| あり | - | タイトル空 | 400 VALIDATION_ERROR |
```

## 対象と優先度

| 対象 | 種類 | 方法 |
|---|---|---|
| `apps/api` の Service | ユニット | Repository・外部サービスをインターフェースどおりのモックにする |
| `apps/api` のルート | 統合 | `createApp()` に fake の services を渡し、`app.request(path, init, { services })` で叩く |
| `apps/api` の Repository | 統合 | 実 PostgreSQL（ローカルの docker か Neon の branch）に対して実行する |
| `apps/web` の `api/mappers` | ユニット | 純粋関数として入力と出力を比べる |
| `apps/web` の hooks | ユニット | MSW で API を差し替え、`renderHook` で確かめる |
| `apps/web` の Container | 統合 | MSW + Testing Library。ユーザーの操作（クリック・入力）で確かめる |
| `apps/web` の Domain / UI | コンポーネント | Testing Library。UI は Storybook の story も必須 |
| 主要な画面遷移 | E2E | Playwright。ログイン → 作成 → 一覧表示のような主経路だけ |

## 書き方

- 1 テスト 1 つの振る舞い。Arrange / Act / Assert を空行で区切る
- モックはインターフェースを満たすオブジェクトとして書く。メソッドの中身に `vi.fn()` を使うのはよい。`as unknown as`、`vi.mock` でのモジュール丸ごとの差し替えはしない（依存は注入で差し替える）
- 中身が要らない fake のメソッドは `() => undefined` のように値を返す形で書く（空ブロック `{}` は Biome が指摘する）
- `test/` のヘルパーは `loadConfig(process.env)` で設定を読んでよい（「`process.env` は entry と config だけ」の例外）
- 時刻・乱数・ID はテストで固定できるように注入する（`clock`、`idGenerator`）
- スナップショットテストは使わない。見た目は Storybook、振る舞いはアサーションで確かめる
- テストデータは `test/factories/` のファクトリ関数（`buildAlbum({ title: '沖縄旅行' })`）で作る

```typescript
// src/services/album-service.test.ts
it('同じタイトルが既にあるとき ConflictError を投げる', async () => {
  const albumRepository = createFakeAlbumRepository([buildAlbum({ title: '沖縄旅行' })]);
  const albumService = new AlbumService(albumRepository, createFakeStorage());

  const creating = albumService.create(buildCurrentUser(), { title: '沖縄旅行' });

  await expect(creating).rejects.toThrow(ConflictError);
});
```

## 置き場所

- テストファイルは対象と同じディレクトリに `*.test.ts(x)` として置く
- 複数のテストで使うファクトリ・fake は各 app の `test/` に置く
- E2E は `apps/web/e2e/` に置く
