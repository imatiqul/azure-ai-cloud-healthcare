FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY ["src/HealthQCopilot.Domain/HealthQCopilot.Domain.csproj", "src/HealthQCopilot.Domain/"]
COPY ["src/HealthQCopilot.Infrastructure/HealthQCopilot.Infrastructure.csproj", "src/HealthQCopilot.Infrastructure/"]
COPY ["src/HealthQCopilot.ServiceDefaults/HealthQCopilot.ServiceDefaults.csproj", "src/HealthQCopilot.ServiceDefaults/"]
COPY ["src/HealthQCopilot.Voice/HealthQCopilot.Voice.csproj", "src/HealthQCopilot.Voice/"]
RUN dotnet restore "src/HealthQCopilot.Voice/HealthQCopilot.Voice.csproj"
COPY . .
WORKDIR "/src/src/HealthQCopilot.Voice"
RUN dotnet publish -c Release -o /app/publish --no-restore

FROM base AS final
WORKDIR /app
COPY --from=build /app/publish .
USER $APP_UID
ENTRYPOINT ["dotnet", "HealthQCopilot.Voice.dll"]
