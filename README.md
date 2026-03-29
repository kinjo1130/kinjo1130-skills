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

## ライセンス

MIT
