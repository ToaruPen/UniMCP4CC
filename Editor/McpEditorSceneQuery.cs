#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace UniMCP4CC.Editor
{
  internal static class McpEditorSceneQuery
  {
    public static List<GameObject> FindSceneGameObjectsByQuery(string query)
    {
      var matches = new List<GameObject>();
      if (string.IsNullOrWhiteSpace(query))
      {
        return matches;
      }

      var trimmed = query.Trim();
      if (trimmed.IndexOf('/') >= 0)
      {
        FindSceneGameObjectsByPath(trimmed, matches);
      }
      else
      {
        FindSceneGameObjectsByName(trimmed, matches);
      }

      return matches;
    }

    public static IEnumerable<Scene> EnumerateLoadedScenes()
    {
      var prefabStage = PrefabStageUtility.GetCurrentPrefabStage();
      var prefabStageScene = prefabStage != null ? prefabStage.scene : default;
      var hasPrefabStageScene = prefabStage != null;

      var sceneCount = SceneManager.sceneCount;
      for (var index = 0; index < sceneCount; index++)
      {
        var scene = SceneManager.GetSceneAt(index);
        if (!scene.IsValid() || !scene.isLoaded)
        {
          continue;
        }

        if (hasPrefabStageScene && scene == prefabStageScene)
        {
          continue;
        }

        yield return scene;
      }
    }

    public static string[] BuildCandidatePaths(List<GameObject> matches, int maxCandidates)
    {
      if (matches == null || matches.Count == 0 || maxCandidates <= 0)
      {
        return Array.Empty<string>();
      }

      var paths = new List<string>(matches.Count);
      var seen = new HashSet<string>(StringComparer.Ordinal);
      for (var index = 0; index < matches.Count; index++)
      {
        var candidate = matches[index];
        if (candidate == null)
        {
          continue;
        }
        var path = GetHierarchyPath(candidate);
        if (string.IsNullOrWhiteSpace(path))
        {
          continue;
        }
        if (seen.Add(path))
        {
          paths.Add(path);
        }
      }

      paths.Sort(StringComparer.Ordinal);
      var count = paths.Count > maxCandidates ? maxCandidates : paths.Count;
      var result = new string[count];
      for (var index = 0; index < count; index++)
      {
        result[index] = paths[index];
      }

      return result;
    }

    public static string GetHierarchyPath(GameObject gameObject)
    {
      if (gameObject == null)
      {
        return string.Empty;
      }

      var transform = gameObject.transform;
      if (transform == null)
      {
        return gameObject.name ?? string.Empty;
      }

      var names = new Stack<string>();
      var current = transform;
      while (current != null)
      {
        names.Push(current.name);
        current = current.parent;
      }

      return string.Join("/", names.ToArray());
    }

    private static void FindSceneGameObjectsByPath(string path, List<GameObject> matches)
    {
      if (matches == null)
      {
        return;
      }

      var segments = path.Split('/');
      if (segments.Length == 0)
      {
        return;
      }

      var seen = new HashSet<int>();

      foreach (var scene in EnumerateLoadedScenes())
      {
        var roots = scene.GetRootGameObjects();
        var current = new List<GameObject>();
        for (var rootIndex = 0; rootIndex < roots.Length; rootIndex++)
        {
          var root = roots[rootIndex];
          if (root != null && string.Equals(root.name, segments[0], StringComparison.Ordinal))
          {
            current.Add(root);
          }
        }

        for (var segmentIndex = 1; segmentIndex < segments.Length && current.Count > 0; segmentIndex++)
        {
          var next = new List<GameObject>();
          var segment = segments[segmentIndex];
          for (var currentIndex = 0; currentIndex < current.Count; currentIndex++)
          {
            var candidate = current[currentIndex];
            if (candidate == null)
            {
              continue;
            }
            var transform = candidate.transform;
            if (transform == null)
            {
              continue;
            }
            for (var childIndex = 0; childIndex < transform.childCount; childIndex++)
            {
              var child = transform.GetChild(childIndex);
              if (child != null && string.Equals(child.name, segment, StringComparison.Ordinal))
              {
                next.Add(child.gameObject);
              }
            }
          }
          current = next;
        }

        for (var currentIndex = 0; currentIndex < current.Count; currentIndex++)
        {
          var candidate = current[currentIndex];
          if (candidate == null)
          {
            continue;
          }
          if (seen.Add(candidate.GetInstanceID()))
          {
            matches.Add(candidate);
          }
        }
      }
    }

    private static void FindSceneGameObjectsByName(string name, List<GameObject> matches)
    {
      if (matches == null)
      {
        return;
      }

      var seen = new HashSet<int>();
      foreach (var scene in EnumerateLoadedScenes())
      {
        var roots = scene.GetRootGameObjects();
        for (var rootIndex = 0; rootIndex < roots.Length; rootIndex++)
        {
          var root = roots[rootIndex];
          if (root == null)
          {
            continue;
          }
          foreach (var transform in root.GetComponentsInChildren<Transform>(true))
          {
            if (transform == null)
            {
              continue;
            }
            if (!string.Equals(transform.name, name, StringComparison.Ordinal))
            {
              continue;
            }
            var candidate = transform.gameObject;
            if (candidate == null)
            {
              continue;
            }
            if (seen.Add(candidate.GetInstanceID()))
            {
              matches.Add(candidate);
            }
          }
        }
      }
    }
  }
}
#endif
