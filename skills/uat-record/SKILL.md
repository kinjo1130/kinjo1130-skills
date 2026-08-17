---
name: uat-record
description: >-
  uat-checklist skill が生成したチェックリストを、ローカル起動済みのアプリ上で
  Playwright MCP により消化する。5 値判定 (pass/fail/blocked/skipped/REVIEW) +
  操作動画 (カーソル可視化・0.5 倍速 condense) + スクショ + report.md を残す。
  「UAT を実行して」「チェックリストを消化して」と言われた時に使用する。
argument-hint: "[--checklist <path>] [--out <dir>] [--comment <PR番号>]"
---

# UAT Record Skill

## Purpose

[uat-checklist](../uat-checklist/SKILL.md) が生成した **1 PR / 1 ブランチ分**のチェックリストを、ローカル起動済みのアプリ上で **Playwright MCP** により消化する。各項目に 5 値判定を付け、操作動画・スクショを残し、`report.md` を生成する。

実装直後 (コンテキストが最も新鮮な時点) に PR 単位で検証することで、fail の帰属が自明になり、基準ブランチに入る前にバグを検知する。

スクリプトを書いて実行する方式は使わない: MCP ならアクセシビリティスナップショットを見ながら 1 操作ずつ進められ、セレクタ間違いによる「台本修正 → 再実行」の往復が発生しない。動画も `browser_start_video` / `browser_stop_video` で撮れる。録画にはカーソル可視化 (大きな赤丸 + クリック波紋。同梱の [scripts/cursor-overlay.js](scripts/cursor-overlay.js) を `--init-script` で注入) が乗るため、どこを押したかが動画で追える。

## 責務範囲(厳守)

- **このスキルが行うこと**: checklist の消化 (Playwright MCP 操作 → 判定 → 録画 → スクショ) → report.md 生成 → (`--comment` 時) PR コメント投稿
- **このスキルが行わないこと**: チェックリスト項目の新規発案 (uat-checklist の責務。checklist に無い観点を勝手に追加しない) / バグの修正 / 生成系 LLM 出力の品質評価 / 複数 PR の集計

## セットアップ(初回のみ)

