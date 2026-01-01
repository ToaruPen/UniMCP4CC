export function patchUnityToolSchemas(unityTools) {
  const uiToolkitRuntimeSelectorToolNames = new Set([
    'unity.uitoolkit.runtime.setElementText',
    'unity.uitoolkit.runtime.setElementValue',
    'unity.uitoolkit.runtime.setElementVisibility',
    'unity.uitoolkit.runtime.setElementEnabled',
    'unity.uitoolkit.runtime.addRuntimeClass',
    'unity.uitoolkit.runtime.removeRuntimeClass',
  ]);

  return (unityTools || []).map((tool) => {
    if (!tool || typeof tool !== 'object') {
      return tool;
    }

    const name = typeof tool.name === 'string' ? tool.name : '';
    const nameLower = name.toLowerCase();
    let optionalNote = '';
    if (nameLower.startsWith('unity.cinemachine.')) {
      optionalNote = '[Optional] 依存パッケージ: com.unity.cinemachine (Cinemachine). 未導入の場合は呼び出しが失敗します。';
    } else if (nameLower.startsWith('unity.inputsystem.')) {
      optionalNote = '[Optional] 依存パッケージ: com.unity.inputsystem (Input System). 未導入の場合は呼び出しが失敗します。';
    } else if (nameLower.startsWith('unity.probuilder.')) {
      optionalNote = '[Optional] 依存パッケージ: com.unity.probuilder (ProBuilder). 未導入の場合は呼び出しが失敗します。';
    } else if (nameLower.startsWith('unity.recorder.')) {
      optionalNote = '[Optional] 依存パッケージ: com.unity.recorder (Recorder). 未導入の場合は呼び出しが失敗します。';
    } else if (nameLower.startsWith('unity.shadergraph.')) {
      optionalNote = '[Optional] 依存パッケージ: com.unity.shadergraph (Shader Graph). 未導入の場合は呼び出しが失敗します。';
    } else if (nameLower.startsWith('unity.timeline.')) {
      optionalNote = '[Optional] 依存パッケージ: com.unity.timeline (Timeline). 未導入の場合は呼び出しが失敗します。';
    } else if (nameLower.startsWith('unity.compositing.')) {
      optionalNote = '[Optional] 依存拡張: LocalMcp.UnityServer.Compositing.Editor. 未導入の場合は呼び出しが失敗します。';
    } else if (nameLower.startsWith('unity.volume.')) {
      optionalNote = '[Optional] 依存拡張: LocalMcp.UnityServer.Volume.Editor. 未導入の場合は呼び出しが失敗します。';
    } else if (nameLower.startsWith('unity.uitoolkit.')) {
      optionalNote =
        '[Optional] 依存拡張: LocalMcp.UnityServer.UIToolkit.Editor（Samples: UIToolkit Extension を Import）. 未導入の場合は呼び出しが失敗します。';
    } else if (nameLower.startsWith('unity.textmeshpro.')) {
      optionalNote = '[Optional] 依存パッケージ: TextMeshPro. 未導入の場合は呼び出しが失敗します。';
    } else if (nameLower.startsWith('unity.import.')) {
      optionalNote =
        "[Optional] 依存拡張: LocalMcp.UnityServer.AssetImport.Editor. 未導入の場合は呼び出しが失敗します（代替: unity.assetImport.setTextureType）。";
    }

    let nextTool = tool;
    if (optionalNote) {
      const currentDescription = typeof tool.description === 'string' ? tool.description.trim() : '';
      const alreadyAnnotated = currentDescription.includes(optionalNote);
      if (!alreadyAnnotated) {
        nextTool = {
          ...tool,
          description: currentDescription ? `${currentDescription}\n\n${optionalNote}` : optionalNote,
        };
      }
    }

    if (name === 'unity.asset.find') {
      const inputSchema =
        nextTool.inputSchema && typeof nextTool.inputSchema === 'object' ? nextTool.inputSchema : { type: 'object' };
      const properties = inputSchema.properties && typeof inputSchema.properties === 'object' ? inputSchema.properties : {};
      const patchedSchema = {
        ...inputSchema,
        properties: {
          ...properties,
          path: {
            type: 'string',
            description: "アセットパス（bridge互換: Unity実装は path/guid を要求する場合があります）",
          },
          guid: {
            type: 'string',
            description: "アセットGUID（bridge互換: Unity実装は path/guid を要求する場合があります）",
          },
        },
        // Allow either the documented filter-based query, or direct identifiers.
        anyOf: [{ required: ['filter'] }, { required: ['path'] }, { required: ['guid'] }],
      };
      delete patchedSchema.required;

      return {
        ...nextTool,
        inputSchema: patchedSchema,
      };
    }

    if (name === 'unity.asset.list') {
      const inputSchema =
        nextTool.inputSchema && typeof nextTool.inputSchema === 'object' ? nextTool.inputSchema : { type: 'object' };
      const properties = inputSchema.properties && typeof inputSchema.properties === 'object' ? inputSchema.properties : {};
      return {
        ...nextTool,
        inputSchema: {
          ...inputSchema,
          properties: {
            ...properties,
            assetType: {
              type: 'string',
              description: "アセット種別（bridge互換: Unity実装は assetType を要求する場合があります。例: 'Material', 'Scene', 'Prefab', 'Object'）",
            },
          },
        },
      };
    }

    if (name === 'unity.component.setReference') {
      const inputSchema =
        nextTool.inputSchema && typeof nextTool.inputSchema === 'object' ? nextTool.inputSchema : { type: 'object' };
      const properties = inputSchema.properties && typeof inputSchema.properties === 'object' ? inputSchema.properties : {};

      const referenceTypeSchema =
        properties.referenceType && typeof properties.referenceType === 'object' ? properties.referenceType : { type: 'string' };

      const referencePathSchema =
        properties.referencePath && typeof properties.referencePath === 'object' ? properties.referencePath : null;

      const required = Array.isArray(inputSchema.required) ? inputSchema.required.filter((key) => key !== 'referenceType') : null;

      const patchedSchema = {
        ...inputSchema,
        properties: {
          ...properties,
          referenceType: {
            ...referenceTypeSchema,
            description:
              "参照種別（例: 'asset' / 'gameObject' / 'component'）。省略時は Bridge が fieldName から推論します（失敗したら明示してください）。",
          },
          ...(referencePathSchema
            ? {
                referencePath: {
                  ...referencePathSchema,
                  description:
                    (typeof referencePathSchema.description === 'string' && referencePathSchema.description.trim().length > 0
                      ? `${referencePathSchema.description}\n\n`
                      : '') +
                    '参照先の GameObject パス（例: "Root/Child"）。曖昧な場合は unity.scene.list で候補の path を取得してください。',
                },
              }
            : {}),
        },
      };

      if (required) {
        patchedSchema.required = required;
      }

      return {
        ...nextTool,
        inputSchema: patchedSchema,
      };
    }

    if (name === 'unity.uitoolkit.scene.configureUIDocument') {
      const inputSchema =
        nextTool.inputSchema && typeof nextTool.inputSchema === 'object' ? nextTool.inputSchema : { type: 'object' };
      const properties = inputSchema.properties && typeof inputSchema.properties === 'object' ? inputSchema.properties : {};
      return {
        ...nextTool,
        inputSchema: {
          ...inputSchema,
          properties: {
            ...properties,
            uxmlPath: {
              type: 'string',
              description: 'UXMLパス（任意）',
            },
            panelSettingsPath: {
              type: 'string',
              description: 'PanelSettingsパス（任意）',
            },
            sortingOrder: {
              type: 'integer',
              description: 'ソート順（任意）',
            },
          },
        },
      };
    }

    if (name === 'unity.uitoolkit.runtime.createUIDocument') {
      const inputSchema =
        nextTool.inputSchema && typeof nextTool.inputSchema === 'object' ? nextTool.inputSchema : { type: 'object' };
      const properties = inputSchema.properties && typeof inputSchema.properties === 'object' ? inputSchema.properties : {};
      return {
        ...nextTool,
        inputSchema: {
          ...inputSchema,
          properties: {
            ...properties,
            panelSettingsPath: {
              type: 'string',
              description: 'PanelSettingsパス（任意）',
            },
            sortingOrder: {
              type: 'integer',
              description: 'ソート順（任意）',
            },
          },
        },
      };
    }

    if (name === 'unity.uitoolkit.runtime.queryElement') {
      const inputSchema =
        nextTool.inputSchema && typeof nextTool.inputSchema === 'object' ? nextTool.inputSchema : { type: 'object' };
      const properties = inputSchema.properties && typeof inputSchema.properties === 'object' ? inputSchema.properties : {};
      return {
        ...nextTool,
        inputSchema: {
          ...inputSchema,
          properties: {
            ...properties,
            selector: {
              type: 'string',
              description: 'USSセレクタ（例: "#HPLabel" / ".some-class"）',
            },
            query: {
              ...(properties.query && typeof properties.query === 'object' ? properties.query : { type: 'string' }),
              description:
                'クエリ（bridge互換: Unity側は selector を要求する場合があります。Bridge は query → selector を自動変換します）',
            },
          },
          required: ['gameObjectPath'],
          anyOf: [{ required: ['selector'] }, { required: ['query'] }],
        },
      };
    }

    if (uiToolkitRuntimeSelectorToolNames.has(name)) {
      const inputSchema =
        nextTool.inputSchema && typeof nextTool.inputSchema === 'object' ? nextTool.inputSchema : { type: 'object' };
      const properties = inputSchema.properties && typeof inputSchema.properties === 'object' ? inputSchema.properties : {};

      // Most runtime APIs accept a USS selector on the Unity side. Keep `elementName` for back-compat and let the bridge
      // convert it into `selector` (e.g. "HPLabel" -> "#HPLabel").
      const patchedSchema = {
        ...inputSchema,
        properties: {
          ...properties,
          selector: {
            type: 'string',
            description: 'USSセレクタ（例: "#HPLabel"）。elementName の代わりに指定できます。',
          },
          elementName: {
            ...(properties.elementName && typeof properties.elementName === 'object' ? properties.elementName : { type: 'string' }),
            description:
              '要素名（bridge互換: Unity側は selector を要求する場合があります。Bridge は elementName → selector を自動変換します）',
          },
        },
      };

      const required = new Set(Array.isArray(patchedSchema.required) ? patchedSchema.required : []);
      required.delete('elementName');
      patchedSchema.required = Array.from(required);

      // Require at least one of selector/elementName.
      patchedSchema.anyOf = [{ required: ['selector'] }, { required: ['elementName'] }];

      // Ensure gameObjectPath remains required for these tools.
      if (!patchedSchema.required.includes('gameObjectPath')) {
        patchedSchema.required.push('gameObjectPath');
      }

      return {
        ...nextTool,
        inputSchema: patchedSchema,
      };
    }

    return nextTool;
  });
}

