# 書式と読みやすさ

Biome は改行位置とインデントを直すが、**論理の切れ目に空行を入れることはしない**。
空行・分割・命名はコードを書く時点で決まる。以下の形で書く。

## 関数本体の形

関数本体は次の段落で構成し、段落の間に空行を 1 行入れる。

1. **入力の取り出し** — 引数・`c.req.valid()`・context からの取得
2. **検証と早期 return / throw** — 失敗する条件を先に処理する
3. **本処理** — 1 段落 = 1 つの目的
4. **返却** — `return` は直前の段落と空行で区切る

段落が 1 行しかない関数（3 行以下）は空行を入れなくてよい。

```typescript
// 良い例（AlbumService のメソッド）
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

  await this.activityLog.record({ type: 'album.created', albumId: album.id });

  return toAlbumResponse(album);
}
```

```typescript
// 悪い例 — 段落がなく、1 行に処理を詰めている。名前も省略している
async create(u: CurrentUser, i: CreateAlbumInput) {
  const e = await this.repo.findByTitle(u.id, i.title);
  if (e) throw new ConflictError('ALBUM_TITLE_TAKEN', 'dup');
  const a = await this.repo.create({ ownerId: u.id, title: i.title, description: i.description ?? null });
  await this.log.record({ type: 'album.created', albumId: a.id });
  return toAlbumResponse(a);
}
```

Biome で整形しても悪い例は悪い例のままです。空行と名前はフォーマッタでは直りません。

## 空行を入れる場所

| 場所 | 空行 |
|---|---|
| import 群の後 | 1 行 |
| トップレベル宣言（関数・型・定数）の間 | 1 行 |
| `if` / `for` / `switch` / `try` ブロックの前後 | 1 行（関数の先頭・末尾にある場合は不要） |
| `return` の前 | 1 行（`return` が段落の唯一の行なら不要） |
| 変数宣言のまとまりの後 | 1 行 |
| 連続する空行 | 禁止（最大 1 行） |

## 1 行に入れてよいもの

- **1 行 1 文**。`;` で文を連結しない
- `if` は必ず `{}` で囲み、本体を次の行に書く（`if (x) return;` の 1 行形式は禁止）
- 三項演算子はネスト禁止。分岐が 3 つ以上なら `if` / `switch` / オブジェクトのマップにする
- `&&` / `||` の連結は 1 式 2 つまで。3 つ以上は名前付きの変数に分ける
- メソッドチェーンが 3 段以上、または 100 文字を超えるなら 1 段 1 行にする
- オブジェクトリテラル・引数・JSX props は、要素が 3 つ以上なら 1 要素 1 行にする
- 行幅は 100 文字（Biome の `lineWidth: 100`）

```typescript
// 悪い例
const label = status === 'draft' ? '下書き' : status === 'published' ? '公開中' : '非公開';

// 良い例
const STATUS_LABEL = {
  draft: '下書き',
  published: '公開中',
  archived: '非公開',
} as const satisfies Record<AlbumStatus, string>;

const label = STATUS_LABEL[status];
```

## 大きさの上限

| 対象 | 上限 | 超えたら |
|---|---|---|
| 関数・コンポーネント本体 | 40 行 | 段落単位で名前付き関数に切り出す |
| ネストの深さ | 3 段 | 早期 return か関数抽出で浅くする |
| 1 ファイル | 250 行 | 責務ごとにファイルを分ける |
| 関数の引数 | 3 個 | オブジェクト引数 1 個にまとめる |

## 命名

- 省略形を使わない。`a` `e` `x` `tmp` `res` `data2` `cb` は禁止（`i` もループ以外では禁止）
- 配列は複数形（`albums`）、真偽値は `is` / `has` / `can` / `should` で始める
- 関数は動詞で始める（`findAlbum`, `toAlbumResponse`）。「何をするか」が名前で分かること
- 同じ概念には同じ単語を使う。`album` と `collection` を混ぜない
- 単位を持つ数値は単位を名前に含める（`timeoutMs`, `priceYen`, `sizeBytes`）

## JSX

- 条件分岐が 2 つ以上ある表示は、JSX の中で三項演算子を重ねず、早期 return か変数にする
- `.map()` の中身が 5 行を超えたらコンポーネントに切り出す
- props が 3 つ以上なら 1 prop 1 行

```tsx
// 良い例
export const AlbumList = ({ albums }: AlbumListProps) => {
  if (albums.length === 0) {
    return <EmptyState message="アルバムはまだありません" />;
  }

  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {albums.map((album) => (
        <AlbumCard
          key={album.id}
          album={album}
        />
      ))}
    </ul>
  );
};
```

## コメント

- コードを読めば分かる「何をしているか」は書かない。**なぜそうしたか**だけを書く
- 段落の区切りを空行の代わりにコメントで示さない（`// --- 取得 ---` は禁止）
- TODO を残すときは issue 番号を付ける（`// TODO(#123): ...`）

## 計画書・回答に書くコードにも適用する

実装計画やレビューコメントに載せるコード例も、このファイルの形で書く。
「例だから」と詰めて書くと、その例がそのまま実装に写される。
