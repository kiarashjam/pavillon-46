namespace Pavillon46.Api.Configuration;

/// <summary>
/// Loads KEY=VALUE pairs from repo-root .env / .env.local into process environment
/// variables (without overriding values already set by the host or shell).
/// Mirrors the old Next.js behaviour so local <c>dotnet run</c> picks up the same file.
/// </summary>
public static class DotEnvLoader
{
    public static void LoadFromRepositoryRoot()
    {
        var repoRoot = FindRepositoryRoot(Directory.GetCurrentDirectory());
        if (repoRoot is null) return;

        // .env first, then .env.local — same precedence as Next.js (local overrides).
        LoadFile(Path.Combine(repoRoot, ".env"));
        LoadFile(Path.Combine(repoRoot, ".env.local"));
    }

    private static string? FindRepositoryRoot(string startDirectory)
    {
        var dir = startDirectory;
        while (!string.IsNullOrEmpty(dir))
        {
            if (Directory.Exists(Path.Combine(dir, "frontend")) &&
                Directory.Exists(Path.Combine(dir, "backend")))
            {
                return dir;
            }
            dir = Directory.GetParent(dir)?.FullName ?? "";
        }
        return null;
    }

    private static void LoadFile(string path)
    {
        if (!File.Exists(path)) return;

        foreach (var rawLine in File.ReadAllLines(path))
        {
            var line = rawLine.Trim();
            if (line.Length == 0 || line.StartsWith('#')) continue;

            if (line.StartsWith("export ", StringComparison.Ordinal))
            {
                line = line["export ".Length..].Trim();
            }

            var eq = line.IndexOf('=');
            if (eq <= 0) continue;

            var key = line[..eq].Trim();
            var value = line[(eq + 1)..].Trim();
            if (key.Length == 0) continue;

            value = Unquote(value);

            if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable(key)))
            {
                Environment.SetEnvironmentVariable(key, value);
            }
        }
    }

    private static string Unquote(string value)
    {
        if (value.Length >= 2)
        {
            if ((value.StartsWith('"') && value.EndsWith('"')) ||
                (value.StartsWith('\'') && value.EndsWith('\'')))
            {
                return value[1..^1];
            }
        }
        return value;
    }
}
