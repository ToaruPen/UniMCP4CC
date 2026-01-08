#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const util = await import(pathToFileURL(path.join(process.cwd(), 'scripts/_e2eUtil.js')));
const {
  buildArgsFromSchema,
  buildBridgeEnv,
  extractLastJson,
  fail,
  readRuntimeConfig,
  requireSingleToolByFilter,
  requireTool,
  stringifyToolCallResult,
} = util;

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

function ensureNoMissingRequired(tool, args, label) {
  const required = Array.isArray(tool?.inputSchema?.required) ? tool.inputSchema.required : [];
  const missing = required.filter((key) => !Object.prototype.hasOwnProperty.call(args, key));
  if (missing.length > 0) {
    fail(`${label} missing required args: ${missing.join(', ')}`);
  }
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

function flattenSceneNodes(rootObjects) {
  const nodes = [];
  const stack = Array.isArray(rootObjects) ? [...rootObjects] : [];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') {
      continue;
    }
    nodes.push(node);
    if (Array.isArray(node.children) && node.children.length > 0) {
      stack.push(...node.children);
    }
  }
  return nodes;
}

async function callToolExpectOk(client, tool, args, label) {
  const result = await client.callTool({ name: tool.name, arguments: args });
  if (result?.isError) {
    fail(`${label} failed:\n${stringifyToolCallResult(result)}`);
  }
  return result;
}

async function callToolAllowExists(client, tool, args, label) {
  const result = await client.callTool({ name: tool.name, arguments: args });
  if (!result?.isError) {
    return result;
  }
  const text = stringifyToolCallResult(result);
  if (/already exists/i.test(text)) {
    console.log(`[Skip] ${label}: already exists`);
    return result;
  }
  fail(`${label} failed:\n${text}`);
}

function buildRunContext(runId) {
  const rootFolder = 'Assets/McpManual';
  const sceneFolder = `${rootFolder}/Scenes`;
  const prefabFolder = `${rootFolder}/Prefabs`;
  const materialFolder = `${rootFolder}/Materials`;

  const sceneName = `McpManualScene_${runId}`;
  const scenePath = `${sceneFolder}/${sceneName}.unity`;

  const rootName = `McpRoot_${runId}`;
  const environmentName = `McpEnvironment_${runId}`;
  const actorsName = `McpActors_${runId}`;
  const runtimeName = `McpRuntime_${runId}`;

  const playerName = `McpPlayer_${runId}`;
  const enemyName = `McpEnemy_${runId}`;
  const emptyMarkerName = `McpEmpty_${runId}`;
  const tempDeleteName = `McpTemp_Delete_${runId}`;
  const referencesName = `McpReferences_${runId}`;

  const playerPrefabPath = `${prefabFolder}/${playerName}.prefab`;
  const materialPath = `${materialFolder}/McpManualMat_${runId}.mat`;
  const tempMaterialPath = `${materialFolder}/McpTempMat_${runId}.mat`;

  return {
    runId,
    rootFolder,
    sceneFolder,
    prefabFolder,
    materialFolder,
    sceneName,
    scenePath,
    rootName,
    environmentName,
    actorsName,
    runtimeName,
    playerName,
    enemyName,
    emptyMarkerName,
    tempDeleteName,
    referencesName,
    playerPrefabPath,
    materialPath,
    tempMaterialPath,
  };
}

