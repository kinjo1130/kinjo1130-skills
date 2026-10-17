# TypeScript の書き方（全パッケージ共通）

## 型安全性

- 型の根拠は **`packages/contracts` の Zod スキーマ**。型は `z.infer` で作り、同じ形の `interface` / `type` を手書きしない
- `any` / `unknown` の握りつぶし / `as` / 非 null アサーション `!` は禁止
  - 許可するのは `as const` と `satisfies` だけ
  - 外部から来た値（JSON・FormData・環境変数・`localStorage`）は **Zod で parse して型を得る**。`as` で型を付けない
- `// @ts-ignore` / `// @ts-expect-error` は禁止。型エラーは型を直して解決する
- 関数の引数型を `Parameters<...>[0]` で逆算しない。スキーマから作った型を import する
- テストコードにも同じ規則を適用する。モックはインターフェースを満たすオブジェクトを書く（`as unknown as` 禁止）

```typescript
// 悪い例
const title = formData.get('title') as string;
const databaseUrl = process.env.DATABASE_URL!;

// 良い例
const input = createAlbumInputSchema.parse(Object.fromEntries(formData));
const config = loadConfig(process.env);
```

## tsconfig

`templates/tsconfig.base.json` をルートに置き、各パッケージはそれを `extends` する。
`strict` に加えて次を必ず有効にする。

- `noUncheckedIndexedAccess` — `array[0]` が `T | undefined` になる
- `exactOptionalPropertyTypes` — `?:` と `| undefined` を区別する
- `verbatimModuleSyntax` — 型の import は `import type` に限る

## 値の扱い

- 既定値は `??` で決める。`||` は「空文字や 0 も既定値に置き換えたい」場合だけ使い、その理由をコメントに書く
- 既定値の解決はレイヤー境界の 1 箇所で行う（API なら Repository → Service の変換、web なら `api/mappers/`）。コンポーネントの中で `?? ''` を散らさない
- optional chaining（`?.`）は 2 段まで。それより深いなら境界で正規化する
- オブジェクトのコピー・マージはスプレッド構文を使う（`Object.assign` は使わない）
- `null` と `undefined` を使い分ける
  - `null` — 「値がないこと」が確定している（DB の NULL、API レスポンス）
  - `undefined` — 省略された（optional な引数・フィールド）
- 任意の文字列入力は contracts で `trim` し、空文字は `undefined` に正規化する（`common.ts` の `optionalTextSchema` を使う）。DB には `null` で保存し、web で `''` に戻さない
- 日時は API と contracts では ISO 8601 文字列、API 内部では `Date` を使う。変換は Repository の境界で行う
- 画面に出す日時は web の `utils/format-date.ts` で `Asia/Tokyo` 固定の `Intl.DateTimeFormat` を使う（SSR とブラウザで表示がずれないようにするため）
- 金額は整数（円なら `priceYen: number`）。浮動小数で持たない

## 関数とモジュール

- export は **named export だけ**。`export default` はフレームワークが要求する場所（Workers のエントリ、設定ファイル）に限る
- 関数はアロー関数で書く（`export const findAlbum = async (...) => {}`）。class は Service / Repository / エラーに限る
- 1 ファイル 1 責務。`utils.ts` のような何でも入るファイルを作らない。`utils/` 配下は用途別のファイルに分ける
- 副作用（I/O）を持つ関数と純粋関数を分ける。純粋関数は引数だけで結果が決まるようにする
- barrel ファイル（`index.ts` で全部 re-export）は `packages/*` の公開 API とコンポーネントディレクトリにだけ置く

## ファイル名と識別子

| 対象 | 規則 | 例 |
|---|---|---|
| ファイル（下記以外すべて） | kebab-case | `album-service.ts`, `album-repository.ts`, `to-album-response.ts` |
| React コンポーネントのディレクトリとファイル | PascalCase | `AlbumCard/AlbumCard.tsx` |
| テスト | 対象と同じ名前 + `.test` | `album-service.test.ts` |
| TanStack Router のルートファイル | Router の規約に従う | `albums.$albumId.tsx`, `__root.tsx` |
| 関数・変数 | camelCase | `findAlbumById` |
| 型・クラス・コンポーネント | PascalCase | `AlbumService`, `AlbumCard` |
| Zod スキーマ | camelCase + `Schema` | `createAlbumInputSchema` |
| スキーマから作った型 | PascalCase | `CreateAlbumInput` |
| 定数（モジュールのトップレベル、不変） | UPPER_SNAKE_CASE | `MAX_ALBUM_TITLE_LENGTH` |
| 環境変数 | UPPER_SNAKE_CASE | `DATABASE_URL` |
| DB のテーブル / カラム | snake_case（Prisma で `@@map` / `@map`） | `albums`, `created_at` |
| API のパス | kebab-case の複数形 | `/albums/:albumId/photos` |
| 真偽値 | `is` / `has` / `can` / `should` で始める | `isPublished` |
| イベントハンドラ | props は `on` + 動詞、実装は `handle` + 動詞 | `onSubmit={handleSubmit}` |
