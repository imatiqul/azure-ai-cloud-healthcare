namespace HealthQCopilot.Tests.Unit.Architecture;

/// <summary>
/// Reads a service's <c>Program.cs</c> and says whether the PHI audit middleware is registered
/// directly after authentication and before authorization (spec 004-audit-identity, FR-001 and FR-004).
/// <para>
/// It reads source text, not a running pipeline: the registrations it looks for are one statement
/// per line in every service, and a check on the text fails the build without starting a service.
/// </para>
/// </summary>
public static class RequestPipelineOrder
{
    public const string Authentication = "app.UseAuthentication()";
    public const string Audit = "app.UseMiddleware<PhiAuditMiddleware>()";
    public const string Authorization = "app.UseAuthorization()";

    /// <summary>What is wrong with the order, naming the service; or null when the order is right.</summary>
    public static string? Check(string service, string programText)
    {
        var statements = Statements(programText);
        var authentication = statements.FindIndex(s => s.StartsWith(Authentication, StringComparison.Ordinal));
        var audit = statements.FindIndex(s => s.StartsWith(Audit, StringComparison.Ordinal));
        var authorization = statements.FindIndex(s => s.StartsWith(Authorization, StringComparison.Ordinal));

        if (audit < 0)
            return $"{service}: the PHI audit middleware is not registered";
        if (authentication < 0)
            return $"{service}: authentication is not registered";
        if (authorization < 0)
            return $"{service}: authorization is not registered";
        if (audit < authentication)
            return $"{service}: the PHI audit middleware is registered before authentication, so its records would name nobody";
        if (audit > authorization)
            return $"{service}: the PHI audit middleware is registered after authorization, so a refused request would leave no record";

        var between = statements
            .Skip(authentication + 1)
            .Take(audit - authentication - 1)
            .FirstOrDefault(s => s.StartsWith("app.Use", StringComparison.Ordinal));
        if (between is not null)
            return $"{service}: {between} is registered between authentication and the PHI audit middleware; "
                + "nothing that can answer a request may sit in front of the audit";

        return null;
    }

    /// <summary>Whether the text registers the PHI audit middleware at all.</summary>
    public static bool RegistersAudit(string programText) =>
        Statements(programText).Exists(s => s.StartsWith(Audit, StringComparison.Ordinal));

    /// <summary>The code lines of a file, trimmed, without comment lines and without trailing comments.</summary>
    private static List<string> Statements(string text)
    {
        var statements = new List<string>();
        foreach (var raw in text.Split('\n'))
        {
            var line = raw.Trim();
            var comment = line.IndexOf("//", StringComparison.Ordinal);
            if (comment >= 0)
                line = line[..comment].TrimEnd();
            if (line.Length > 0)
                statements.Add(line);
        }
        return statements;
    }
}
