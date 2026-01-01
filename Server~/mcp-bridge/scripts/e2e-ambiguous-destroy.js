#!/usr/bin/env node
import process from 'node:process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  buildArgsFromSchema,
  buildBridgeEnv,
  extractLastJson,
  fail,
  readRuntimeConfig,
  requireSingleToolByFilter,
  requireTool,
  resolveBridgeIndexPath,
  stringifyToolCallResult,
} from './_e2eUtil.js';

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    unityProjectRoot: null,
    unityHttpUrl: process.env.UNITY_HTTP_URL ?? null,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const value = args[i];
    if (value === '--project') {
      options.unityProjectRoot = args[i + 1] ?? null;
      i++;
      continue;
    }
    if (value === '--unity-http-url') {
      options.unityHttpUrl = args[i + 1] ?? null;
      i++;
      continue;
    }
    if (value === '--verbose') {
      options.verbose = true;
      continue;
    }
    if (value.startsWith('-')) {
      fail(`Unknown option: ${value}`);
    }
    if (!options.unityProjectRoot) {
      options.unityProjectRoot = value;
      continue;
    }
    fail(`Unexpected argument: ${value}`);
  }

  return options;
}

function extractEmbeddedJson(result) {
  const parts = [];
  for (const item of result?.content ?? []) {
    if (item?.type === 'text' && typeof item.text === 'string') {
      parts.push(item.text);
    }
  }

  for (let i = parts.length - 1; i >= 0; i--) {
    const text = parts[i];
    if (typeof text !== 'string' || text.trim().length === 0) {
      continue;
    }

    const direct = extractLastJson({ content: [{ type: 'text', text }] });
    if (direct) {
      return direct;
    }

    for (const marker of ['\n{', '\n[', '{', '[']) {
      const index = text.indexOf(marker);
      if (index === -1) {
        continue;
      }
      const slice = text.slice(index + (marker.startsWith('\n') ? 1 : 0)).trim();
      if (!slice.startsWith('{') && !slice.startsWith('[')) {
        continue;
      }
      try {
        return JSON.parse(slice);
      } catch {
        continue;
      }
    }
  }

  return null;
}

