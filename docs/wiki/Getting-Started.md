# Getting Started

## 動作環境

- Unity 6（`6000.x`）
- Node.js 18+
- MCP tools（stdio）対応クライアント

## インストール（Unity）

Unity Editor で `Window > Package Manager` → `+` → `Add package from git URL...`:

```
https://github.com/ToaruPen/UniMCP4CC.git
```

## 起動（MCP クライアント）

UniMCP4CC は Unity 側で HTTP サーバーを起動し、`Server~/mcp-bridge` が MCP（stdio）⇔ Unity HTTP をブリッジします。

### Claude Code（自動）

Unity Editor で `Window > Unity MCP > Setup Claude Code` を開き、設定生成ボタンを実行します。

### その他の MCP クライアント（手動）

お使いの MCP クライアントで、`Server~/mcp-bridge/index.js` を **stdio サーバーとして起動**するよう設定してください。

- `cwd` は Unity プロジェクトルート（`.unity-mcp-runtime.json` がある場所）に設定
- もしくは `UNITY_HTTP_URL=http://localhost:5051` を環境変数で指定

例（`.mcp.json` 形式の一例）:

```json
{
  "mcpServers": {
    "unity": {
      "command": "node",
      "args": ["/path/to/UniMCP4CC/Server~/mcp-bridge/index.js"],
      "cwd": "/path/to/your/unity/project"
    }
  }
}
```

## 接続確認

MCP クライアントから次を実行します。

- `bridge.status`: 接続先 URL / 設定値
- `bridge.ping`: Unity `/health` の疎通確認

## 破壊的操作の安全ゲート

削除/ビルド/インポート等の破壊的操作は、Bridge 側で `__confirm: true` が必須です。
また、GameObject のターゲットが曖昧な場合は実行せずに候補一覧（パス）を返します。

