# リファクタ計画ドキュメント: フォーク後の変更ファイル棚卸し

日付: 2026-01-07
基点: `merge-base upstream/main origin/main` = `559fa45615ec9c5bcd4766d7449755bbd33554cf`

## 目的
- フォーク後に変更されたファイルを全て把握する。
- 変更ファイルごとに、リファクタリング要否の初期判定を行う。

## 対象範囲
- `upstream/main` との差分（全ブランチ横断）
- コミット済みの変更を対象

## 収集方法
- `git merge-base upstream/main origin/main`
- `git log --name-only --pretty=format: <base>.. --all`

## 判定基準（初期スクリーニング）
- **コード（C#/JS）**: 300行超は要検討、400行超は要リファクタ候補
- **ドキュメント/設定/Unity .meta/バイナリ**: リファクタ対象外

## コードファイル一覧（C#/JS）
| ファイル | 行数 | 判定 | 理由 |
| --- | ---: | --- | --- |
| `Editor/McpAssetImport.cs` | 885 | 要リファクタ候補 | 400行超の肥大化（Editor C#） |
| `Editor/McpComponentTools.cs` | 607 | 要リファクタ候補 | 400行超の肥大化（Editor C#） |
| `Editor/McpGameObjectTools.cs` | 387 | 要検討 | 300行超（Editor C#） |
| `Editor/McpMenuItemLister.cs` | 65 | 現時点不要 | 300行未満（Editor C#） |
| `Editor/McpServerAutoStart.cs` | 214 | 現時点不要 | 300行未満（Editor C#） |
| `Server~/mcp-bridge/index.js` | 14 | 現時点不要 | 300行未満（Bridge） |
| `Server~/mcp-bridge/lib/UnityMCPServer.js` | 1820 | 要リファクタ候補 | 400行超の肥大化（Bridge本体） |
| `Server~/mcp-bridge/lib/bridgeConfig.js` | 106 | 現時点不要 | 300行未満（Bridge本体） |
| `Server~/mcp-bridge/lib/bridgeLogic.js` | 973 | 要リファクタ候補 | 400行超の肥大化（Bridge本体） |
| `Server~/mcp-bridge/lib/http.js` | 58 | 現時点不要 | 300行未満（Bridge本体） |
| `Server~/mcp-bridge/lib/runtimeConfig.js` | 23 | 現時点不要 | 300行未満（Bridge本体） |
| `Server~/mcp-bridge/lib/toolSchemaPatch.js` | 271 | 現時点不要 | 300行未満（Bridge本体） |
| `Server~/mcp-bridge/scripts/_e2eUtil.js` | 182 | 現時点不要 | 300行未満（E2Eスクリプト） |
| `Server~/mcp-bridge/scripts/e2e-ambiguous-destroy.js` | 224 | 現時点不要 | 300行未満（E2Eスクリプト） |
| `Server~/mcp-bridge/scripts/e2e-asset-import-reference.js` | 360 | 要検討 | 300行超（E2Eスクリプト） |
| `Server~/mcp-bridge/scripts/e2e-invoke-safety.js` | 184 | 現時点不要 | 300行未満（E2Eスクリプト） |
| `Server~/mcp-bridge/scripts/e2e-manual-ops.js` | 517 | 要リファクタ候補 | 400行超の肥大化（E2Eスクリプト） |
| `Server~/mcp-bridge/scripts/e2e-prefab.js` | 379 | 要検討 | 300行超（E2Eスクリプト） |
| `Server~/mcp-bridge/scripts/e2e-recompile-jitter.js` | 266 | 現時点不要 | 300行未満（E2Eスクリプト） |
| `Server~/mcp-bridge/scripts/e2e-scene-save.js` | 217 | 現時点不要 | 300行未満（E2Eスクリプト） |
| `Server~/mcp-bridge/scripts/e2e-setreference.js` | 282 | 現時点不要 | 300行未満（E2Eスクリプト） |
| `Server~/mcp-bridge/scripts/e2e-smoke.js` | 171 | 現時点不要 | 300行未満（E2Eスクリプト） |
| `Server~/mcp-bridge/scripts/e2e-tilemap.js` | 308 | 要検討 | 300行超（E2Eスクリプト） |
| `Server~/mcp-bridge/scripts/e2e-uitoolkit.js` | 332 | 要検討 | 300行超（E2Eスクリプト） |
| `Server~/mcp-bridge/scripts/playmode-ab.js` | 363 | 要検討 | 300行超（E2Eスクリプト） |
| `Server~/mcp-bridge/test/bridgeConfig.test.js` | 77 | 現時点不要 | 300行未満（テスト） |
| `Server~/mcp-bridge/test/bridgeLogic.test.js` | 1004 | 要リファクタ候補 | 400行超の肥大化（テスト） |