function resolveTools(tools) {
  const assetCreateFolderTool = requireTool(tools, 'unity.asset.createFolder', /asset\.createFolder/i);
  const assetListTool = requireTool(tools, 'unity.asset.list', /asset\.list/i);
  const assetFindTool = requireTool(tools, 'unity.asset.find', /asset\.find/i);
  const assetDeleteTool = requireTool(tools, 'unity.asset.delete', /asset\.delete/i);
  const assetCreateMaterialTool = requireTool(tools, 'unity.asset.createMaterial', /asset\.createMaterial/i);

  const sceneNewTool = requireTool(tools, 'unity.scene.new', /^unity\.scene\.(new|create)$/i);
  const sceneSaveTool = requireTool(tools, 'unity.scene.save', /^unity\.scene\.save$/i);
  const sceneOpenTool = requireTool(tools, 'unity.scene.open', /^unity\.scene\.open$/i);
  const sceneListTool = requireTool(tools, 'unity.scene.list', /^unity\.scene\.list$/i);

  const createTool = requireTool(tools, 'unity.create', /create/i);
  const createEmptySafeTool = tools.find((tool) => tool.name === 'unity.gameObject.createEmptySafe') ?? null;

  const setParentTool =
    tools.find((tool) => /^unity\.(gameObject|gameobject)\./i.test(tool.name) && /setParent/i.test(tool.name)) ??
    tools.find((tool) => /^unity\.transform\./i.test(tool.name) && /setParent/i.test(tool.name));
  if (!setParentTool) {
    fail('Unable to find a setParent tool (unity.gameObject.setParent or unity.transform.setParent).');
  }

  const setPositionTool =
    tools.find((tool) => /^unity\.transform\./i.test(tool.name) && /setPosition/i.test(tool.name)) ??
    requireSingleToolByFilter(tools, (tool) => /setPosition/i.test(tool.name), 'transform setPosition');

  const addComponentTool = pickComponentAddTool(tools);
  const setSerializedPropertyTool = requireTool(tools, 'unity.component.setSerializedProperty', /setserializedproperty/i);
  const setReferenceTool = requireTool(tools, 'unity.component.setReference', /setreference/i);

  const prefabCreateTool = requireTool(tools, 'unity.prefab.create', /^unity\.prefab\.create$/i);

  const destroyTool = requireSingleToolByFilter(
    tools,
    (tool) => /^unity\.(gameObject|gameobject)\./i.test(tool.name) && /destroy/i.test(tool.name),
    'GameObject destroy'
  );

  return {
    assetCreateFolderTool,
    assetListTool,
    assetFindTool,
    assetDeleteTool,
    assetCreateMaterialTool,
    sceneNewTool,
    sceneSaveTool,
    sceneOpenTool,
    sceneListTool,
    createTool,
    createEmptySafeTool,
    setParentTool,
    setPositionTool,
    addComponentTool,
    setSerializedPropertyTool,
    setReferenceTool,
    prefabCreateTool,
    destroyTool,
  };
}

function buildSceneSaveArgs(sceneSaveTool, scenePath) {
  const sceneSaveArgs = buildArgsFromSchema(
    sceneSaveTool,
    [{ keys: ['scenePath', 'path'], value: scenePath }],
    { allowPartial: true }
  );
  ensureNoMissingRequired(sceneSaveTool, sceneSaveArgs, 'scene.save');
  return sceneSaveArgs;
}

function buildSceneOpenArgs(sceneOpenTool, scenePath) {
  const sceneOpenArgs = buildArgsFromSchema(
    sceneOpenTool,
    [
      { keys: ['scenePath', 'path'], value: scenePath },
      { keys: ['additive'], value: false, optional: true },
    ],
    { allowPartial: true }
  );
  ensureNoMissingRequired(sceneOpenTool, sceneOpenArgs, 'scene.open');
  return sceneOpenArgs;
}

async function setParentWithTool(client, setParentTool, child, parent) {
  const args = buildArgsFromSchema(
    setParentTool,
    [
      { keys: ['path', 'gameObjectPath', 'childPath', 'targetPath'], value: child },
      { keys: ['parentPath', 'newParentPath', 'parent'], value: parent },
    ],
    { allowPartial: true }
  );
  ensureNoMissingRequired(setParentTool, args, 'setParent');
  await callToolExpectOk(client, setParentTool, args, `setParent ${child} -> ${parent}`);
}