プロジェクトの `.mcp.json` に Playwright MCP を以下の形で設定する:

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@playwright/mcp@latest",
        "--caps=devtools",
        "--isolated",
        "--headless",
        "--viewport-size=1920x1080",
        "--output-dir=.dev/uat/mcp-output",
        "--init-script=scripts/uat-cursor-overlay.js"
      ]
    }
  }
}
```

- `--caps=devtools`: `browser_start_video` / `browser_stop_video` / `browser_video_chapter` を有効化する (必須)
- `--init-script`: このスキル同梱の [scripts/cursor-overlay.js](scripts/cursor-overlay.js) をプロジェクト内 (例: `scripts/uat-cursor-overlay.js`) にコピーして指定する。擬似カーソル + クリック波紋 + 項目ラベルバナー (`window.__uatLabel`) が全ページに注入される
- 動画の後処理 (同梱 [scripts/condense-video.sh](scripts/condense-video.sh)) に `ffmpeg` (libvpx-vp9 / libx264 対応ビルド) が必要

## 引数仕様

```
/uat-record [--checklist <path>] [--out <dir>] [--comment <PR番号>]
```

### `--checklist <path>`(任意)

- **デフォルト**: `.dev/uat/branch-<現在のブランチ名の / を - に置換>/checklist.md`
- ファイルが無い・空・テーブルも「確認項目なし」も含まない場合は即時 throw (先に uat-checklist を実行させる)
- checklist が「確認項目なし」の場合は消化せず、その旨の report を生成して正常終了する

### `--out <dir>`(任意)

- **デフォルト**: checklist と同じディレクトリ
- 出力構成 (固定):
  - `report.md` — 判定レポート (固定名)
  - `videos/<項目ID>-<内容の短い言葉>.webm` — 項目ごとの操作動画 (ローカル保持、コミットしない)。複数項目を 1 本にまとめた場合は `C-04〜08-判定・リネーム.webm` のようにファイル名だけで何の検証か分かるようにする。condense スクリプトが PR 添付用の同名 `.mp4` を並置する
  - `screenshots/<項目ID>-*.png` — スクショ
- `report.md` が既存なら**上書きしてよい** (修正 → 再消化が正規フロー)

### `--comment <PR番号>`(任意)

report.md をマーカー `<!-- uat-report v1 -->` 付きで PR コメントに冪等投稿する (既存マーカーコメントがあれば `gh api -X PATCH`、無ければ `gh pr comment`)。動画のインライン添付は GitHub がブラウザセッション専用にしていて CLI/API から不可能なので、代替手段を考案せず、投稿後にユーザーへ「`videos/` の `.mp4` を PR コメント欄にドラッグ&ドロップしてください」と絶対パス付きで依頼する。

## 実行環境の前提(Step 1 で検証する)

ローカル前提。以下が満たされていなければ、**満たすための手順を提示して throw** (ユーザーが起動してから再実行する):

1. アプリが依存するローカルサービス (DB 等) が起動している
2. テスト用データ (seed) が投入済みで、テスト用アカウントでログインできる
3. アプリがローカル URL で応答する (実 HTTP GET が 200/3xx を返すこと。プロセス存在確認では不十分)
4. Playwright MCP サーバーが接続されている (`browser_navigate` 等のツールが生えているか)。未接続なら再起動 + `.mcp.json` 承認を案内して throw — スクリプト方式にフォールバックしない

## 判定の定義(厳守)

| 判定 | 意味 |
|---|---|
| pass | 確認できて、期待どおりだった |
| fail | 期待どおりでなかった。バグの疑い |
| blocked | 環境の都合で確認できなかった (外部送信リスク yes、必要データを投入できない等) |
| skipped | ブラウザで確認する性質の項目ではない、または期待結果が「不明」 |
| REVIEW | 機械判定できない (デザインのズレ・アニメーションの滑らかさ等)。判定せずスクショ + 動画を添えて人間に回す |

- **期待結果が「不明」の項目は推測せず skipped にする。** 勝手に合格基準を作らない。画面は開いてスクショだけ残す
- **外部送信リスク = yes の項目は原則 blocked** (メール / SMS / 決済 / 外部 LLM の呼び出し)。この規則は他のすべての判定規則より優先する。ローカル DB は使い捨てなので削除・破壊系操作は実行してよい。例外は 2 つ: (1) 実効 provider が mock で外部送信が実際に起きないと環境設定で確認できた場合、(2) ユーザーが実行を明示許可した場合 (対象項目 ID と実行回数を提示して一括で取り、report に許可内容を記す)
- 曖昧さを pass に丸めない。迷ったら REVIEW。ただし優先順位がある: **機械的に確認できる期待結果が満たされていなければ常に fail** (主観的な部分が残っていても fail を REVIEW に弱めない)
- **checklist の期待結果と実装の設計意図が食い違ったら REVIEW**。「checklist が過剰要求」か「実装漏れ」かは判定側で決めず、両方の根拠を書いて人間に回す
- **状態を変える項目 (削除・作成・更新) の後続項目は前項目の副作用に注意する。** 削除系項目の後に同一データを参照する項目がある場合、実行前にデータを再投入するか、独立したデータで検証する

## 手順

### Step 1: 前提確認

「実行環境の前提」1〜4 を検証し、欠けていれば手順提示 + throw。`--comment` 指定時は `gh` CLI 認証も確認。

### Step 2: checklist パース + 旧成果物の掃除

テーブル行 (ID / 対象画面 / 操作 / 期待結果 / 優先度 / 外部送信リスク / 由来PR) を読み取る。「確認項目なし」なら消化せず Step 4 の report (確認項目なし版) へ。

消化を始める**前に** `--out` 配下の `videos/` `screenshots/` から前回実行の成果物を削除する。削除対象はこの 2 ディレクトリ配下のみ。ただし**同一 checklist の再消化 (fail 修正後など) では、完了済み項目の成果物を残して未完了・再検証項目だけ撮り直してよい** (report は全項目分を再生成する)。

### Step 3: 消化(P0 → P1 → P2 → P3 の順で全項目)

Playwright MCP のツール (`browser_navigate` / `browser_snapshot` / `browser_click` / `browser_fill_form` 等) で操作する。ブラウザ操作の自動化スクリプトは書かない (データ投入 SQL や既存 script の利用は可)。冒頭で一度ログインすればセッションは項目間で持続する。

**MCP 操作の実践 Tips**:

- **`browser_snapshot` は情報量の多い画面で数十万文字になる**。全量スナップショットを取らず、(a) 要素の場所を知りたいだけなら `browser_find` (text / regex)、(b) 大きい結果はファイル保存されるので `grep` で要点だけ抽出、(c) ダイアログ内だけ見たいなら `browser_snapshot` に `target: <dialogのref>` を渡す
- **判定の裏取りは UI + DB の両面で**。「リロード後も維持」「複製された」系は画面確認に加えて DB で該当行を引くと根拠が 1 行で書けて確実。ただし**権限・認可の判定根拠に管理者接続の SQL は使えない** — 認可系は対象ユーザーでの UI/API 応答を根拠にし、SQL はデータ投入・存在確認専用
- **セレクタ文字列 `text=...` は曖昧一致で strict violation になりやすい** (ラベルバナー `#__uat-label` の文言とも衝突する)。`ref` か `role=button[name="..."]` を優先する
- **dev overlay (Next.js の `<nextjs-portal>` 等) がクリックを遮ることがある**。click が「subtree intercepts pointer events」で timeout したら、まず overlay の中身 (runtime error か否か) と console error を確認する — 実装エラーなら fail の証拠。エラーでないと分かった場合のみ `browser_evaluate` で除去して再クリック
- **一時状態の UI (処理中バナー・進捗表示等) は後から取り直せない**。トリガー直後のスナップショット / スクショが唯一の証拠なので、待機に入る前に必ず記録する
- 画面表示の成否は URL・タイトルだけで判定しない。**期待するページ固有の要素 (見出し・主要ボタン) を 1 つ確認する** (404 / error boundary は URL が変わらないまま表示されることがある)