async function main() {
  const options = parseArgs(process.argv);

  let unityHttpUrl = options.unityHttpUrl;
  if (!unityHttpUrl) {
    const unityProjectRoot = options.unityProjectRoot ?? process.cwd();
    const runtime = readRuntimeConfig(unityProjectRoot);
    unityHttpUrl = runtime.httpUrl;
  }

  const bridgeIndexPath = resolveBridgeIndexPath(import.meta.url);
  const env = buildBridgeEnv({ unityHttpUrl, verbose: options.verbose });

  const client = new Client({ name: 'unity-mcp-bridge-e2e-ambiguous-destroy', version: '1.0.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: 'node', args: [bridgeIndexPath], env });

  const runId = Date.now();
  const parentName = `AD_Parent_${runId}`;
  const targetName = `AD_Target_${runId}`;

  try {
    await client.connect(transport);

    const toolList = await client.listTools();
    const tools = toolList?.tools ?? [];

    const createTool = requireTool(tools, 'unity.create', /create/i);
    const setParentTool = requireTool(tools, 'unity.gameObject.setParent', /^unity\.gameObject\.setParent$/i);
    const destroyTool = requireSingleToolByFilter(
      tools,
      (tool) => /^unity\.(gameObject|gameobject)\./i.test(tool.name) && /destroy/i.test(tool.name),
      'GameObject destroy'
    );

    const createParentArgs = buildArgsFromSchema(createTool, [
      { keys: ['primitiveType', 'type'], value: 'Cube' },
      { keys: ['name', 'gameObjectName', 'objectName'], value: parentName },
    ]);
    const createParent = await client.callTool({ name: createTool.name, arguments: createParentArgs });
    if (createParent?.isError) {
      fail(`AD-00 create parent failed:\n${stringifyToolCallResult(createParent)}`);
    }

    const createFirstArgs = buildArgsFromSchema(createTool, [
      { keys: ['primitiveType', 'type'], value: 'Cube' },
      { keys: ['name', 'gameObjectName', 'objectName'], value: targetName },
    ]);
    const createFirst = await client.callTool({ name: createTool.name, arguments: createFirstArgs });
    if (createFirst?.isError) {
      fail(`AD-00 create first failed:\n${stringifyToolCallResult(createFirst)}`);
    }

    const setParentArgs = buildArgsFromSchema(setParentTool, [
      { keys: ['path', 'gameObjectPath', 'hierarchyPath'], value: targetName },
      { keys: ['parentPath', 'parentGameObjectPath', 'parent'], value: parentName },
      { keys: ['worldPositionStays'], value: false, optional: true },
    ]);
    const setParent = await client.callTool({ name: setParentTool.name, arguments: setParentArgs });
    if (setParent?.isError) {
      fail(`AD-00 setParent failed:\n${stringifyToolCallResult(setParent)}`);
    }

    const createSecond = await client.callTool({ name: createTool.name, arguments: createFirstArgs });
    if (createSecond?.isError) {
      fail(`AD-00 create second failed:\n${stringifyToolCallResult(createSecond)}`);
    }
    console.log('[AD-00] Created 2 objects with the same name (one is parented).');

    // AD-01: ambiguous destroy should be blocked and return candidates.
    const destroyArgs = buildArgsFromSchema(destroyTool, [{ keys: ['path', 'gameObjectPath', 'hierarchyPath'], value: targetName }]);
    const ambiguousDestroy = await client.callTool({
      name: destroyTool.name,
      arguments: { ...destroyArgs, __confirm: true, __confirmNote: 'e2e-ambiguous-destroy AD-01 should be blocked' },
    });
    if (!ambiguousDestroy?.isError) {
      fail(`AD-01 expected ambiguous destroy to be blocked, but it succeeded:\n${stringifyToolCallResult(ambiguousDestroy)}`);
    }

    const payload = extractEmbeddedJson(ambiguousDestroy);
    if (payload?.error !== 'unambiguous_target_required') {
      fail(`AD-01 expected error=unambiguous_target_required, got:\n${JSON.stringify(payload, null, 2)}`);
    }
    const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
    if (candidates.length < 2) {
      fail(`AD-01 expected >=2 candidates, got:\n${JSON.stringify(payload, null, 2)}`);
    }
    console.log('[AD-01] Ambiguous target correctly blocked (candidates returned)');

    const childCandidate = candidates.find((entry) => typeof entry?.path === 'string' && entry.path.includes('/')) ?? null;
    if (!childCandidate) {
      fail(`AD-01 expected a child candidate path containing '/':\n${JSON.stringify(payload, null, 2)}`);
    }

    // AD-02: destroy the child candidate using its unique path (disambiguation).
    const destroyChild = await client.callTool({
      name: destroyTool.name,
      arguments: { ...destroyArgs, path: childCandidate.path, __confirm: true, __confirmNote: 'e2e-ambiguous-destroy AD-02 child' },
    });
    if (destroyChild?.isError) {
      fail(`AD-02 destroy child failed:\n${stringifyToolCallResult(destroyChild)}`);
    }
    console.log('[AD-02] Destroyed child candidate via unique path');

    // AD-03: now the remaining object name should be unambiguous.
    const destroyRemaining = await client.callTool({
      name: destroyTool.name,
      arguments: { ...destroyArgs, __confirm: true, __confirmNote: 'e2e-ambiguous-destroy AD-03 remaining' },
    });
    if (destroyRemaining?.isError) {
      fail(`AD-03 destroy remaining failed:\n${stringifyToolCallResult(destroyRemaining)}`);
    }
    console.log('[AD-03] Destroyed remaining object after disambiguation');

    // Cleanup: parent.
    const destroyParentArgs = buildArgsFromSchema(destroyTool, [{ keys: ['path', 'gameObjectPath', 'hierarchyPath'], value: parentName }]);
    await client.callTool({
      name: destroyTool.name,
      arguments: { ...destroyParentArgs, __confirm: true, __confirmNote: 'e2e-ambiguous-destroy cleanup parent' },
    });

    console.log('[E2E ambiguous destroy] PASS');
  } finally {
    await client.close().catch(() => {});
  }
}

main().catch((error) => {
  if (!process.exitCode) {
    process.exitCode = 1;
  }
  console.error(error?.stack || String(error));
});
