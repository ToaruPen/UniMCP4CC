import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

export const RUNTIME_CONFIG_FILENAME = '.unity-mcp-runtime.json';

export function fail(message) {
  console.error(message);
  process.exitCode = 1;
  throw new Error(message);
}

export function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function readRuntimeConfig(unityProjectRoot, runtimeConfigFileName = RUNTIME_CONFIG_FILENAME) {
  const runtimePath = path.join(unityProjectRoot, runtimeConfigFileName);
  if (!fs.existsSync(runtimePath)) {
    fail(
      `Runtime config not found: ${runtimePath}\n` +
        `Open Unity once so the MCP server writes ${runtimeConfigFileName}.`
    );
  }

  const parsed = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
  const httpPort = Number(parsed.httpPort);
  if (!Number.isFinite(httpPort) || httpPort <= 0) {
    fail(`Invalid httpPort in ${runtimePath}`);
  }

  return {
    httpUrl: `http://localhost:${httpPort}`,
    httpPort,
    runtimePath,
    parsed,
  };
}

export function stringifyToolCallResult(result) {
  const parts = [];
  for (const item of result?.content ?? []) {
    if (item?.type === 'text' && typeof item.text === 'string') {
      parts.push(item.text);
    } else {
      parts.push(JSON.stringify(item, null, 2));
    }
  }
  return parts.join('\n');
}

export function extractLastJson(result) {
  const parts = [];
  for (const item of result?.content ?? []) {
    if (item?.type === 'text' && typeof item.text === 'string') {
      parts.push(item.text);
    }
  }

  for (let i = parts.length - 1; i >= 0; i--) {
    const text = parts[i].trim();
    if (!text.startsWith('{') && !text.startsWith('[')) {
      continue;
    }
    try {
      return JSON.parse(text);
    } catch {
      continue;
    }
  }

  return null;
}

export function requireTool(tools, expectedName, hintPattern) {
  const match = tools.find((tool) => tool.name === expectedName);
  if (match) {
    return match;
  }

  const candidates = hintPattern
    ? tools.filter((tool) => hintPattern.test(tool.name)).map((tool) => tool.name)
    : tools.map((tool) => tool.name);

  fail(
    `Tool not found: ${expectedName}\n` +
      `Available candidates:\n- ${candidates.slice(0, 50).join('\n- ')}`
  );
}

export function requireSingleToolByFilter(tools, filter, label) {
  const matches = tools.filter(filter);
  if (matches.length === 1) {
    return matches[0];
  }
  const names = matches.map((tool) => tool.name);
  fail(
    `Expected exactly 1 tool for ${label}, but found ${matches.length}.\n` +
      `Matches:\n- ${names.slice(0, 50).join('\n- ')}`
  );
}

export function buildArgsFromSchema(tool, desired, { allowPartial = false } = {}) {
  const schema = tool?.inputSchema;
  const properties = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {};
  const required = Array.isArray(schema?.required) ? schema.required : [];

  const args = {};
  for (const entry of desired) {
    const { keys, value, optional } = entry;
    const key = keys.find((candidate) => Object.prototype.hasOwnProperty.call(properties, candidate)) ?? null;
    if (!key) {
      if (optional) {
        continue;
      }
      fail(`Tool ${tool.name} does not expose any of these input keys: ${keys.join(', ')}`);
    }
    args[key] = value;
  }

  if (!allowPartial) {
    const missing = required.filter((key) => !Object.prototype.hasOwnProperty.call(args, key));
    if (missing.length > 0) {
      fail(`Tool ${tool.name} requires missing args: ${missing.join(', ')}`);
    }
  }

  return args;
}

export function selectBooleanArgKey(tool, preferredKeys) {
  const schema = tool?.inputSchema;
  const properties = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {};

  for (const key of preferredKeys) {
    if (properties?.[key]?.type === 'boolean') {
      return key;
    }
  }

  const booleanKeys = Object.entries(properties)
    .filter(([, value]) => value?.type === 'boolean')
    .map(([key]) => key);

  if (booleanKeys.length === 1) {
    return booleanKeys[0];
  }

  fail(
    `Tool ${tool.name} needs an active flag, but boolean keys are ambiguous.\n` +
      `Boolean keys: ${booleanKeys.join(', ')}`
  );
}

export function pruneUndefinedEnv(env) {
  const next = { ...(env && typeof env === 'object' ? env : {}) };
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) {
      delete next[key];
    }
  }
  return next;
}

export function buildBridgeEnv({ unityHttpUrl, verbose, extraEnv } = {}) {
  return pruneUndefinedEnv({
    ...getDefaultEnvironment(),
    UNITY_HTTP_URL: unityHttpUrl ?? undefined,
    MCP_VERBOSE: verbose ? 'true' : undefined,
    ...(extraEnv && typeof extraEnv === 'object' ? extraEnv : {}),
  });
}

export function resolveBridgeIndexPath(scriptImportMetaUrl) {
  return fileURLToPath(new URL('../index.js', scriptImportMetaUrl));
}
