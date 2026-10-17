---
name: e2e-verify
description: >-
  Playwright MCPを使ってブラウザベースのE2E検証を行う。
  ユーザーが「E2Eで確認して」「ブラウザで動作確認して」「smoke testして」「画面確認して」と言った時に使用する。
argument-hint: "[--env local|staging|production] [--url <URL>] [smoke-test | login | <シナリオ名> | <確認したい内容>]"
---

# E2E検証手順書

Playwright MCPを使い、実際のブラウザでアプリケーションの動作を検証する。
アクセシビリティスナップショットを取得してページの状態を確認し、要素のref番号を使って操作する。

## 前提条件

- Playwright MCP サーバーが設定されていること（`.mcp.json` に `playwright` が含まれること）

## 手順0: 設定の読み込みと環境の判定

### 0-1. 設定ファイルの確認

プロジェクトルートの `.claude/e2e-verify.yml` を探す。

- **設定ファイルが存在する場合** → 設定駆動モードで実行（手順0-2へ）
- **設定ファイルが存在しない場合** → 自動探索モードで実行（手順0-3へ）

### 0-2. 設定駆動モード

設定ファイル（`.claude/e2e-verify.yml`）を読み込み、以下を取得する:

- `environments`: 環境ごとのURL・dev serverコマンド・備考
- `auth.roles`: ロールごとのログインURL・認証情報・成功判定条件
- `scenarios`: テストシナリオ定義（ページパス・期待内容）

引数の `--env` で環境を選択する。未指定の場合は `local` を使用する。
選択した環境のURLを `{BASE_URL}` とする。

**環境ごとの注意事項**:
- `local`: dev serverが起動していない場合、設定ファイルの `dev_server.commands` をユーザーに案内して終了する
- `production` に `notes` がある場合（例: "Read-only verification only"）、その制約に従う

→ 手順0-4へ進む

### 0-3. 自動探索モード（設定ファイルなし）

設定ファイルがない場合、以下の順序でURLを特定する:

1. 引数に `--url` があればそのURLを使用
2. CLAUDE.mdからdev serverのURLやポート番号を読み取る
3. 上記で特定できない場合、一般的なポートを試行:
   - `http://localhost:5173` (Vite)
   - `http://localhost:3000` (React/Next.js)
   - `http://localhost:8080` (Vue/General)
   - `http://localhost:4200` (Angular)
   - `http://localhost:8000` (Django/Laravel)

各URLに `browser_navigate` でアクセスし、最初に応答したURLを `{BASE_URL}` とする。
すべて応答しない場合、ユーザーにURLを質問する。

→ 手順0-4へ進む

### 0-4. サーバーへの接続確認

`mcp__playwright__browser_navigate` で `{BASE_URL}` にアクセスする。

- ページが読み込めた場合 → `browser_snapshot` でページ状態を取得し、手順1へ進む
- 読み込めない場合:
  - local環境 → dev server起動コマンドをユーザーに案内して終了
  - その他 → サーバーに接続できない旨を報告して終了

## 手順1: テストシナリオの判定

### 設定駆動モードの場合

設定ファイルの `scenarios` から利用可能なシナリオ名を取得する。

引数からテストシナリオを判定する:

| 引数 | 動作 |
|------|------|
| `smoke-test` | 設定ファイルの `smoke_test_order` の順序で全シナリオを実行 |
| `login` | 全ロールのログインフロー検証 |
| `{シナリオ名}` | 設定ファイルの該当シナリオを実行 |
| その他テキスト | フリー記述として解釈し、最適な検証手順を組み立てる |

引数が未指定の場合は `smoke-test` として実行する。

### 自動探索モードの場合

| 引数 | 動作 |
|------|------|
| `smoke-test` または未指定 | ページを自動探索し、見つけたページをすべて検証 |
| `login` | ログインフォームを検出して検証 |
| その他テキスト | フリー記述として解釈 |

## 手順2: ログインプロシージャ

