FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY ["Directory.Build.props", "."]
COPY ["src/HealthQCopilot.Domain/HealthQCopilot.Domain.csproj", "src/HealthQCopilot.Domain/"]
COPY ["src/HealthQCopilot.Infrastructure/HealthQCopilot.Infrastructure.csproj", "src/HealthQCopilot.Infrastructure/"]
COPY ["src/HealthQCopilot.ServiceDefaults/HealthQCopilot.ServiceDefaults.csproj", "src/HealthQCopilot.ServiceDefaults/"]
COPY ["src/HealthQCopilot.Fhir/HealthQCopilot.Fhir.csproj", "src/HealthQCopilot.Fhir/"]
RUN dotnet restore "src/HealthQCopilot.Fhir/HealthQCopilot.Fhir.csproj"
COPY . .
WORKDIR "/src/src/HealthQCopilot.Fhir"
RUN dotnet publish -c Release -o /app/publish 

FROM base AS final
WORKDIR /app
COPY --from=build /app/publish .
USER app
ENTRYPOINT ["dotnet", "HealthQCopilot.Fhir.dll"]
