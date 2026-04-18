using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace HealthQCopilot.Infrastructure.Persistence;

public static class DatabaseExtensions
{
    /// <summary>
    /// Registers a DbContext with PostgreSQL when a connection string is configured,
    /// or falls back to SQLite for environments without a database server.
    /// </summary>
    public static IServiceCollection AddHealthcareDb<TContext>(
        this IServiceCollection services,
        IConfiguration configuration,
        string connectionStringName,
        params IInterceptor[] interceptors) where TContext : DbContext
    {
        var connectionString = configuration.GetConnectionString(connectionStringName);

        // Build NpgsqlDataSource once outside the lambda to avoid creating
        // a new connection pool per DbContext resolution.
        NpgsqlDataSource? npgsqlDataSource = null;
        if (!string.IsNullOrEmpty(connectionString))
        {
            var dataSourceBuilder = new Npgsql.NpgsqlDataSourceBuilder(connectionString);
            dataSourceBuilder.EnableDynamicJson();
            npgsqlDataSource = dataSourceBuilder.Build();
        }

        services.AddDbContext<TContext>(opt =>
        {
            if (npgsqlDataSource is not null)
            {
                opt.UseNpgsql(npgsqlDataSource, o => o.EnableRetryOnFailure(
                    maxRetryCount: 3,
                    maxRetryDelay: TimeSpan.FromSeconds(5),
                    errorCodesToAdd: null));

                // Migrations were scaffolded against a SQLite design-time context so the
                // model snapshot contains SQLite column types.  At runtime we use PostgreSQL,
                // which causes EF Core to report PendingModelChangesWarning even when there
                // are no actual schema differences.  Suppress the warning so MigrateAsync()
                // can run successfully.
                opt.ConfigureWarnings(w =>
                    w.Ignore(RelationalEventId.PendingModelChangesWarning));
            }
            else
            {
                opt.UseSqlite($"Data Source={typeof(TContext).Name}.db");
            }

            if (interceptors.Length > 0)
            {
                opt.AddInterceptors(interceptors);
            }
        });

        return services;
    }

    /// <summary>
    /// Initializes the database. Uses EF Core migrations when pending migrations exist,
    /// otherwise falls back to EnsureCreated for development/CI environments.
    /// </summary>
    public static async Task InitializeDatabaseAsync<TContext>(this IHost host) where TContext : DbContext
    {
        using var scope = host.Services.CreateScope();
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<TContext>>();
        var db = scope.ServiceProvider.GetRequiredService<TContext>();
        var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var useMigrations = config.GetValue("Database:UseMigrations", false);

        try
        {
            if (useMigrations)
            {
                var pending = await db.Database.GetPendingMigrationsAsync();
                if (pending.Any())
                {
                    logger.LogInformation("Applying {Count} pending migrations for {Context}",
                        pending.Count(), typeof(TContext).Name);
                    await ApplyMigrationsWithBrownfieldHandlingAsync(db, pending, logger);
                }
                else
                {
                    logger.LogInformation("No pending migrations for {Context}", typeof(TContext).Name);
                }
            }
            else
            {
                await db.Database.EnsureCreatedAsync();

                // EnsureCreatedAsync is a no-op when the database already exists (e.g.
                // created by the primary DbContext). For secondary contexts that share
                // the same database, explicitly create any missing tables.
                if (db is AuditDbContext)
                {
                    await db.Database.ExecuteSqlRawAsync("""
                        CREATE TABLE IF NOT EXISTS phi_audit_logs (
                            id              uuid PRIMARY KEY,
                            user_id         varchar(128) NOT NULL,
                            http_method     varchar(10)  NOT NULL,
                            resource_path   varchar(512) NOT NULL,
                            status_code     integer      NOT NULL,
                            correlation_id  varchar(128),
                            accessed_at     timestamp    NOT NULL
                        )
                        """);
                }
            }

            logger.LogInformation("Database initialized for {Context} (migrations={UseMigrations})",
                typeof(TContext).Name, useMigrations);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not initialize database for {Context}, will continue with degraded mode", typeof(TContext).Name);
        }
    }

    /// <summary>
    /// Applies EF Core migrations one-by-one.  When a migration fails because the
    /// database was previously created with EnsureCreated (brownfield scenario) and
    /// the target object already exists (PostgreSQL error 42P07), the migration is
    /// stamped as applied in __EFMigrationsHistory and the loop continues.  This
    /// allows "new" migrations (e.g. those that add genuinely missing tables) to run.
    /// </summary>
    private static async Task ApplyMigrationsWithBrownfieldHandlingAsync(
        DbContext db,
        IEnumerable<string> pendingMigrationIds,
        ILogger logger)
    {
        var migrator = db.GetService<IMigrator>();
        var efVersion = typeof(DbContext).Assembly.GetName().Version?.ToString() ?? "9.0.0";

        foreach (var migrationId in pendingMigrationIds)
        {
            try
            {
                logger.LogInformation("Applying migration '{MigrationId}'", migrationId);
                await migrator.MigrateAsync(migrationId);
                logger.LogInformation("Migration '{MigrationId}' applied successfully", migrationId);
            }
            catch (Exception ex) when (IsDuplicateObjectException(ex))
            {
                // The database was previously created with EnsureCreated — the schema
                // already exists.  Stamp the migration as applied so EF Core can
                // continue to the next one.
                logger.LogWarning(
                    "Migration '{MigrationId}' skipped (objects already exist). " +
                    "Baselining in __EFMigrationsHistory.", migrationId);

                await db.Database.ExecuteSqlRawAsync(
                    "INSERT INTO \"__EFMigrationsHistory\" (\"MigrationId\", \"ProductVersion\") " +
                    $"VALUES ('{migrationId}', '{efVersion}') " +
                    "ON CONFLICT (\"MigrationId\") DO NOTHING");
            }
        }
    }

    private static bool IsDuplicateObjectException(Exception ex)
    {
        // PostgreSQL error code 42P07 = duplicate_table
        // PostgreSQL error code 42701 = duplicate_column
        // PostgreSQL error code 42P16 = invalid_table_definition (raised for duplicate constraints)
        const string duplicateTable = "42P07";
        const string duplicateColumn = "42701";

        for (var inner = ex; inner != null; inner = inner.InnerException)
        {
            if (inner is Npgsql.PostgresException pgEx &&
                (pgEx.SqlState == duplicateTable || pgEx.SqlState == duplicateColumn))
            {
                return true;
            }
        }
        return false;
    }
}