## ドキュメント/設定（リファクタ対象外）
- `.Plans/2026/01/bridge-allowlist-gameobject-search.md` (82 lines)
- `.Plans/2026/01/bridge-component-add-safe-tools-estimate.md` (72 lines)
- `.gitignore` (34 lines)
- `CHANGELOG.md` (71 lines)
- `README.md` (209 lines)
- `Samples~/UIToolkit Extension/README.md` (5 lines)
- `Server~/mcp-bridge/README.md` (196 lines)
- `Server~/mcp-bridge/package.json` (31 lines)
- `docs/wiki/Getting-Started.md` (63 lines)
- `docs/wiki/Home.md` (24 lines)
- `docs/wiki/MCP-Bridge.md` (99 lines)
- `docs/wiki/Tools.md` (64 lines)
- `docs/wiki/Troubleshooting.md` (82 lines)
- `docs/wiki/UI-Toolkit.md` (28 lines)
- `docs/wiki/_Sidebar.md` (7 lines)
- `package.json` (38 lines)
- `test/pitfalls-dod-plan.md` (405 lines)
- `test/realworld-report.md` (108 lines)
- `test/refactoring-phased-plan.md` (138 lines)
- `test/scenario.md` (346 lines)

## Unity .meta（対象外）
- `.Plans/2026.meta`
- `.Plans/2026/01.meta`
- `.Plans/2026/01/bridge-allowlist-gameobject-search.md.meta`
- `.Plans/2026/01/bridge-component-add-safe-tools-estimate.md.meta`
- `Editor/McpAssetImport.cs.meta`
- `Editor/McpComponentTools.cs.meta`
- `Editor/McpGameObjectTools.cs.meta`
- `Editor/McpMenuItemLister.cs.meta`
- `Editor/McpServerAutoStart.cs.meta`
- `Plans.meta`
- `Samples~/UIToolkit Extension/Editor/LocalMcp.UnityServer.UIToolkit.Editor.dll.meta`
- `docs.meta`
- `docs/wiki.meta`
- `docs/wiki/Getting-Started.md.meta`
- `docs/wiki/Home.md.meta`
- `docs/wiki/MCP-Bridge.md.meta`
- `docs/wiki/Tools.md.meta`
- `docs/wiki/Troubleshooting.md.meta`
- `docs/wiki/UI-Toolkit.md.meta`
- `docs/wiki/_Sidebar.md.meta`
- `test.meta`
- `test/pitfalls-dod-plan.md.meta`
- `test/realworld-report.md.meta`
- `test/refactoring-phased-plan.md.meta`
- `test/scenario.md.meta`

## バイナリ（対象外）
- `Editor/LocalMcp.UnityServer.Editor.dll`
- `Samples~/UIToolkit Extension/Editor/LocalMcp.UnityServer.UIToolkit.Editor.dll`

## 未コミット（参考）
- `.Plans/2026/01/plans-changes-inventory.md`
- `.Plans/2026/01/plans-changes-inventory.md.meta`