async function stepFolderStructure(client, toolset, context) {
  console.log('[Step] Folder structure');
  const folders = [context.rootFolder, context.sceneFolder, context.prefabFolder, context.materialFolder];
  for (const folderPath of folders) {
    const parent = path.posix.dirname(folderPath);
    const name = path.posix.basename(folderPath);
    const props = toolset.assetCreateFolderTool?.inputSchema?.properties ?? {};
    let createArgs = {};
    if (props.path) {
      createArgs = { path: folderPath };
    } else {
      const args = [];
      if (props.parentFolder) {
        args.push({ keys: ['parentFolder'], value: parent });
      } else if (props.parentPath) {
        args.push({ keys: ['parentPath'], value: parent });
      }
      if (props.newFolderName) {
        args.push({ keys: ['newFolderName'], value: name });
      } else if (props.name) {
        args.push({ keys: ['name'], value: name });
      } else if (props.folderName) {
        args.push({ keys: ['folderName'], value: name });
      }
      createArgs = buildArgsFromSchema(toolset.assetCreateFolderTool, args, { allowPartial: true });
      ensureNoMissingRequired(toolset.assetCreateFolderTool, createArgs, 'asset.createFolder');
    }
    await callToolAllowExists(client, toolset.assetCreateFolderTool, createArgs, `Create folder ${folderPath}`);
  }
}

async function stepSceneCreateAndSave(client, toolset, context, sceneSaveArgs) {
  console.log('[Step] Scene create + save');
  const sceneNewArgs = buildArgsFromSchema(
    toolset.sceneNewTool,
    [
      { keys: ['sceneName', 'name'], value: context.sceneName },
      { keys: ['savePath'], value: context.sceneFolder, optional: true },
      { keys: ['setupType'], value: 'DefaultGameObjects', optional: true },
    ],
    { allowPartial: true }
  );
  ensureNoMissingRequired(toolset.sceneNewTool, sceneNewArgs, 'scene.new');
  await callToolExpectOk(client, toolset.sceneNewTool, sceneNewArgs, 'scene.new');
  await callToolExpectOk(client, toolset.sceneSaveTool, sceneSaveArgs, 'scene.save');
}

async function stepCreateHierarchy(client, toolset, context) {
  console.log('[Step] Create hierarchy');
  async function createEmpty(name) {
    if (toolset.createEmptySafeTool) {
      const args = buildArgsFromSchema(toolset.createEmptySafeTool, [{ keys: ['name'], value: name }], { allowPartial: true });
      ensureNoMissingRequired(toolset.createEmptySafeTool, args, 'createEmptySafe');
      await callToolExpectOk(client, toolset.createEmptySafeTool, args, `createEmptySafe ${name}`);
      return;
    }
    fail('createEmptySafe not available; cannot create empty GameObject safely.');
  }

  await createEmpty(context.rootName);
  await createEmpty(context.environmentName);
  await createEmpty(context.actorsName);
  await createEmpty(context.runtimeName);
  await createEmpty(context.emptyMarkerName);
  await createEmpty(context.referencesName);

  await setParentWithTool(client, toolset.setParentTool, context.environmentName, context.rootName);
  await setParentWithTool(client, toolset.setParentTool, context.actorsName, context.rootName);
  await setParentWithTool(client, toolset.setParentTool, context.runtimeName, context.rootName);
  await setParentWithTool(client, toolset.setParentTool, context.emptyMarkerName, context.runtimeName);
  await setParentWithTool(client, toolset.setParentTool, context.referencesName, context.runtimeName);
}

