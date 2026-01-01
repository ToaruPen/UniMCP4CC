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
    // Back-compat: first positional arg is treated as project root.
    if (!options.unityProjectRoot) {
      options.unityProjectRoot = value;
      continue;
    }
    fail(`Unexpected argument: ${value}`);
  }

  return options;
}

function pickComponentAddTool(tools) {
  const exact = tools.find((tool) => tool.name === 'unity.component.add');
  if (exact) {
    return exact;
  }

  const candidates = tools.filter((tool) => /^unity\.component\./i.test(tool.name) && /add/i.test(tool.name));
  if (candidates.length === 1) {
    return candidates[0];
  }

  const withComponentTypeKey = candidates.filter((tool) => {
    const properties = tool?.inputSchema?.properties;
    return properties && typeof properties === 'object' && Object.prototype.hasOwnProperty.call(properties, 'componentType');
  });
  if (withComponentTypeKey.length === 1) {
    return withComponentTypeKey[0];
  }

  fail(
    `Unable to select a component-add tool.\n` +
      `Candidates:\n- ${candidates.map((tool) => tool.name).slice(0, 50).join('\n- ')}`
  );
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
    { name: 'unity-mcp-bridge-e2e-setreference', version: '1.0.0' },
    { capabilities: {} }
  );
  const transport = new StdioClientTransport({
    command: 'node',
    args: [bridgeIndexPath],
    env,
  });

  const runId = Date.now();
  const sourceName = `SR_Source_${runId}`;
  const targetName = `SR_Target_${runId}`;

  try {
    await client.connect(transport);

    const toolList = await client.listTools();
    const tools = toolList?.tools ?? [];

    const createTool = requireTool(tools, 'unity.create', /create/i);
    const addComponentTool = pickComponentAddTool(tools);
    const setReferenceTool = requireTool(tools, 'unity.component.setReference', /setreference/i);
    const destroyTool = requireSingleToolByFilter(
      tools,
      (tool) => /^unity\.(gameObject|gameobject)\./i.test(tool.name) && /destroy/i.test(tool.name),
      'GameObject destroy'
    );

    // SR-01: schema sanity
    const schema = setReferenceTool?.inputSchema;
    const properties = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {};
    const referenceTypeSchema = properties.referenceType;
    if (!referenceTypeSchema) {
      fail(`SR-01: setReference schema missing referenceType\n${JSON.stringify(schema, null, 2)}`);
    }
    if (typeof referenceTypeSchema?.description !== 'string' || referenceTypeSchema.description.trim().length === 0) {
      fail(`SR-01: referenceType needs a description\n${JSON.stringify(referenceTypeSchema, null, 2)}`);
    }
    const required = Array.isArray(schema?.required) ? schema.required : [];
    if (required.includes('referenceType')) {
      fail(`SR-01: referenceType should be optional (Bridge can infer it)\nrequired: ${required.join(', ')}`);
    }
    console.log('[SR-01] schema OK (referenceType documented and optional)');

    // Create target and source objects.
    const targetCreateArgs = buildArgsFromSchema(createTool, [
      { keys: ['primitiveType', 'type'], value: 'Cube' },
      { keys: ['name', 'gameObjectName', 'objectName'], value: targetName },
    ]);
    const targetCreate = await client.callTool({ name: createTool.name, arguments: targetCreateArgs });
    if (targetCreate?.isError) {
      fail(`Create target failed:\n${stringifyToolCallResult(targetCreate)}`);
    }

    const sourceCreateArgs = buildArgsFromSchema(createTool, [
      { keys: ['primitiveType', 'type'], value: 'Cube' },
      { keys: ['name', 'gameObjectName', 'objectName'], value: sourceName },
    ]);
    const sourceCreate = await client.callTool({ name: createTool.name, arguments: sourceCreateArgs });
    if (sourceCreate?.isError) {
      fail(`Create source failed:\n${stringifyToolCallResult(sourceCreate)}`);
    }

    // Add fixture component to source.
    const addFixtureArgs = buildArgsFromSchema(addComponentTool, [
      { keys: ['path', 'gameObjectPath', 'hierarchyPath'], value: sourceName },
      { keys: ['componentType', 'type', 'name'], value: 'SetReferenceFixture' },
    ]);
    const addFixtureResult = await client.callTool({ name: addComponentTool.name, arguments: addFixtureArgs });
    if (addFixtureResult?.isError) {
      fail(
        `Add SetReferenceFixture failed.\n` +
          `Ensure the Unity project contains a MonoBehaviour named SetReferenceFixture.\n\n` +
          `${stringifyToolCallResult(addFixtureResult)}`
      );
    }
    console.log('[Setup] Added SetReferenceFixture');

    // SR-02: GameObject reference (referenceType omitted)
    const sr02Args = buildArgsFromSchema(
      setReferenceTool,
      [
        { keys: ['path', 'gameObjectPath', 'hierarchyPath'], value: sourceName },
        { keys: ['componentType', 'type'], value: 'SetReferenceFixture' },
        { keys: ['fieldName', 'propertyName', 'memberName'], value: 'target' },
        { keys: ['referencePath', 'targetPath', 'refPath'], value: targetName },
      ],
      { allowPartial: true }
    );
    const sr02 = await client.callTool({ name: setReferenceTool.name, arguments: sr02Args });
    if (sr02?.isError) {
      fail(`SR-02 setReference (GameObject) failed:\n${stringifyToolCallResult(sr02)}`);
    }
    console.log('[SR-02] GameObject reference set (referenceType omitted)');

    const sr02Payload = extractLastJson(sr02);
    const sr02Text = stringifyToolCallResult(sr02);
    if (sr02Payload?.referenceName !== targetName && !sr02Text.includes(targetName)) {
      fail(
        `SR-02 expected setReference result to include "${targetName}" but got:\n` +
          `${sr02Text}\n\nParsed JSON:\n${JSON.stringify(sr02Payload, null, 2)}`
      );
    }
    console.log('[SR-02] Verified referenceName points to SR_Target');

    // SR-03: Component reference (Transform), referenceType omitted
    const sr03Args = buildArgsFromSchema(
      setReferenceTool,
      [
        { keys: ['path', 'gameObjectPath', 'hierarchyPath'], value: sourceName },
        { keys: ['componentType', 'type'], value: 'SetReferenceFixture' },
        { keys: ['fieldName', 'propertyName', 'memberName'], value: 'targetTransform' },
        { keys: ['referencePath', 'targetPath', 'refPath'], value: targetName },
      ],
      { allowPartial: true }
    );
    const sr03 = await client.callTool({ name: setReferenceTool.name, arguments: sr03Args });
    if (sr03?.isError) {
      fail(`SR-03 setReference (Component) failed:\n${stringifyToolCallResult(sr03)}`);
    }
    console.log('[SR-03] Component reference set (referenceType omitted)');

    const sr03Payload = extractLastJson(sr03);
    const sr03Text = stringifyToolCallResult(sr03);
    if (sr03Payload?.referenceName !== targetName && !sr03Text.includes(targetName)) {
      fail(
        `SR-03 expected setReference result to include "${targetName}" but got:\n` +
          `${sr03Text}\n\nParsed JSON:\n${JSON.stringify(sr03Payload, null, 2)}`
      );
    }
    console.log('[SR-03] Verified referenceName points to SR_Target');

    // SR-04: explicit referenceType is not overridden (invalid value should fail)
    const sr04Args = buildArgsFromSchema(
      setReferenceTool,
      [
        { keys: ['path', 'gameObjectPath', 'hierarchyPath'], value: sourceName },
        { keys: ['componentType', 'type'], value: 'SetReferenceFixture' },
        { keys: ['fieldName', 'propertyName', 'memberName'], value: 'target' },
        { keys: ['referencePath', 'targetPath', 'refPath'], value: targetName },
        { keys: ['referenceType', 'reference_type'], value: 'not-a-valid-type' },
      ],
      { allowPartial: true }
    );
    const sr04 = await client.callTool({ name: setReferenceTool.name, arguments: sr04Args });
    if (!sr04?.isError) {
      fail(`SR-04 expected explicit invalid referenceType to fail, but it succeeded:\n${stringifyToolCallResult(sr04)}`);
    }
    console.log('[SR-04] Explicit invalid referenceType correctly fails (Bridge does not override)');

    // SR-05: error shaping (missing referencePath)
    const sr05Args = buildArgsFromSchema(
      setReferenceTool,
      [
        { keys: ['path', 'gameObjectPath', 'hierarchyPath'], value: sourceName },
        { keys: ['componentType', 'type'], value: 'SetReferenceFixture' },
        { keys: ['fieldName', 'propertyName', 'memberName'], value: 'target' },
        { keys: ['referencePath', 'targetPath', 'refPath'], value: '' },
      ],
      { allowPartial: true }
    );
    const sr05 = await client.callTool({ name: setReferenceTool.name, arguments: sr05Args });
    if (!sr05?.isError) {
      fail(`SR-05 expected missing referencePath to fail, but it succeeded:\n${stringifyToolCallResult(sr05)}`);
    }
    const sr05Text = stringifyToolCallResult(sr05);
    if (!sr05Text.includes('Missing/invalid keys') || !sr05Text.includes('referencePath')) {
      fail(`SR-05 expected guidance to mention referencePath:\n${sr05Text}`);
    }
    console.log('[SR-05] Missing-key guidance OK');

    // Cleanup
    const destroyArgs = buildArgsFromSchema(destroyTool, [{ keys: ['path', 'gameObjectPath', 'hierarchyPath'], value: sourceName }]);
    await client.callTool({ name: destroyTool.name, arguments: { ...destroyArgs, __confirm: true, __confirmNote: 'e2e-setreference cleanup' } }).catch(() => {});
    const destroyArgs2 = buildArgsFromSchema(destroyTool, [{ keys: ['path', 'gameObjectPath', 'hierarchyPath'], value: targetName }]);
    await client.callTool({ name: destroyTool.name, arguments: { ...destroyArgs2, __confirm: true, __confirmNote: 'e2e-setreference cleanup' } }).catch(() => {});

    console.log('[E2E setReference] PASS');
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
