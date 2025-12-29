# Tools Overview

## ツールの取得

ツール一覧は MCP クライアント側の `tools/list` で取得できます。

## 命名規約（例）

- `unity.*`: Unity Editor 操作（シーン / GameObject / アセット / エディタ等）
- `bridge.*`: Bridge 自身の補助ツール

## 依存パッケージについて

`unity.*` のツールには、導入されていない Unity パッケージ向けのものも含まれます。
該当パッケージが未導入の場合、呼び出し時にエラーになります。

## 主なカテゴリ（例）

- scene / gameObject / component / transform
- asset / prefab / audio
- editor / log

## 引数の互換（キー別名）

ツールによってはスキーマ上のキーと Unity 側の実引数が一致しない場合があります。
Bridge は一部ツールについてキー別名を自動で補完します（詳細は `Server~/mcp-bridge/README.md`）。