消化の単位は**録画グループ** (同一画面・同一文脈の連続 3〜4 項目を 1 本にまとめる。単独項目なら 1 項目 = 1 グループ):

1. **グループ開始**: `browser_start_video` (filename にグループの項目 ID 群、`size` は viewport と同値を指定 — 省略すると縮小解像度で録画され文字が潰れる)
2. **項目ごとに繰り返し**: (a) `browser_video_chapter` で項目 ID の章を打つ (グループが複数項目の場合) → (b) `browser_evaluate` で `window.__uatLabel('<項目ID>: <操作の要約>')` を呼び画面上部バナーを更新 (ページ遷移しても持続) → (c) 対象画面へ遷移して checklist の操作を実行し、期待結果をスナップショット上の要素・テキスト・URL で確認 → (d) `browser_take_screenshot` で判定根拠のスクショ → (e) 5 値を確定し根拠を 1 行記録
3. **グループ終了**: `browser_stop_video` で録画終了 (項目が fail してもグループの残り項目を消化してから閉じる)。成果物を `--out` 配下へ配置し、同梱の `scripts/condense-video.sh <動画パス>` で静止区間を除去する (録画は LLM の思考待ち = 無変化時間が大半のため)。condense 後の動画は既定で **0.5 倍速** (間引き後は操作フレームだけが連続し等速だと目で追えないため)。等速にしたい場合のみ `--speed 1.0` を先頭引数に付ける。**condense は元動画を上書きし**、PR 添付用の同名 `.mp4` を並置する。REVIEW にする項目のスクショは、ラベルバナーが対象 UI を覆わないよう `window.__uatLabel(null)` で消してから撮る
4. **データ投入**: 項目に必要な seed が不足していれば、その場で SQL 等で投入してよい。投入した内容は report.md の該当項目に 1 行記録。**投入は録画開始前に済ませる** (投入操作まで録画に入れない)
5. 1 項目の操作 timeout は 120 秒。超えたら blocked (理由: timeout) にして次へ進む

