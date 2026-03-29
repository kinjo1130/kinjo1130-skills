# kinjo1130-skills

Claude Code 用のスキルマーケットプレイス。開発ワークフローを効率化するスキル集。

## インストール

```bash
claude plugin add kinjo1130/kinjo1130-skills
```

## スキル一覧

### E2E検証・テスト

| スキル | コマンド | 説明 |
|--------|---------|------|
| [e2e-verify](skills/e2e-verify/) | `/e2e-verify` | Playwright MCPを使った汎用E2E検証。設定ファイル or 自動探索で任意のWebアプリを検証 |

### PRレビュー

| スキル | コマンド | 説明 |
|--------|---------|------|
| [sanity-review](skills/sanity-review/) | `/sanity-review` | PR概要・対話コンテキスト・実装コードの整合性を確認するレビュー報告書を作成 |
| [library-update-review](skills/library-update-review/) | `/library-update-review` | dependabot/renovatebot等のライブラリ更新PRをレビュー |

### 対話コンテキスト管理

| スキル | コマンド | 説明 |
|--------|---------|------|
| [conversation-context-export](skills/conversation-context-export/) | `/conversation-context-export` | 対話コンテキストを`.dev/contexts/`にexport。次のセッションやレビューに引き継ぎ |
| [conversation-context-import](skills/conversation-context-import/) | `/conversation-context-import` | 保存された対話コンテキストを読み込み |

### Agent連携

| スキル | コマンド | 説明 |
|--------|---------|------|
| [codex-consultation](skills/codex-consultation/) | `/codex-consultation` | Codex CLIにセカンドオピニオンを求め、結果を要約して報告 |

### 外部サービス連携

| スキル | コマンド | 説明 |
|--------|---------|------|
| [cosense](skills/cosense/) | `/cosense` | Cosense（旧Scrapbox）のページ読み取り・検索・新規作成・編集 |

### ユーティリティ

| スキル | コマンド | 説明 |
|--------|---------|------|
| [find-skills](skills/find-skills/) | `/find-skills` | Skills CLIを使ってスキルを検索・インストール |

## 各スキルの詳細

### e2e-verify

Playwright MCPを使ったブラウザベースのE2E検証。

- **設定ファイルモード**: `.claude/e2e-verify.yml` でURL・ログイン手順・シナリオを定義
- **自動探索モード**: 設定なしでも即使用可能。ページを自動探索して検証
- 詳細: [examples/e2e-verify.yml](examples/e2e-verify.yml)

```
/e2e-verify                          # smoke-test
/e2e-verify --env staging login      # staging環境でログイン検証
/e2e-verify --url http://localhost:3000  # URL指定
```

### sanity-review

PRのレビュー報告書を作成。対話コンテキストがあれば、設計判断の根拠や却下した代替案の妥当性も検証する。
内部で `codex-consultation` を使ってバグ・脆弱性調査を行う。

```
/sanity-review           # 現在のブランチのPRをレビュー
/sanity-review 123       # PR #123 をレビュー
```

### library-update-review

ライブラリ更新PRを包括的にレビュー。release note分析、依存関係調査、コード更新、過去の失敗調査を行う。

```
/library-update-review 456   # PR #456 をレビュー
```

### conversation-context-export / import

対話コンテキストを `.dev/contexts/{ブランチ名}.md` に保存・読み込み。
PRレビュー、開発の引き継ぎ、バグハンティングに活用。

```
/conversation-context-export    # 現在の対話を保存
/conversation-context-import    # 保存されたコンテキストを読み込み
```

### codex-consultation

Codex CLI（OpenAI）にセカンドオピニオンを求める。3段階の深さ（普通/よく/全力）で相談できる。

```
/codex-consultation 普通に相談して。このPRの設計方針についてレビューしてほしい
```

### cosense

Cosense（旧Scrapbox）のAPI操作。ページの読み取り・検索・作成・編集をサポート。
自動バックアップ付きの安全な書き込みが可能。

**前提条件**: 環境変数 `COSENSE_SID` と `COSENSE_PROJECT` の設定が必要。

```
/cosense ページ「○○」を読みたい
/cosense 「△△」で検索して
```

### find-skills

Skills CLI（`npx skills`）を使ってスキルを検索・インストール。

```
/find-skills react performance    # React性能関連スキルを検索
```

## 前提条件

| スキル | 必要なもの |
|--------|-----------|
| e2e-verify | Playwright MCP サーバー |
| codex-consultation | Codex CLI (`codex` コマンド) |
| cosense | 環境変数 `COSENSE_SID`, `COSENSE_PROJECT` |
| find-skills | `npx skills` (Skills CLI) |

## セキュリティに関する注意

`e2e-verify` の設定ファイル（`.claude/e2e-verify.yml`）にテスト用の認証情報を含める場合は、`.gitignore` に追加することを推奨します。

## ライセンス

MIT
