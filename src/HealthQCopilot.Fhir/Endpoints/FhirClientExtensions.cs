using Azure.Core;
using Azure.Identity;

namespace HealthQCopilot.Fhir.Endpoints;

/// <summary>
/// DelegatingHandler that acquires a Bearer token for the configured FHIR server
/// audience using DefaultAzureCredential (Managed Identity in production, env vars / CLI in dev).
/// </summary>
internal sealed class FhirAuthHandler : DelegatingHandler
{
    private readonly TokenCredential _credential;
    private readonly string _audience;
    private AccessToken _cachedToken;

    public FhirAuthHandler(string audience)
    {
        _credential = new DefaultAzureCredential();
        _audience = audience;
        _cachedToken = default;
    }

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (_cachedToken.ExpiresOn <= DateTimeOffset.UtcNow.AddMinutes(5))
        {
            var tokenRequest = new TokenRequestContext(new[] { _audience + "/.default" });
            _cachedToken = await _credential.GetTokenAsync(tokenRequest, cancellationToken);
        }

        request.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _cachedToken.Token);

        return await base.SendAsync(request, cancellationToken);
    }
}

public static class FhirClientExtensions
{
    public static IServiceCollection AddFhirHttpClient(this IServiceCollection services, IConfiguration config)
    {
        var fhirBaseUrl = config["FhirServer:BaseUrl"] ?? "http://localhost:8090/fhir/";
        var useManagedIdentity = config.GetValue("FhirServer:UseManagedIdentity", false);

        if (useManagedIdentity)
        {
            // In production, acquire tokens via Managed Identity for Azure Health Data Services
            var audience = config["FhirServer:Audience"] ?? fhirBaseUrl.TrimEnd('/');
            services.AddTransient(_ => new FhirAuthHandler(audience));
            services.AddHttpClient("FhirServer", client =>
            {
                client.BaseAddress = new Uri(fhirBaseUrl);
                client.DefaultRequestHeaders.Accept.Add(
                    new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("application/fhir+json"));
            }).AddHttpMessageHandler<FhirAuthHandler>();
        }
        else
        {
            services.AddHttpClient("FhirServer", client =>
            {
                client.BaseAddress = new Uri(fhirBaseUrl);
                client.DefaultRequestHeaders.Accept.Add(
                    new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("application/fhir+json"));
            });
        }

        return services;
    }
}