**検証後の後始末**: UAT のためにいじった状態 (機能トグルの変更、レコードの書き換え等) は検証が済んだら元に戻し、report にその旨を書く。戻し忘れは次の UAT や開発中の画面確認を汚染する。

LLM を使う生成系画面は、P0 でない限り「生成を開始できること」までで pass とする (完走待ち・品質評価はしない)。生成ジョブの進行監視は画面ポーリングよりジョブテーブルの status を DB で直接引くほうが速く確実。完走を待つ間は他項目を先に消化してよい。

### Step 4: report.md 生成

「出力形式」を厳守。完了後、最終応答の末尾に `OUTPUT: <report.md の絶対パス>` を置く。

### Step 5: PR コメント投稿(`--comment` 時のみ)

マーカー `<!-- uat-report v1 -->` で冪等投稿する。

## 出力形式(report.md)

```md
<!-- uat-report v1 -->

## UAT レポート: <ブランチ名 or #PR番号>

**pass N / fail N / blocked N / skipped N / REVIEW N**(全 M 項目)

成果物: `<--out の絶対パス>`(videos/ screenshots/)

### 要対応(fail / blocked / REVIEW)

| ID | 対象画面 | 判定 | 根拠 | 動画 / スクショ |
|---|---|---|---|---|
| C-12-02 | /projects/[id]/edit | fail | 保存ボタン押下後にエラートースト表示、一覧に反映されず | videos/C-12-02-判定変更と保存.webm |

### pass / skipped(詳細)

<details><summary>展開</summary>

| ID | 対象画面 | 判定 | 根拠 | 動画 / スクショ |
|---|---|---|---|---|
| C-10-01 | /projects | pass | フィルタ選択で一覧が絞り込まれることを確認 | videos/C-10-01-一覧フィルタ.webm |

</details>

### 動画と項目の対応

| 動画 | 収録項目 |
|---|---|
| videos/C-04〜08-判定・リネーム.webm | 04, 05, 06, 07, 08(章マーカー付き) |
```

- 要対応 (fail / blocked / REVIEW) を**必ず上**、pass / skipped は折りたたみ
- 各項目に判定・根拠 1 行・動画/スクショの相対パス。データ投入した項目はその旨も記載
- サマリ行の件数と明細の行数は一致させる (消化漏れをサイレントに落とさない)
- 複数項目を 1 本の録画にまとめた場合は「動画と項目の対応」表を必ず付ける
- 「確認項目なし」の checklist に対しては、サマリの代わりに `**確認項目なし**(checklist の理由をそのまま転記)` の 1 行

## fail-fast チェックリスト

| 条件 | 挙動 |
|---|---|
| checklist が無い / 空 / 契約フォーマット外 | throw (先に uat-checklist を実行させる) |
| 実行環境の前提 1〜4 が欠ける | 手順提示 + throw |
| Playwright MCP ツールが生えていない | 手順提示 (再起動 + `.mcp.json` 承認) + throw。スクリプト方式にフォールバックしない |
| `--comment` 時に gh CLI 未認証 | throw |
| 項目の操作が 120 秒超 | その項目を blocked にして続行 |
| 動画の condense が失敗 (ffmpeg 不在等) | 元動画をそのまま残して続行 (判定には影響させない) |
| 判定不能な曖昧項目 | REVIEW にする (pass に丸めない) |

## uat-checklist との棲み分け

| スキル | 責務 |
|---|---|
| [uat-checklist](../uat-checklist/SKILL.md) | 何を確認すべきかの列挙 (checklist 生成) |
| **uat-record**(本スキル) | checklist の Playwright MCP 消化 + 判定 + 動画・スクショ |
