FROM mcr.microsoft.com/dotnet/aspnet:9.0-noble-chiseled AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY ["Directory.Build.props", "."]
COPY ["src/HealthQCopilot.ServiceDefaults/HealthQCopilot.ServiceDefaults.csproj", "src/HealthQCopilot.ServiceDefaults/"]
COPY ["src/HealthQCopilot.Gateway/HealthQCopilot.Gateway.csproj", "src/HealthQCopilot.Gateway/"]
RUN dotnet restore "src/HealthQCopilot.Gateway/HealthQCopilot.Gateway.csproj"
COPY . .
WORKDIR "/src/src/HealthQCopilot.Gateway"
RUN dotnet publish -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=build /app/publish .
USER app
ENTRYPOINT ["dotnet", "HealthQCopilot.Gateway.dll"]
