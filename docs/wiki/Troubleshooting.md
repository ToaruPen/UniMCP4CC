# Troubleshooting

## 接続できない / 応答がない

1. Unity Editor が起動しているか確認
2. Console に `[MCP] HTTP Server started on port 5051` が表示されているか確認
3. Unity プロジェクトルートに `.unity-mcp-runtime.json` が生成されているか確認
4. MCP クライアント側で `bridge.status` / `bridge.ping` を実行

## Unity の再コンパイル中に落ちる

Unity のコンパイル/アセットリフレッシュ中は、HTTP サーバーが一時的に停止することがあります。
少し待ってから再実行するか、Unity Editor を再起動してください。

## 破壊的操作がブロックされる

- `__confirm: true` を付けて再実行してください
- ターゲットが曖昧な場合、Bridge が候補一覧（パス）を返します。候補の `path` を指定して再実行してください

## タイムアウトする

- 1 回だけ延長したい場合: `__timeoutMs` / `__timeout_ms` / `__timeout`
- 既定値を変えたい場合: `MCP_TOOL_TIMEOUT_MS` / `MCP_HEAVY_TOOL_TIMEOUT_MS` 等（`Server~/mcp-bridge/README.md`）