async function stepCreateObjectsAndPlace(client, toolset, context) {
  console.log('[Step] Create objects + place');
  const createPlayerArgs = buildArgsFromSchema(toolset.createTool, [
    { keys: ['primitiveType', 'type'], value: 'Cube' },
    { keys: ['name', 'gameObjectName', 'objectName'], value: context.playerName },
  ]);
  await callToolExpectOk(client, toolset.createTool, createPlayerArgs, 'create player');
  await setParentWithTool(client, toolset.setParentTool, context.playerName, context.actorsName);

  const createEnemyArgs = buildArgsFromSchema(toolset.createTool, [
    { keys: ['primitiveType', 'type'], value: 'Sphere' },
    { keys: ['name', 'gameObjectName', 'objectName'], value: context.enemyName },
  ]);
  await callToolExpectOk(client, toolset.createTool, createEnemyArgs, 'create enemy');
  await setParentWithTool(client, toolset.setParentTool, context.enemyName, context.actorsName);

  const setPlayerPosArgs = buildArgsFromSchema(
    toolset.setPositionTool,
    [
      { keys: ['path', 'gameObjectPath', 'targetPath'], value: context.playerName },
      { keys: ['x'], value: 0 },
      { keys: ['y'], value: 0 },
      { keys: ['z'], value: 0 },
    ],
    { allowPartial: true }
  );
  ensureNoMissingRequired(toolset.setPositionTool, setPlayerPosArgs, 'setPosition');
  await callToolExpectOk(client, toolset.setPositionTool, setPlayerPosArgs, 'setPosition player');

  const setEnemyPosArgs = buildArgsFromSchema(
    toolset.setPositionTool,
    [
      { keys: ['path', 'gameObjectPath', 'targetPath'], value: context.enemyName },
      { keys: ['x'], value: 3 },
      { keys: ['y'], value: 0 },
      { keys: ['z'], value: 0 },
    ],
    { allowPartial: true }
  );
  ensureNoMissingRequired(toolset.setPositionTool, setEnemyPosArgs, 'setPosition');
  await callToolExpectOk(client, toolset.setPositionTool, setEnemyPosArgs, 'setPosition enemy');
}

async function stepAddComponentsAndEditData(client, toolset, context) {
  console.log('[Step] Add components + edit data');
  const addRigidbodyArgs = buildArgsFromSchema(
    toolset.addComponentTool,
    [
      { keys: ['path', 'gameObjectPath', 'hierarchyPath'], value: context.playerName },
      { keys: ['componentType', 'type', 'name'], value: 'Rigidbody' },
    ],
    { allowPartial: true }
  );
  await callToolExpectOk(client, toolset.addComponentTool, addRigidbodyArgs, 'add Rigidbody');

  const addCompileTestArgs = buildArgsFromSchema(
    toolset.addComponentTool,
    [
      { keys: ['path', 'gameObjectPath', 'hierarchyPath'], value: context.playerName },
      { keys: ['componentType', 'type', 'name'], value: 'McpCompileTest' },
    ],
    { allowPartial: true }
  );
  await callToolExpectOk(client, toolset.addComponentTool, addCompileTestArgs, 'add McpCompileTest');

  const setValueArgs = buildArgsFromSchema(
    toolset.setSerializedPropertyTool,
    [
      { keys: ['gameObjectPath', 'path'], value: context.playerName },
      { keys: ['componentType', 'type'], value: 'McpCompileTest' },
      { keys: ['propertyPath', 'fieldPath'], value: 'Value' },
      { keys: ['value'], value: '42' },
    ],
    { allowPartial: true }
  );
  await callToolExpectOk(client, toolset.setSerializedPropertyTool, setValueArgs, 'set McpCompileTest.Value');

  const addReferenceArgs = buildArgsFromSchema(
    toolset.addComponentTool,
    [
      { keys: ['path', 'gameObjectPath', 'hierarchyPath'], value: context.referencesName },
      { keys: ['componentType', 'type', 'name'], value: 'SetReferenceFixture' },
    ],
    { allowPartial: true }
  );
  await callToolExpectOk(client, toolset.addComponentTool, addReferenceArgs, 'add SetReferenceFixture');
}

async function stepCreateAssetsAndReferences(client, toolset, context) {
  console.log('[Step] Create assets + references');
  const createMaterialArgs = buildArgsFromSchema(toolset.assetCreateMaterialTool, [
    { keys: ['path', 'assetPath'], value: context.materialPath },
  ]);
  await callToolExpectOk(client, toolset.assetCreateMaterialTool, createMaterialArgs, 'create material');

  const createTempMaterialArgs = buildArgsFromSchema(toolset.assetCreateMaterialTool, [
    { keys: ['path', 'assetPath'], value: context.tempMaterialPath },
  ]);
  await callToolExpectOk(client, toolset.assetCreateMaterialTool, createTempMaterialArgs, 'create temp material');

  const setTargetRefArgs = buildArgsFromSchema(
    toolset.setReferenceTool,
    [
      { keys: ['path', 'gameObjectPath', 'hierarchyPath'], value: context.referencesName },
      { keys: ['componentType', 'type'], value: 'SetReferenceFixture' },
      { keys: ['fieldName', 'propertyName', 'memberName'], value: 'target' },
      { keys: ['referencePath', 'targetPath', 'refPath'], value: context.playerName },
    ],
    { allowPartial: true }
  );
  await callToolExpectOk(client, toolset.setReferenceTool, setTargetRefArgs, 'set SetReferenceFixture.target');

  const setMaterialRefArgs = buildArgsFromSchema(
    toolset.setReferenceTool,
    [
      { keys: ['path', 'gameObjectPath', 'hierarchyPath'], value: context.referencesName },
      { keys: ['componentType', 'type'], value: 'SetReferenceFixture' },
      { keys: ['fieldName', 'propertyName', 'memberName'], value: 'material' },
      { keys: ['referencePath', 'targetPath', 'refPath'], value: context.materialPath },
    ],
    { allowPartial: true }
  );
  await callToolExpectOk(client, toolset.setReferenceTool, setMaterialRefArgs, 'set SetReferenceFixture.material');
}

