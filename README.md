# kinjo1130-skills

Claude Code 用のスキルマーケットプレイス。

## インストール

```bash
claude plugin add kinjo1130/kinjo1130-skills
```

## スキル一覧

| スキル | コマンド | 説明 |
|--------|---------|------|
| [e2e-verify](skills/e2e-verify/) | `/e2e-verify` | Playwright MCPを使った汎用E2E検証。設定ファイル or 自動探索で任意のWebアプリを検証 |
| [secretary](skills/secretary/) | `/secretary` | Cosense・Notion・GitHubからタスクを横断取得し、秘書的にタスク管理・進捗チェックを行う |
| [uat-checklist](skills/uat-checklist/) | `/uat-checklist` | PR・ブランチ差分からUAT（動作確認）チェックリストを生成 |
| [uat-record](skills/uat-record/) | `/uat-record` | チェックリストをPlaywright MCPで消化し、5値判定・操作動画（0.5倍速condense）・スクショ・レポートを生成 |

## e2e-verify

Playwright MCPを使ったブラウザベースのE2E検証。

- **設定ファイルモード**: `.claude/e2e-verify.yml` でURL・ログイン手順・シナリオを定義
- **自動探索モード**: 設定なしでも即使用可能。ページを自動探索して検証
- 設定例: [examples/e2e-verify.yml](examples/e2e-verify.yml)

```
/e2e-verify                              # smoke-test
/e2e-verify --env staging login          # staging環境でログイン検証
/e2e-verify --url http://localhost:3000  # URL指定
/e2e-verify ユーザー登録画面を確認して      # フリー記述
```

### 前提条件

Playwright MCPサーバーが設定されている必要があります。プロジェクトの `.mcp.json` に以下を追加してください:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

### 設定ファイル

プロジェクトに `.claude/e2e-verify.yml` を作成すると、定義済みのシナリオを再現可能な形で実行できます。
完全なサンプルは [examples/e2e-verify.yml](examples/e2e-verify.yml) を参照してください。

### セキュリティに関する注意

設定ファイルにテスト用の認証情報を含める場合は、`.gitignore` に追加することを推奨します:

```gitignore
.claude/e2e-verify.yml
```

## secretary

Cosense・Notion・GitHubからタスクを横断取得し、秘書的にサポートするスキル。

- **タイムブロック管理**: Cosenseの日付ページから今やるべきタスクを判定
- **持ち越し検出**: 昨日・一昨日から未完了のまま持ち越されたタスクを検出
- **マルチソース対応**: Cosense / Notion MCP / GitHub Issue を横断取得
- 設定例: [examples/secretary.yml](examples/secretary.yml)

```
/secretary                # 今何する？（デフォルト）
/secretary ブリーフィング   # 朝のブリーフィング
/secretary 進捗どう？      # 進捗チェック
/secretary 振り返り        # 1日の振り返り
```

### 前提条件

- Cosenseスキル（`cosense_api.sh`）がセットアップ済みであること
- Notion連携を使う場合は Notion MCP が接続されていること
- GitHub連携を使う場合は `gh` CLI が認証済みであること

## uat-checklist / uat-record

PR 単位の UAT（動作確認）を「項目の列挙」と「消化・記録」の 2 スキルで回すワークフロー。

- **uat-checklist**: PR または現在ブランチの差分を解析し、対象画面・操作・期待結果・優先度（P0〜P3）付きのチェックリスト（`checklist.md`）を生成。`--comment` で PR コメントへ冪等投稿
- **uat-record**: checklist を Playwright MCP で 1 項目ずつ消化し、pass / fail / blocked / skipped / REVIEW の 5 値で判定。操作動画（擬似カーソル・クリック波紋・項目ラベルバナー付き）とスクショを残し、`report.md` を生成。`--comment` で PR コメントへ投稿
- 録画は同梱の `condense-video.sh` で静止区間（LLM の思考待ち）を除去し、**既定 0.5 倍速**の追いやすい動画 + GitHub 添付用 mp4 を出力（`--speed 1.0` で等速）

```
/uat-checklist                # 現在ブランチの差分からチェックリスト生成
/uat-checklist --comment 123  # 生成済み checklist を PR #123 コメントへ投稿
/uat-record                   # チェックリストを消化し report.md 生成
/uat-record --comment 123     # report を PR #123 コメントへ投稿
```

### 前提条件

- `gh` CLI が認証済みであること（PR モード / `--comment` 使用時）
- 検証対象アプリがローカルで起動できること
- 動画の後処理に `ffmpeg`（libvpx-vp9 / libx264 対応ビルド）
- Playwright MCP を `--caps=devtools` 付きで設定していること（録画機能に必須）。カーソル可視化は同梱の `skills/uat-record/scripts/cursor-overlay.js` をプロジェクトへコピーして `--init-script` に指定する:

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

## ライセンス

MIT
