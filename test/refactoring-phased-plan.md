# UniMCP4CC リファクタリング計画（フェーズ実行）

このドキュメントは、コードベース調査結果に基づくリファクタリングを **フェーズ（=独立PR/独立差分）** で安全に進めるための計画書兼チェックリストです。

## 前提 / 制約

- 変更は **フェーズごとに完結**させ、途中で「ついで改修」をしない
- 各フェーズのゴールは「挙動互換 + 保守性/安全性向上」
- 破壊的変更（既定挙動の変更・環境変数の意味変更）は避け、必要なら **opt-in**（明示フラグ）で導入
- Unity 側の主要実装は `Editor/LocalMcp.UnityServer.Editor.dll` に含まれるため、C# 側の監査/改修は `Editor/*.cs` の範囲のみ

## 現状ベースライン（開始時点）

- `Server~/mcp-bridge/index.js`：1873行（巨大・多責務）
- `Server~/mcp-bridge/lib/bridgeLogic.js`：857行（純関数中心・単体テストあり）
- `Server~/mcp-bridge/scripts/*.js`：合計 3870行（E2E補助コード重複が多い）

## 共通の品質ゲート（全フェーズ共通）

- [ ] `git status --porcelain=v1` が空（意図しない差分なし）
- [ ] `node --test Server~/mcp-bridge/test/bridgeLogic.test.js` が PASS
- [ ] `node --check Server~/mcp-bridge/index.js` が OK（Phase A/D）
- [ ] 変更点が README / docs に反映されている（挙動・環境変数・互換性）
- [ ] ロールバックが容易（巨大一括変更にしない）

## フェーズ0：計画書の配置と合意（このファイル）

### 目的

- フェーズ分割・スコープ・DoD を明文化し、以降の作業を「1フェーズずつ」進められる状態にする

### チェックリスト

- [x] 本ファイルを `test/refactoring-phased-plan.md` として管理する
- [x] フェーズ順序（D → A → B → C）と各フェーズのゴール/スコープが合意できている

---

## フェーズD：Safety hardening（URL / unsafe invoke）

### Goal

- 誤設定で `UNITY_HTTP_URL` をリモートへ向ける/`invokeStaticMethod` を有効化する事故を減らす

### Scope（編集対象）

- `Server~/mcp-bridge/lib/bridgeLogic.js`
- `Server~/mcp-bridge/index.js`
- `Server~/mcp-bridge/test/bridgeLogic.test.js`
- （必要に応じて）`Server~/mcp-bridge/README.md` / `README.md` / `docs/wiki/MCP-Bridge.md`

### 仕様（決定）

- デフォルトは **warnのみ**（既存互換を維持）
- 明示的な opt-in で **strict（非local拒否）** を可能にする

### 追加（予定）環境変数

- `MCP_ALLOW_REMOTE_UNITY_HTTP_URL`（既定: `false`）: 非local URL 利用の“意図”を明示（警告抑制）
- `MCP_STRICT_LOCAL_UNITY_HTTP_URL`（既定: `false`）: 非local URL を拒否（安全優先）

### 実装チェックリスト

- [x] `UNITY_HTTP_URL` のホストが `localhost/127.0.0.1/::1` 以外なら警告（sourceも表示）
- [x] `MCP_STRICT_LOCAL_UNITY_HTTP_URL=true` のときは非local URL を拒否して安全なフォールバックへ
- [x] `MCP_ENABLE_UNSAFE_EDITOR_INVOKE=true` のとき、起動ログ/`bridge.status` に強い注意喚起を追加
- [x] 単体テスト追加（config の追加項目、URL解析ユーティリティ等）

### DoD / Evidence

- [x] 既存テストが PASS
- [x] `bridge.status` で設定・警告状態が確認できる

---

## フェーズA：`Server~/mcp-bridge/index.js` の責務分割

### Goal

- 1873行の巨大ファイルを分割し、変更容易性とテスト容易性を上げる（挙動互換）

### Scope（編集対象）

- `Server~/mcp-bridge/index.js`（薄いエントリポイントへ）
- 新規: `Server~/mcp-bridge/lib/*.js`（http/runtimeConfig/schemaPatch/toolOverrides/unityRpc 等）
- `Server~/mcp-bridge/test/*`（必要な単体テスト追加）

### 実施手順（安全順）

- [x] 純関数/副作用なしを先に抽出（schema patch など）
- [x] 次に I/O（runtime config / http）を抽出
- [x] 最後に `UnityMCPServer` 本体を分離（import構造を確定）
- [x] `index.js` を「配線＋起動」に寄せる

### DoD / Evidence

- [x] `node --check Server~/mcp-bridge/index.js` が OK
- [x] 既存テストが PASS + 抽出先のテストが追加されている

---

## フェーズB：E2E scripts の共通化（重複排除）

### Goal

- `scripts/` 内の引数解析・runtime config 読取・ツール補助などの重複を集約し、修正漏れを防ぐ

### Scope（編集対象）

- 新規: `Server~/mcp-bridge/scripts/_e2eUtil.js`
- `Server~/mcp-bridge/scripts/*.js`（importに置換）

### DoD / Evidence

- [x] `node --check Server~/mcp-bridge/scripts/*.js` が OK
- [x] CLIオプション互換（既存の `--project` 等）を維持

---

## フェーズC：Unity C# 側（`Editor/*.cs`）の可読性/安全性改善

### Goal

- `Editor/McpAssetImport.cs` の冗長なエラー生成を整理し、型解決（`ResolveType`）の負荷/誤解決リスクを下げる

### Scope（編集対象）

- `Editor/McpAssetImport.cs`

### 実装方針（候補）

- [x] `Success(...)` / `Error(...)` などのヘルパで payload 生成重複を削減
- [x] `ResolveType` をキャッシュ化し、探索範囲を狭める（必要なら「完全修飾名を要求」）

### DoD / Evidence（手動確認が必要）

- [ ] Unity Editor でコンパイルが通る
- [ ] Bridge 経由で `unity.assetImport.*` / `unity.component.setSpriteReference` の軽い動作確認
