using System.Text.RegularExpressions;

namespace HealthQCopilot.Tests.Unit.Architecture;

/// <summary>
/// Reads a service's <c>Program.cs</c> and says whether the PHI audit middleware is registered
/// directly after authentication and before authorization, with nothing in front of it that can
/// answer a request (spec 004-audit-identity, FR-001 and FR-004).
/// <para>
/// It reads source text, not a running pipeline, so that it fails the build without starting a
/// service. It reads one form only: each registration as its own top-level statement, written
/// exactly as the constants below. Anything else fails, which is the safe direction: a
/// registration inside a block, a chained call, a second registration, the middleware named in
/// any other way, a preprocessor condition.
/// </para>
/// <para>
/// What it cannot see: a middleware on <see cref="AllowedBeforeAudit"/> that is changed so that
/// it answers requests, a service that should audit and never names the middleware, and
/// whether a test run happens at all.
/// </para>
/// </summary>
public static partial class RequestPipelineOrder
{
    public const string Authentication = "app.UseAuthentication();";
    public const string Audit = "app.UseMiddleware<PhiAuditMiddleware>();";
    public const string Authorization = "app.UseAuthorization();";

    /// <summary>The name by which any code refers to the audit middleware.</summary>
    public const string MiddlewareName = "PhiAuditMiddleware";

    /// <summary>
    /// What may be registered in front of the audit middleware, and why it leaves no request
    /// unrecorded. A statement that is not here fails the check.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, string> AllowedBeforeAudit = new Dictionary<string, string>
    {
        ["app.MapOpenApi();"] = "Maps an endpoint. Endpoints run at the end of the pipeline, behind the audit.",
        ["app.UseCloudEvents();"] = "Unwraps an event delivery and calls the next middleware.",
        ["app.UseMiddleware<TenantContextMiddleware>();"] = "Opens a log scope and calls the next middleware.",
        ["app.UseMiddleware<SecurityHeadersMiddleware>();"] = "Adds response headers and calls the next middleware.",
        [Authentication] = "Establishes the caller. It refuses nothing; authorization does.",
    };

    /// <summary>
    /// Middleware that can answer a request and still sits in front of the audit, by service,
    /// each with the reason it is tolerated. An entry here is a debt, not a permission.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, IReadOnlyDictionary<string, string>> Exceptions =
        new Dictionary<string, IReadOnlyDictionary<string, string>>
        {
            ["Fhir"] = new Dictionary<string, string>
            {
                ["app.UseMiddleware<ConsentEnforcementMiddleware>();"] =
                    "It runs before authentication, finds no user and passes every request on. "
                    + "When it is changed to refuse, it has to move behind the audit middleware first.",
            },
        };

    /// <summary>What is wrong with the pipeline, naming the service; or null when nothing is.</summary>
    public static string? Check(string service, string programText)
    {
        var lines = CodeLines(programText);

        if (lines.Exists(line => line.TrimStart().StartsWith("#if", StringComparison.Ordinal)
            || line.TrimStart().StartsWith("#el", StringComparison.Ordinal)))
            return $"{service}: Program.cs has a preprocessor condition, which this check cannot read";

        // Top-level statements start in the first column. One inside a block may never run.
        var statements = lines.Where(line => line.StartsWith("app.", StringComparison.Ordinal)).ToList();

        foreach (var (registration, what) in new[]
        {
            (Audit, "the PHI audit middleware"), (Authentication, "authentication"), (Authorization, "authorization"),
        })
        {
            var count = statements.Count(statement => statement == registration);
            if (count > 1)
                return $"{service}: {what} is registered {count} times; this check reads one registration of each";
            if (count == 1)
                continue;
            var stem = registration.TrimEnd(';');
            if (lines.Exists(line => line.TrimStart().StartsWith(stem, StringComparison.Ordinal)))
                return $"{service}: {what} is registered inside a block or as part of a longer statement, "
                    + $"where this check cannot tell whether it runs; register it as its own statement, {registration}";
            return $"{service}: {what} is not registered";
        }

        var mentions = lines.Count(line => line.Contains(MiddlewareName, StringComparison.Ordinal));
        if (mentions != 1)
            return $"{service}: Program.cs names {MiddlewareName} in {mentions} places; "
                + "this check reads the one registration and cannot tell what the others do";

        var authentication = statements.IndexOf(Authentication);
        var audit = statements.IndexOf(Audit);
        var authorization = statements.IndexOf(Authorization);

        if (audit < authentication)
            return $"{service}: the PHI audit middleware is registered before authentication, so its records would name nobody";
        if (audit > authorization)
            return $"{service}: the PHI audit middleware is registered after authorization, so a refused request would leave no record";
        if (audit != authentication + 1)
            return $"{service}: {statements[authentication + 1]} is registered between authentication and the PHI audit middleware; "
                + "nothing may sit between them";

        Exceptions.TryGetValue(service, out var tolerated);
        var inFront = statements
            .Take(audit)
            .FirstOrDefault(statement => !AllowedBeforeAudit.ContainsKey(statement) && tolerated?.ContainsKey(statement) != true);
        if (inFront is not null)
            return $"{service}: {inFront} is registered in front of the PHI audit middleware and is not on the list of what may be; "
                + "a request it answers would leave no audit record";

        return null;
    }

    /// <summary>Whether the text names the audit middleware at all, in any form.</summary>
    public static bool NamesAuditMiddleware(string sourceText) =>
        CodeLines(sourceText).Exists(line => line.Contains(MiddlewareName, StringComparison.Ordinal));

    /// <summary>The lines of a file that hold code, without comments and without trailing space.</summary>
    private static List<string> CodeLines(string text)
    {
        var lines = new List<string>();
        foreach (var raw in BlockComment().Replace(text, " ").Split('\n'))
        {
            var comment = raw.IndexOf("//", StringComparison.Ordinal);
            var line = (comment >= 0 ? raw[..comment] : raw).TrimEnd();
            if (line.Length > 0)
                lines.Add(line);
        }
        return lines;
    }

    [GeneratedRegex(@"/\*.*?\*/", RegexOptions.Singleline)]
    private static partial Regex BlockComment();
}
