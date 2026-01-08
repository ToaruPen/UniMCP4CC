#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using UnityEngine;

namespace UniMCP4CC.Editor
{
  internal static class McpEditorTypeResolver
  {
    private static readonly object TypeCacheLock = new object();
    private static readonly Dictionary<string, Type> TypeCache = new Dictionary<string, Type>(StringComparer.Ordinal);

    public static Type ResolveComponentTypeOnGameObject(GameObject gameObject, string typeName, out string[] ambiguousCandidates)
    {
      ambiguousCandidates = null;
      if (gameObject == null || string.IsNullOrWhiteSpace(typeName))
      {
        return null;
      }

      var trimmed = typeName.Trim();
      if (trimmed.Length == 0)
      {
        return null;
      }

      var matches = new HashSet<Type>();
      foreach (var component in gameObject.GetComponents<Component>())
      {
        if (component == null)
        {
          continue;
        }

        var candidate = component.GetType();
        if (candidate != null && string.Equals(candidate.Name, trimmed, StringComparison.Ordinal))
        {
          matches.Add(candidate);
        }
      }

      if (matches.Count == 1)
      {
        foreach (var candidate in matches)
        {
          return candidate;
        }
      }

      if (matches.Count > 1)
      {
        var names = new List<string>(matches.Count);
        foreach (var candidate in matches)
        {
          var fullName = candidate.FullName;
          names.Add(string.IsNullOrEmpty(fullName) ? candidate.Name : fullName);
        }

        names.Sort(StringComparer.Ordinal);

        var max = names.Count > 10 ? 10 : names.Count;
        ambiguousCandidates = new string[max];
        for (var index = 0; index < max; index++)
        {
          ambiguousCandidates[index] = names[index];
        }
      }

      return null;
    }

    public static Type ResolveType(string typeName, out string[] ambiguousCandidates)
    {
      ambiguousCandidates = null;
      if (string.IsNullOrWhiteSpace(typeName))
      {
        return null;
      }

      var trimmed = typeName.Trim();
      lock (TypeCacheLock)
      {
        if (TypeCache.TryGetValue(trimmed, out var cached) && cached != null)
        {
          return cached;
        }
      }

      var resolved = ResolveTypeUncached(trimmed, out ambiguousCandidates);
      if (resolved != null)
      {
        lock (TypeCacheLock)
        {
          TypeCache[trimmed] = resolved;
        }
      }

      return resolved;
    }

    private static Type ResolveTypeUncached(string trimmed, out string[] ambiguousCandidates)
    {
      ambiguousCandidates = null;
      var found = Type.GetType(trimmed);
      if (found != null && typeof(Component).IsAssignableFrom(found))
      {
        return found;
      }

      foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
      {
        try
        {
          var candidate = assembly.GetType(trimmed);
          if (candidate != null && typeof(Component).IsAssignableFrom(candidate))
          {
            return candidate;
          }
        }
        catch
        {
          // ignore and continue
        }
      }

      if (trimmed.IndexOf('.') >= 0)
      {
        return null;
      }

      var matches = new List<Type>();
      foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
      {
        try
        {
          foreach (var candidate in assembly.GetTypes())
          {
            if (
              candidate != null &&
              typeof(Component).IsAssignableFrom(candidate) &&
              string.Equals(candidate.Name, trimmed, StringComparison.Ordinal)
            )
            {
              matches.Add(candidate);
              if (matches.Count >= 32)
              {
                break;
              }
            }
          }
        }
        catch
        {
          // ignore and continue
        }

        if (matches.Count >= 32)
        {
          break;
        }
      }

      if (matches.Count == 1)
      {
        return matches[0];
      }

      if (matches.Count > 1)
      {
        var names = new List<string>(matches.Count);
        for (var index = 0; index < matches.Count; index++)
        {
          var fullName = matches[index].FullName;
          names.Add(string.IsNullOrEmpty(fullName) ? matches[index].Name : fullName);
        }

        names.Sort(StringComparer.Ordinal);

        var max = names.Count > 10 ? 10 : names.Count;
        ambiguousCandidates = new string[max];
        for (var index = 0; index < max; index++)
        {
          ambiguousCandidates[index] = names[index];
        }
      }

      return null;
    }
  }
}
#endif
