#if UNITY_EDITOR
using System;
using System.Text;
using UnityEditor;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace UniMCP4CC.Editor
{
  internal static class McpGameObjectTools
  {
    [Serializable]
    private sealed class ResultPayload
    {
      public string status;
      public string message;
      public string name;
      public string parentPath;
      public string gameObjectPath;
      public int candidateCount;
      public string[] candidatePaths;
    }

    public static string CreateEmptySafeBase64(string name, string parentPath, bool active)
    {
      string EncodeResult(string status, string message, Action<ResultPayload> configure = null)
      {
        var payload = new ResultPayload
        {
          status = status,
          message = message,
          name = name,
          parentPath = parentPath,
        };

        configure?.Invoke(payload);

        return Encode(payload);
      }

      try
      {
        if (string.IsNullOrWhiteSpace(name))
        {
          return EncodeResult("error", "name is required");
        }

        var trimmedName = name.Trim();
        GameObject parent = null;
        var trimmedParentPath = string.IsNullOrWhiteSpace(parentPath) ? string.Empty : parentPath.Trim();
        if (!string.IsNullOrEmpty(trimmedParentPath))
        {
          var matches = McpEditorSceneQuery.FindSceneGameObjectsByQuery(trimmedParentPath);
          if (matches.Count == 0)
          {
            return EncodeResult("error", $"Parent GameObject not found: {trimmedParentPath}");
          }

          if (matches.Count > 1)
          {
            var candidatePaths = McpEditorSceneQuery.BuildCandidatePaths(matches, maxCandidates: 10);
            var messageBuilder = new StringBuilder();
            messageBuilder.Append($"Parent GameObject is ambiguous: {trimmedParentPath}");
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

          parent = matches[0];
          if (parent == null)
          {
            return EncodeResult("error", $"Parent GameObject not found: {trimmedParentPath}");
          }
        }

        var targetScene = ResolveTargetScene(parent);
        if (!targetScene.IsValid() || !targetScene.isLoaded)
        {
          return EncodeResult("error", "No loaded scene available for GameObject creation.");
        }

        var gameObject = new GameObject(trimmedName);
        Undo.RegisterCreatedObjectUndo(gameObject, "Create Empty GameObject");

        if (parent != null)
        {
          SceneManager.MoveGameObjectToScene(gameObject, parent.scene);
          var parentTransform = parent.transform;
          if (parentTransform != null)
          {
            gameObject.transform.SetParent(parentTransform, false);
          }
        }
        else
        {
          SceneManager.MoveGameObjectToScene(gameObject, targetScene);
        }

        gameObject.SetActive(active);
        EditorUtility.SetDirty(gameObject);

        return EncodeResult(
          "success",
          "GameObject created",
          payload =>
          {
            payload.name = gameObject.name;
            payload.parentPath = trimmedParentPath;
            payload.gameObjectPath = McpEditorSceneQuery.GetHierarchyPath(gameObject);
          }
        );
      }
      catch (Exception exception)
      {
        return EncodeResult("error", exception.Message);
      }
    }

    private static Scene ResolveTargetScene(GameObject parent)
    {
      if (parent != null)
      {
        var parentScene = parent.scene;
        if (parentScene.IsValid() && parentScene.isLoaded)
        {
          return parentScene;
        }
      }

      var activeScene = SceneManager.GetActiveScene();
      if (activeScene.IsValid() && activeScene.isLoaded)
      {
        return activeScene;
      }

      foreach (var scene in McpEditorSceneQuery.EnumerateLoadedScenes())
      {
        return scene;
      }

      return default;
    }

    private static string Encode(ResultPayload payload)
    {
      var json = JsonUtility.ToJson(payload);
      return Convert.ToBase64String(Encoding.UTF8.GetBytes(json));
    }
  }
}
#endif
