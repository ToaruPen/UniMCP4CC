# Changelog

All notable changes to this project will be documented in this file.

## [1.0.8] - 2025-12-29

### Added
- Optional UIToolkit extension sample: `Samples~/UIToolkit Extension`

### Changed
- Bridge: normalize UIToolkit arguments (`gameObjectPath` / `gameObjectName` → `gameObject`)
- Documentation: add optional UIToolkit install instructions

## [1.0.7] - 2025-12-29

### Added
- MCP Bridge safety gates for destructive operations (`__confirm: true`, ambiguous-target blocking with candidates)
- Bridge utility tools: `bridge.status`, `bridge.ping`, `bridge.reload_config`
- Bridge tests (100% coverage for core normalization/safety logic) and an E2E smoke test script

### Changed
- Bridge argument normalization for schema variants (e.g. `unity.asset.createFolder`, `unity.asset.list`)
- Documentation updates (capabilities summary, safety behavior, UI Toolkit extension note, smoke test instructions)

## [1.0.6] - 2025-12-23

### Changed
- Removed UIToolkit extension (not part of core API)
- UIToolkit APIs now use reflection-based invocation for optional support

### Fixed
- Assembly reference error resolved by removing non-core dependency

## [1.0.5] - 2025-12-23

### Fixed
- Added missing LocalMcp.UnityServer.UIToolkit.Editor.dll (assembly reference error fix)

### Note
- This version was superseded by 1.0.6 (UIToolkit is not part of core API)

## [1.0.4] - 2025-12-23

### Fixed
- Added missing CHANGELOG.md.meta file

## [1.0.3] - 2025-12-23

### Fixed
- **GlobalLogCapture thread safety**: Fixed `SetLogCallbackDefined can only be called from the main thread` error
  - Added `[InitializeOnLoadMethod]` to ensure main thread initialization
  - Added `EnsureInitialized()` method for explicit initialization
  - Added null checks to all GlobalLogCapture.Instance accessors

## [1.0.2] - 2025-12-19

### Fixed
- Added missing package.json.meta file

## [1.0.1] - 2025-12-19

### Fixed
- Fixed Unity package loading errors

## [1.0.0] - 2025-12-19

### Added
- Initial release
- DLL distribution for Unity 6
- Core MCP Server functionality
- Scene, GameObject, Component, Transform, Asset, Prefab, Audio APIs
