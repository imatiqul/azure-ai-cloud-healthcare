using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HealthQCopilot.Agents.Migrations
{
    /// <inheritdoc />
    public partial class AddModelGovernance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "model_registry_entries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ModelName = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    ModelVersion = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    DeploymentName = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    SkVersion = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    PromptHash = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    PluginManifest = table.Column<string>(type: "TEXT", maxLength: 2048, nullable: false),
                    LastEvalScore = table.Column<double>(type: "REAL", nullable: true),
                    EvalNotes = table.Column<string>(type: "TEXT", maxLength: 1024, nullable: true),
                    DeployedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeployedByUserId = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_model_registry_entries", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_model_registry_entries_DeployedAt",
                table: "model_registry_entries",
                column: "DeployedAt");

            migrationBuilder.CreateIndex(
                name: "IX_model_registry_entries_IsActive",
                table: "model_registry_entries",
                column: "IsActive");

            migrationBuilder.CreateTable(
                name: "prompt_evaluation_runs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ModelRegistryEntryId = table.Column<Guid>(type: "TEXT", nullable: false),
                    TotalCases = table.Column<int>(type: "INTEGER", nullable: false),
                    PassedCases = table.Column<int>(type: "INTEGER", nullable: false),
                    Score = table.Column<double>(type: "REAL", nullable: false),
                    ResultsJson = table.Column<string>(type: "TEXT", nullable: false),
                    EvaluatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    EvaluatedByUserId = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false),
                    PassedThreshold = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_prompt_evaluation_runs", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_prompt_evaluation_runs_EvaluatedAt",
                table: "prompt_evaluation_runs",
                column: "EvaluatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_prompt_evaluation_runs_ModelRegistryEntryId",
                table: "prompt_evaluation_runs",
                column: "ModelRegistryEntryId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "prompt_evaluation_runs");
            migrationBuilder.DropTable(name: "model_registry_entries");
        }
    }
}
