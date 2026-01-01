#!/usr/bin/env node
import process from 'node:process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  buildArgsFromSchema,
  buildBridgeEnv,
  fail,
  readRuntimeConfig,
  requireSingleToolByFilter,
  requireTool,
  resolveBridgeIndexPath,
  selectBooleanArgKey,
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
    // Back-compat: first positional arg is treated as project root.
    if (!options.unityProjectRoot) {
      options.unityProjectRoot = value;
      continue;
    }
    fail(`Unexpected argument: ${value}`);
  }

  return options;
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

  const client = new Client(
    { name: 'unity-mcp-bridge-smoke', version: '1.0.0' },
    { capabilities: {} }
  );
  const transport = new StdioClientTransport({
    command: 'node',
    args: [bridgeIndexPath],
    env,
  });

  try {
    await client.connect(transport);

    const ping = await client.callTool({ name: 'bridge.ping', arguments: {} });
    if (ping?.isError) {
      fail(`bridge.ping failed:\n${stringifyToolCallResult(ping)}`);
    }
    console.log(`[Smoke] bridge.ping OK`);

    const toolList = await client.listTools();
    const tools = toolList?.tools ?? [];

    const createTool = requireTool(tools, 'unity.create', /create/i);
    const sceneListTool = requireTool(tools, 'unity.scene.list', /scene\\.list/i);
    const setActiveTool = requireSingleToolByFilter(
      tools,
      (tool) => /^unity\./.test(tool.name) && /setActive/i.test(tool.name),
      'setActive'
    );
    const destroyTool = requireSingleToolByFilter(
      tools,
      (tool) => /^unity\.(gameObject|gameobject)\./i.test(tool.name) && /destroy/i.test(tool.name),
      'GameObject destroy'
    );

    const objectName = `McpSmoke_${Date.now()}`;

    const createArgs = buildArgsFromSchema(createTool, [
      { keys: ['primitiveType', 'type'], value: 'Cube' },
      { keys: ['name', 'gameObjectName', 'objectName'], value: objectName },
    ]);

    const createResult = await client.callTool({ name: createTool.name, arguments: createArgs });
    if (createResult?.isError) {
      fail(`Create failed:\n${stringifyToolCallResult(createResult)}`);
    }
    console.log(`[Smoke] Created: ${objectName}`);

    const sceneListArgs = buildArgsFromSchema(sceneListTool, [{ keys: ['maxDepth'], value: 50, optional: true }]);
    const sceneListResult = await client.callTool({ name: sceneListTool.name, arguments: sceneListArgs });
    if (sceneListResult?.isError) {
      fail(`Scene list failed:\n${stringifyToolCallResult(sceneListResult)}`);
    }

    const targetKey = buildArgsFromSchema(
      setActiveTool,
      [{ keys: ['gameObjectPath', 'path', 'hierarchyPath'], value: objectName }],
      { allowPartial: true }
    );
    const activeKey = selectBooleanArgKey(setActiveTool, ['active', 'isActive', 'enabled']);

    const deactivateArgs = { ...targetKey, [activeKey]: false };
    const deactivateResult = await client.callTool({ name: setActiveTool.name, arguments: deactivateArgs });
    if (deactivateResult?.isError) {
      fail(`Deactivate failed:\n${stringifyToolCallResult(deactivateResult)}`);
    }
    console.log(`[Smoke] Deactivated: ${objectName}`);

    const activateArgs = { ...targetKey, [activeKey]: true };
    const activateResult = await client.callTool({ name: setActiveTool.name, arguments: activateArgs });
    if (activateResult?.isError) {
      fail(`Reactivate failed:\n${stringifyToolCallResult(activateResult)}`);
    }
    console.log(`[Smoke] Reactivated: ${objectName}`);

    const destroyArgsBase = buildArgsFromSchema(destroyTool, [{ keys: ['gameObjectPath', 'path', 'hierarchyPath'], value: objectName }]);

    const destroyWithoutConfirm = await client.callTool({ name: destroyTool.name, arguments: destroyArgsBase });
    if (!destroyWithoutConfirm?.isError) {
      fail(`Destroy without __confirm unexpectedly succeeded:\n${stringifyToolCallResult(destroyWithoutConfirm)}`);
    }
    console.log(`[Smoke] Destroy without __confirm correctly blocked`);

    const destroyWithConfirm = await client.callTool({
      name: destroyTool.name,
      arguments: { ...destroyArgsBase, __confirm: true, __confirmNote: 'smoke test cleanup' },
    });
    if (destroyWithConfirm?.isError) {
      fail(`Destroy with __confirm failed:\n${stringifyToolCallResult(destroyWithConfirm)}`);
    }
    console.log(`[Smoke] Destroyed: ${objectName}`);

    console.log('[Smoke] PASS');
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
