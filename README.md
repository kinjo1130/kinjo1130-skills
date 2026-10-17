# kinjo1130-skills

Claude Code と Codex 用のスキルマーケットプレイス。

## インストール

skill ごとに 1 つのプラグインになっているので、必要なものだけ入れられます。Claude Code と Codex は同じ `plugins/<name>/skills/` を読みます。

### Claude Code

```bash
claude plugin marketplace add kinjo1130/kinjo1130-skills
claude plugin install coding-standards@kinjo1130-skills
```

### Codex

```bash
codex plugin marketplace add kinjo1130/kinjo1130-skills
codex plugin add coding-standards@kinjo1130-skills
```

`coding-standards` の部分を、下の一覧のプラグイン名に変えると他の skill を入れられます。

## スキル一覧

| プラグイン | 呼び出し（Claude Code / Codex） | 説明 |
|--------|---------|------|
| [e2e-verify](plugins/e2e-verify/skills/e2e-verify/) | `/e2e-verify:e2e-verify` / `$e2e-verify` | Playwright MCPを使った汎用E2E検証。設定ファイル or 自動探索で任意のWebアプリを検証 |
| [secretary](plugins/secretary/skills/secretary/) | `/secretary:secretary` / `$secretary` | Cosense・Notion・GitHubからタスクを横断取得し、秘書的にタスク管理・進捗チェックを行う |
| [coding-standards](plugins/coding-standards/skills/coding-standards/) | `/coding-standards:coding-standards` / `$coding-standards` | TanStack Start + Hono + Prisma の pnpm モノレポ向けコーディング規約。実装・計画・レビューの前に読み込ませる |

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

## coding-standards

TanStack Start（SSR）+ Hono + Prisma + Neon の pnpm モノレポで、誰が書いても同じ形のコードになるようにするための規約。

- `SKILL.md`: 作業ごとに読む reference の対応表と、書き終えた後のセルフチェック
- `references/`: 書式（空行・分割・命名）、TypeScript、モノレポ構成、バックエンド、フロントエンド、テスト、インフラ
- `templates/`: `biome.json`（`as` 禁止の Grit plugin つき）、`tsconfig.base.json`、`.dependency-cruiser.cjs`、プロジェクト用の `CLAUDE.md` と `AGENTS.md`

プロジェクトの指示ファイルに skill を読む指示を書くと、実装や計画のたびに規約が読み込まれます。

- Claude Code: `templates/CLAUDE.md` を `.claude/CLAUDE.md` にコピーする
- Codex: `templates/AGENTS.md` をリポジトリ直下の `AGENTS.md` にコピーする

## ライセンス

MIT