async function stepPrefabCreate(client, toolset, context) {
  console.log('[Step] Prefab create');
  const prefabCreateArgs = buildArgsFromSchema(
    toolset.prefabCreateTool,
    [
      { keys: ['gameObjectPath', 'path'], value: context.playerName },
      { keys: ['prefabPath', 'path'], value: context.playerPrefabPath },
    ],
    { allowPartial: true }
  );
  await callToolExpectOk(client, toolset.prefabCreateTool, prefabCreateArgs, 'prefab.create');
}

async function stepFileSearchList(client, toolset, context) {
  console.log('[Step] File search / list');
  const listArgs = buildArgsFromSchema(
    toolset.assetListTool,
    [
      { keys: ['path', 'assetPath', 'folder'], value: context.rootFolder },
      { keys: ['assetType'], value: 'Object' },
      { keys: ['recursive', 'includeSubfolders', 'deep'], value: true, optional: true },
    ],
    { allowPartial: true }
  );
  const listResult = await callToolExpectOk(client, toolset.assetListTool, listArgs, 'asset.list');
  const listPayload = extractLastJson(listResult);
  console.log('[asset.list] entries:', Array.isArray(listPayload?.assets) ? listPayload.assets.length : 'unknown');

  const findSceneArgs = buildArgsFromSchema(
    toolset.assetFindTool,
    [{ keys: ['path', 'assetPath'], value: context.scenePath }],
    { allowPartial: true }
  );
  await callToolExpectOk(client, toolset.assetFindTool, findSceneArgs, 'asset.find scene');

  const findPrefabArgs = buildArgsFromSchema(
    toolset.assetFindTool,
    [{ keys: ['path', 'assetPath'], value: context.playerPrefabPath }],
    { allowPartial: true }
  );
  await callToolExpectOk(client, toolset.assetFindTool, findPrefabArgs, 'asset.find prefab');
}

async function stepEmptyGameObjectSearch(client, toolset, context) {
  console.log('[Step] Empty GameObject search');
  const sceneListArgs = buildArgsFromSchema(
    toolset.sceneListTool,
    [{ keys: ['maxDepth'], value: 50, optional: true }],
    { allowPartial: true }
  );
  const sceneListResult = await callToolExpectOk(client, toolset.sceneListTool, sceneListArgs, 'scene.list');
  const scenePayload = extractLastJson(sceneListResult);
  const rootObjects = scenePayload?.rootObjects ?? scenePayload?.objects ?? [];
  const nodes = flattenSceneNodes(rootObjects);
  const emptyObjects = nodes.filter((node) => Array.isArray(node.components) && node.components.length === 1 && node.components[0] === 'Transform');
  const emptyLeaf = emptyObjects.filter((node) => {
    const childCount = Number.isFinite(node.childCount) ? node.childCount : Array.isArray(node.children) ? node.children.length : 0;
    return childCount === 0;
  });
  const emptyNames = emptyLeaf.map((node) => node.path ?? node.name ?? '(unnamed)');
  console.log('[Empty objects] count:', emptyLeaf.length);
  console.log('[Empty objects] sample:', emptyNames.slice(0, 10));
  if (!emptyNames.some((name) => String(name).includes(context.emptyMarkerName))) {
    fail(`Expected empty marker ${context.emptyMarkerName} to be listed in empty GameObject search.`);
  }
}

