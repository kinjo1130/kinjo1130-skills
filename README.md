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
| [instruction-drift](plugins/instruction-drift/skills/instruction-drift/) | `/instruction-drift:instruction-drift` / `$instruction-drift` | CLAUDE.md・AGENTS.md などの指示文書と既存コードの食い違いを洗い出し、指示文書をコードに合わせて直す。CI での週次精査 template つき |

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

## instruction-drift

Claude Code や Codex は、CLAUDE.md・AGENTS.md の記述が今のコードと食い違うと、食い違いに気付いていても古い記述に従いやすいと報告されています。指示文書は書いたきりになりやすいので、この skill で定期的に指示文書をコードに合わせます。

- 指示文書の記述を、コードで確かめられる主張に分けて照らし合わせる
- 文書が古いだけの食い違いは、文書をコードに合わせて直す。コードは書き換えない
- どちらが正か決められない食い違いは、判断材料を添えて報告する
- 入口の指示文書に「食い違ったらコードに従い、見つけた食い違いを報告する」という一文が無ければ足す

```
/instruction-drift:instruction-drift                 # リポジトリ全体を精査して直す
/instruction-drift:instruction-drift .claude/rules   # 範囲を絞る
```

### CI で定期実行する

[templates/instruction-drift.yml](plugins/instruction-drift/skills/instruction-drift/templates/instruction-drift.yml) を対象リポジトリの `.github/workflows/` に置くと、週に 1 回 [claude-code-action](https://github.com/anthropics/claude-code-action) がこの skill を実行します。直した食い違いは pull request に、判断が要る食い違いだけの場合は issue にまとまります。Claude に任せるのは文書の編集と報告の書き出しだけで、commit・pull request・issue の操作は後続の step が行います。文書以外のファイルが変わった場合は、何も出さずに失敗します。

- secret `CLAUDE_CODE_OAUTH_TOKEN` を登録する
- Settings > Actions > General で「Allow GitHub Actions to create and approve pull requests」を有効にする
- skill に「CI に組み込んで」と頼むと、template を置くところまで行います

## ライセンス

MIT