### 設定駆動モード

設定ファイルの `auth.roles` から対象ロールの情報を取得し、以下を実行する:

1. `browser_navigate` で `{BASE_URL}{login_url}` にアクセス
2. `browser_snapshot` でページ状態を取得
3. `credentials` の `fields` を順番に処理:
   - 各フィールドの `selector` を `browser_click`（snapshotのref番号を使用）
   - `browser_type` で `value` を入力
4. `submit` のセレクターを `browser_click`
5. `browser_wait` で2秒待機
6. `browser_snapshot` で結果確認
7. `success_indicator` で成功判定:
   - `url_contains`: URLに指定文字列が含まれるか
   - `element_exists`: 指定セレクターの要素が存在するか
   - `text_contains`: ページに指定テキストが含まれるか

**credentials が `"ask_user"` の場合**: AskUserQuestionツールで認証情報を質問してから実行する。

### 自動探索モード

1. `browser_snapshot` で現在のページを確認
2. ログインフォームを検出（`input[type="email"]`, `input[type="password"]`, `form` 要素等）
3. フォームが見つかった場合:
   - AskUserQuestionツールで「ログインフォームを検出しました。テスト用の認証情報を教えてください」と質問
   - ユーザーの回答を使ってフィールドに入力
   - 送信ボタンを `browser_click`
4. フォームが見つからない場合:
   - ログイン不要のアプリとして続行
   - または、ログインページのURLをユーザーに質問

### セッション切り替え

別のロールに切り替える場合は、直接そのロールのログインURLにナビゲートすればよい。
ブラウザを閉じる必要はない。

## 手順3: テストシナリオの実行

### シナリオ: login

1. 各ロールのログインフローを順番に実行し、成否を記録
2. （任意）誤った認証情報でのログイン試行 — エラーメッセージが表示されることを確認

### シナリオ: 設定ファイル定義のシナリオ

設定ファイルの `scenarios` に定義された各シナリオについて:

1. `requires_auth` で指定されたロールでログイン（未ログインまたは別ロールの場合）
2. `pages` の各ページについて:
   - `browser_navigate` で `{BASE_URL}{path}` にアクセス
   - `browser_wait` で1-2秒待機
   - `browser_snapshot` でページ状態を取得
   - `expect` の内容がページに存在するか確認

### シナリオ: smoke-test

- **設定駆動モード**: `smoke_test_order` の順序で全シナリオを実行
- **自動探索モード**: ログイン後、ナビゲーション要素を検出し、リンク先を順番に訪問・検証

各シナリオの結果を記録し、失敗しても次のシナリオに進む。

### シナリオ: カスタム（フリー記述）

引数の内容を解釈し、適切なロールでログインして対象ページを検証する。
CLAUDE.mdのルート定義やページ情報を参考に、最適な検証手順を組み立てる。

## 手順4: 結果の記録と報告

### 操作の原則

- **必ずsnapshotを取ってから操作する**: 要素のref番号はsnapshotごとに変わる。古いref番号は使えない
- **ページ遷移後は待機する**: `browser_wait` で1-2秒待ってからsnapshotを取る。SPAのレンダリングを待つため
- **エラー時は記録して続行**: あるシナリオが失敗しても、次のシナリオに進む。ただしログイン自体が失敗した場合は、そのロールに依存するシナリオはすべてSKIPとする
- **最後にブラウザを閉じる**: 全シナリオ完了後に `browser_close` を実行する

### 各シナリオの判定基準

- **PASS**: 期待する要素が表示され、エラーがない
- **FAIL**: ページが表示されない、期待する要素がない、エラーメッセージが表示される
- **SKIP**: 前提条件（ログイン等）が満たされないため実行できなかった

### レポート出力

このSKILL.mdと同じディレクトリにある [TEMPLATE.md](TEMPLATE.md) を読み込み、その形式に従って結果を会話に出力する（ファイルに保存しない）。
