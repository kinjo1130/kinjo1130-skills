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
| `apps/api` の `domains/*/rules.ts` | ユニット | 純粋関数として入力と出力を比べる |
| `apps/api` の `domains/*/usecases/` | 統合 | テスト用の PostgreSQL（ローカルの docker の DB-test ポートか Neon の branch）に対して実行する。外部サービス（`Storage` など）は `interfaces/` どおりの fake を `deps` に入れる |
| `apps/api` の `domains/*/queries.ts`・`mutations.ts` | 統合 | usecase のテストで通す。複雑な絞り込みと Prisma のエラー翻訳は単独でもテストする |
| `apps/api` のルート | 統合 | `createApp()` を作り、テスト用の DB と fake を入れた `deps` を `app.request(path, init, { config, deps })` で渡して叩く |
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
- 時刻は関数の引数 `now` で渡し、テストでは固定の `Date` を渡す。乱数や外部の ID 生成が要るときは `deps` に入れて差し替える
- スナップショットテストは使わない。見た目は Storybook、振る舞いはアサーションで確かめる
- テストデータは `test/factories/` のファクトリ関数で作る。値だけ要るなら `buildAlbum({ title: '沖縄旅行' })`、DB に入れるなら `seedAlbum(testDb, { title: '沖縄旅行' })`
- テストのための書き込みにドメインの mutations や、テスト対象と別の usecase を使わない。`seed*` が Prisma で直接入れる
- DB を使うテストは、各テストの前に `test/db.ts` の `resetDatabase(testDb)` で全テーブルを空にする

```typescript
// src/domains/album/usecases/create-album.test.ts
it('同じタイトルが既にあるとき ConflictError を投げる', async () => {
  const currentUser = await seedUser(testDb);
  await seedAlbum(testDb, { ownerId: currentUser.id, title: '沖縄旅行' });

  const creating = createAlbum({ db: testDb }, currentUser, { title: '沖縄旅行' });

  await expect(creating).rejects.toThrow(ConflictError);
});
```

## 置き場所

- テストファイルは対象と同じディレクトリに `*.test.ts(x)` として置く
- 複数のテストで使うファクトリ・fake は各 app の `test/` に置く
- E2E は `apps/web/e2e/` に置く
