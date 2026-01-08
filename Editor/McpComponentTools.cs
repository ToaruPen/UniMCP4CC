#if UNITY_EDITOR
using System;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace UniMCP4CC.Editor
{
  internal static class McpComponentTools
  {
    [Serializable]
    private sealed class ResultPayload
    {
      public string status;
      public string message;
      public string gameObjectPath;
      public string componentType;
      public string resolvedComponentType;
      public string addedComponentType;
      public int candidateCount;
      public string[] candidatePaths;
      public string[] ambiguousComponentTypes;
    }

    public static string AddComponentBase64(string gameObjectPath, string componentType)
    {
      return AddComponentBase64(gameObjectPath, componentType, false);
    }

    public static string AddComponentBase64V2(string gameObjectPath, string componentType, bool removeConflictingRenderers)
    {
      return AddComponentBase64(gameObjectPath, componentType, removeConflictingRenderers);
    }

    public static string AddComponentBase64(string gameObjectPath, string componentType, bool removeConflictingRenderers)
    {
      string EncodeResult(string status, string message, Action<ResultPayload> configure = null)
      {
        var payload = new ResultPayload
        {
          status = status,
          message = message,
          gameObjectPath = gameObjectPath,
          componentType = componentType,
        };

        configure?.Invoke(payload);

        return Encode(payload);
      }

      try
      {
        if (string.IsNullOrWhiteSpace(gameObjectPath) || string.IsNullOrWhiteSpace(componentType))
        {
          return EncodeResult("error", "gameObjectPath and componentType are required");
        }

        var matches = McpEditorSceneQuery.FindSceneGameObjectsByQuery(gameObjectPath);
        if (matches.Count == 0)
        {
          return EncodeResult("error", $"GameObject not found: {gameObjectPath}");
        }

        if (matches.Count > 1)
        {
          var candidatePaths = McpEditorSceneQuery.BuildCandidatePaths(matches, maxCandidates: 10);
          var messageBuilder = new StringBuilder();
          messageBuilder.Append($"GameObject is ambiguous: {gameObjectPath}");
          messageBuilder.Append("\nCandidates:");
          for (var index = 0; index < candidatePaths.Length; index++)
          {
            messageBuilder.Append("\n- ");
            messageBuilder.Append(candidatePaths[index]);
          }
          messageBuilder.Append("\nSpecify a full hierarchy path (e.g. \"Root/Child\").");

          return EncodeResult(
            "error",
            messageBuilder.ToString(),
            payload =>
            {
              payload.candidateCount = matches.Count;
              payload.candidatePaths = candidatePaths;
            }
          );
        }

        var gameObject = matches[0];
        if (gameObject == null)
        {
          return EncodeResult("error", $"GameObject not found: {gameObjectPath}");
        }

        var componentTypeTrimmed = componentType.Trim();
        string[] ambiguousComponentTypes = null;
        var resolvedType = McpEditorTypeResolver.ResolveType(componentTypeTrimmed, out ambiguousComponentTypes);

        if (resolvedType == null)
        {
          if (ambiguousComponentTypes != null && ambiguousComponentTypes.Length > 0)
          {
            var messageBuilder = new StringBuilder();
            messageBuilder.Append($"Component type is ambiguous: {componentTypeTrimmed}");
            messageBuilder.Append("\nCandidates:");
            for (var index = 0; index < ambiguousComponentTypes.Length; index++)
            {
              messageBuilder.Append("\n- ");
              messageBuilder.Append(ambiguousComponentTypes[index]);
            }
            messageBuilder.Append("\nSpecify a fully qualified type name (Namespace.TypeName).");

            return EncodeResult(
              "error",
              messageBuilder.ToString(),
              payload => payload.ambiguousComponentTypes = ambiguousComponentTypes
            );
          }

          return EncodeResult("error", $"Component type not found: {componentTypeTrimmed}");
        }

        if (Attribute.IsDefined(resolvedType, typeof(DisallowMultipleComponent)) && gameObject.GetComponent(resolvedType) != null)
        {
          return EncodeResult("error", $"Component already exists: {resolvedType.FullName ?? resolvedType.Name}");
        }

        if (resolvedType == typeof(SpriteRenderer))
        {
          var hasMeshFilter = gameObject.GetComponent<MeshFilter>() != null;
          var hasMeshRenderer = gameObject.GetComponent<MeshRenderer>() != null;
          if (hasMeshFilter || hasMeshRenderer)
          {
            if (!removeConflictingRenderers)
            {
              return EncodeResult(
                "error",
                "SpriteRenderer conflicts with existing MeshFilter/MeshRenderer on this GameObject. " +
                "Remove those components, create an empty GameObject, or re-run with removeConflictingRenderers: true."
              );
            }

            try
            {
              var meshRenderer = gameObject.GetComponent<MeshRenderer>();
              if (meshRenderer != null)
              {
                Undo.DestroyObjectImmediate(meshRenderer);
              }

              var meshFilter = gameObject.GetComponent<MeshFilter>();
              if (meshFilter != null)
              {
                Undo.DestroyObjectImmediate(meshFilter);
              }

              if (gameObject.GetComponent<MeshFilter>() != null || gameObject.GetComponent<MeshRenderer>() != null)
              {
                return EncodeResult("error", "Failed to remove conflicting MeshFilter/MeshRenderer components.");
              }

              EditorUtility.SetDirty(gameObject);
            }
            catch (Exception exception)
            {
              return EncodeResult("error", $"Failed to remove conflicting MeshFilter/MeshRenderer components: {exception.Message}");
            }
          }
        }

        Component addedComponent;
        try
        {
          addedComponent = Undo.AddComponent(gameObject, resolvedType);
        }
        catch (Exception exception)
        {
          var hint = BuildAddComponentFailureHint(gameObject, resolvedType);
          var message = $"Failed to add component: {exception.Message}";
          if (!string.IsNullOrWhiteSpace(hint))
          {
            message = $"{message}\n{hint}";
          }
          return EncodeResult("error", message);
        }

        if (addedComponent == null)
        {
          var hint = BuildAddComponentFailureHint(gameObject, resolvedType);
          var message = $"Failed to add component: {resolvedType.FullName ?? resolvedType.Name}";
          if (!string.IsNullOrWhiteSpace(hint))
          {
            message = $"{message}\n{hint}";
          }
          return EncodeResult(
            "error",
            message,
            payload => payload.resolvedComponentType = resolvedType.FullName ?? resolvedType.Name
          );
        }

        EditorUtility.SetDirty(gameObject);
        EditorUtility.SetDirty(addedComponent);

        return EncodeResult(
          "success",
          "Component added",
          payload =>
          {
            payload.resolvedComponentType = resolvedType.FullName ?? resolvedType.Name;
            payload.addedComponentType = addedComponent.GetType().FullName ?? addedComponent.GetType().Name;
            payload.gameObjectPath = McpEditorSceneQuery.GetHierarchyPath(gameObject);
          }
        );
      }
      catch (Exception exception)
      {
        return EncodeResult("error", exception.Message);
      }
    }

    private static string BuildAddComponentFailureHint(GameObject gameObject, Type resolvedType)
    {
      if (gameObject == null || resolvedType == null)
      {
        return null;
      }

      if (resolvedType == typeof(SpriteRenderer))
      {
        var hasMeshFilter = gameObject.GetComponent<MeshFilter>() != null;
        var hasMeshRenderer = gameObject.GetComponent<MeshRenderer>() != null;
        if (hasMeshFilter || hasMeshRenderer)
        {
          return
            "SpriteRenderer conflicts with existing MeshFilter/MeshRenderer on this GameObject. " +
            "Remove those components, create an empty GameObject, or re-run with removeConflictingRenderers: true.";
        }
      }

      if (resolvedType.FullName == "UnityEngine.Tilemaps.TilemapRenderer")
      {
        var hasMeshFilter = gameObject.GetComponent<MeshFilter>() != null;
        var hasMeshRenderer = gameObject.GetComponent<MeshRenderer>() != null;
        if (hasMeshFilter || hasMeshRenderer)
        {
          return
            "TilemapRenderer conflicts with existing MeshFilter/MeshRenderer on this GameObject. " +
            "Use GameObject/2D Object/Tilemap/Rectangular, or create an empty GameObject and add Tilemap + TilemapRenderer.";
        }
      }

      return null;
    }

    private static string Encode(ResultPayload payload)
    {
      var json = JsonUtility.ToJson(payload);
      return Convert.ToBase64String(Encoding.UTF8.GetBytes(json));
    }
  }
}
#endif
