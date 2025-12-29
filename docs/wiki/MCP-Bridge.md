# MCP Bridge

`Server~/mcp-bridge` は MCP クライアント（stdio）と Unity HTTP サーバー（既定: `http://localhost:5051`）の間に入り、以下を提供します。

- 安全ゲート（破壊的操作の確認、曖昧ターゲットのブロック）
- タイムアウト制御（既定/重い処理/上限）
- 引数の互換（キー別名の付与など）
- Bridge 付属ツール（`bridge.status` / `bridge.ping` / `bridge.reload_config`）

## 設定の読み込み順

1. `.unity-mcp-runtime.json`（Unity が生成、HTTP ポート情報）
2. 環境変数（例: `UNITY_HTTP_URL`）

主要な環境変数は `Server~/mcp-bridge/README.md` を参照してください。

## Per-call Timeout Override

特定のツール呼び出しだけタイムアウトを延長したい場合、ツール引数に以下を指定できます（Bridge が剥がして転送します）。

- `__timeoutMs`
- `__timeout_ms`
- `__timeout`

## E2E Smoke Test

Unity Editor を起動した状態で、Bridge の簡易 E2E テストを実行できます。

```bash
cd Server~/mcp-bridge
npm install
npm run smoke -- --project "/path/to/your/unity/project"
```

