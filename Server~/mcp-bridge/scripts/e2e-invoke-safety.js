#!/usr/bin/env node
import process from 'node:process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  buildArgsFromSchema,
  buildBridgeEnv,
  fail,
  readRuntimeConfig,
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
    // Back-compat: first positional arg is treated as project root.
    if (!options.unityProjectRoot) {
      options.unityProjectRoot = value;
      continue;
    }
    fail(`Unexpected argument: ${value}`);
  }

  return options;
}

async function runScenario({ unityHttpUrl, bridgeIndexPath, verbose, enableUnsafeInvoke }) {
  const env = buildBridgeEnv({
    unityHttpUrl,
    verbose,
    extraEnv: {
      MCP_ENABLE_UNSAFE_EDITOR_INVOKE: enableUnsafeInvoke ? 'true' : undefined,
    },
  });

  const client = new Client(
    {
      name: `unity-mcp-bridge-e2e-invoke-safety-${enableUnsafeInvoke ? 'unsafe-on' : 'unsafe-off'}`,
      version: '1.0.0',
    },
    { capabilities: {} }
  );
  const transport = new StdioClientTransport({ command: 'node', args: [bridgeIndexPath], env });

  try {
    await client.connect(transport);

    const toolList = await client.listTools();
    const tools = toolList?.tools ?? [];

    const invokeTool = tools.find((tool) => tool.name === 'unity.editor.invokeStaticMethod') ?? null;
    const listMenuItemsTool = requireTool(tools, 'unity.editor.listMenuItems', /listMenuItems/i);

    // INV-01: tools/list hides invoke by default
    if (!enableUnsafeInvoke) {
      if (invokeTool) {
        fail('INV-01 expected unity.editor.invokeStaticMethod to be hidden, but it is present in tools/list.');
      }
      console.log('[INV-01] invokeStaticMethod hidden (default OFF)');
    } else {
      if (!invokeTool) {
        fail('INV-01 expected unity.editor.invokeStaticMethod to be visible when unsafe is enabled.');
      }
      console.log('[INV-01] invokeStaticMethod visible (unsafe ON)');
    }

    // INV-03: listMenuItems works (safe override) and includes MCP/Server/Start
    const listArgs = buildArgsFromSchema(listMenuItemsTool, [{ keys: ['filter'], value: 'MCP', optional: true }], {
      allowPartial: true,
    });
    const menuItemsResult = await client.callTool({ name: listMenuItemsTool.name, arguments: listArgs });
    if (menuItemsResult?.isError) {
      fail(`INV-03 unity.editor.listMenuItems failed:\n${stringifyToolCallResult(menuItemsResult)}`);
    }
    const menuText = stringifyToolCallResult(menuItemsResult);
    if (!menuText.includes('MCP/Server/Start')) {
      fail(`INV-03 expected listMenuItems to include MCP/Server/Start, got:\n${menuText}`);
    }
    console.log('[INV-03] listMenuItems OK (contains MCP/Server/Start)');

    if (!enableUnsafeInvoke) {
      // INV-02: direct call is blocked with enable instructions
      const direct = await client.callTool({
        name: 'unity.editor.invokeStaticMethod',
        arguments: { typeName: 'System.String', methodName: 'Copy', parameters: ['x'] },
      });
      if (!direct?.isError) {
        fail(`INV-02 expected invokeStaticMethod to be blocked, but it succeeded:\n${stringifyToolCallResult(direct)}`);
      }
      const text = stringifyToolCallResult(direct);
      if (!text.includes('MCP_ENABLE_UNSAFE_EDITOR_INVOKE=true') || !text.includes('__confirm: true')) {
        fail(`INV-02 expected enable instructions in error message, got:\n${text}`);
      }
      console.log('[INV-02] direct invokeStaticMethod blocked with instructions');
      return;
    }

    // INV-04: unsafe ON still requires __confirm
    const withoutConfirm = await client.callTool({
      name: 'unity.editor.invokeStaticMethod',
      arguments: {
        typeName: 'UniMCP4CC.Editor.McpMenuItemLister',
        methodName: 'ListMenuItemsBase64',
        parameters: ['MCP'],
      },
    });
    if (!withoutConfirm?.isError) {
      fail(`INV-04 expected invokeStaticMethod without __confirm to be blocked, but it succeeded:\n${stringifyToolCallResult(withoutConfirm)}`);
    }
    const blockedText = stringifyToolCallResult(withoutConfirm);
    if (!blockedText.includes('__confirm')) {
      fail(`INV-04 expected confirm-required message, got:\n${blockedText}`);
    }
    console.log('[INV-04] invokeStaticMethod requires __confirm even when enabled');

    const withConfirm = await client.callTool({
      name: 'unity.editor.invokeStaticMethod',
      arguments: {
        typeName: 'UniMCP4CC.Editor.McpMenuItemLister',
        methodName: 'ListMenuItemsBase64',
        parameters: ['MCP'],
        __confirm: true,
        __confirmNote: 'e2e-invoke-safety INV-04',
      },
    });
    if (withConfirm?.isError) {
      fail(`INV-04 invokeStaticMethod with __confirm failed:\n${stringifyToolCallResult(withConfirm)}`);
    }
    console.log('[INV-04] invokeStaticMethod executes with __confirm');
  } finally {
    await client.close().catch(() => {});
  }
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

  await runScenario({ unityHttpUrl, bridgeIndexPath, verbose: options.verbose, enableUnsafeInvoke: false });
  await runScenario({ unityHttpUrl, bridgeIndexPath, verbose: options.verbose, enableUnsafeInvoke: true });

  console.log('[E2E invoke safety] PASS');
}

main().catch((error) => {
  if (!process.exitCode) {
    process.exitCode = 1;
  }
  console.error(error?.stack || String(error));
});