async function stepDeleteTempObjects(client, toolset, context) {
  console.log('[Step] Delete temp objects / files');
  const createTempArgs = buildArgsFromSchema(toolset.createTool, [
    { keys: ['primitiveType', 'type'], value: 'Cube' },
    { keys: ['name', 'gameObjectName', 'objectName'], value: context.tempDeleteName },
  ]);
  await callToolExpectOk(client, toolset.createTool, createTempArgs, 'create temp delete object');
  await setParentWithTool(client, toolset.setParentTool, context.tempDeleteName, context.runtimeName);

  const destroyTempArgs = buildArgsFromSchema(
    toolset.destroyTool,
    [{ keys: ['path', 'gameObjectPath', 'hierarchyPath'], value: context.tempDeleteName }],
    { allowPartial: true }
  );
  await client.callTool({
    name: toolset.destroyTool.name,
    arguments: { ...destroyTempArgs, __confirm: true, __confirmNote: 'manual ops delete temp object' },
  });

  const deleteMatArgs = buildArgsFromSchema(
    toolset.assetDeleteTool,
    [{ keys: ['path', 'assetPath'], value: context.tempMaterialPath }],
    { allowPartial: true }
  );
  await client.callTool({
    name: toolset.assetDeleteTool.name,
    arguments: { ...deleteMatArgs, __confirm: true, __confirmNote: 'manual ops delete temp material' },
  });
}

async function stepSaveScene(client, toolset, sceneSaveArgs) {
  console.log('[Step] Save scene');
  await callToolExpectOk(client, toolset.sceneSaveTool, sceneSaveArgs, 'scene.save');
}

async function stepOptionalOpenScene(client, toolset, sceneOpenArgs) {
  console.log('[Step] Optional: open scene to verify');
  await callToolExpectOk(client, toolset.sceneOpenTool, sceneOpenArgs, 'scene.open');
}

async function main() {
  const options = parseArgs(process.argv);
  if (!options.unityProjectRoot && !options.unityHttpUrl) {
    fail(`Provide --project "/path/to/UnityProject" (or set UNITY_HTTP_URL).`);
  }

  let unityHttpUrl = options.unityHttpUrl;
  if (!unityHttpUrl) {
    const runtime = readRuntimeConfig(options.unityProjectRoot);
    unityHttpUrl = runtime.httpUrl;
  }

  const env = buildBridgeEnv({ unityHttpUrl, verbose: options.verbose });
  const bridgeIndexPath = path.resolve('index.js');

  const client = new Client({ name: 'unity-mcp-manual-ops', version: '1.0.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: 'node', args: [bridgeIndexPath], env });

  const runContext = buildRunContext(Date.now());

  try {
    await client.connect(transport);

    const toolList = await client.listTools();
    const tools = toolList?.tools ?? [];
    const toolset = resolveTools(tools);
    const sceneSaveArgs = buildSceneSaveArgs(toolset.sceneSaveTool, runContext.scenePath);
    const sceneOpenArgs = buildSceneOpenArgs(toolset.sceneOpenTool, runContext.scenePath);

    await stepFolderStructure(client, toolset, runContext);
    await stepSceneCreateAndSave(client, toolset, runContext, sceneSaveArgs);
    await stepCreateHierarchy(client, toolset, runContext);
    await stepCreateObjectsAndPlace(client, toolset, runContext);
    await stepAddComponentsAndEditData(client, toolset, runContext);
    await stepCreateAssetsAndReferences(client, toolset, runContext);
    await stepPrefabCreate(client, toolset, runContext);
    await stepFileSearchList(client, toolset, runContext);
    await stepEmptyGameObjectSearch(client, toolset, runContext);
    await stepDeleteTempObjects(client, toolset, runContext);
    await stepSaveScene(client, toolset, sceneSaveArgs);
    await stepOptionalOpenScene(client, toolset, sceneOpenArgs);

    console.log('[Manual ops] PASS');
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
