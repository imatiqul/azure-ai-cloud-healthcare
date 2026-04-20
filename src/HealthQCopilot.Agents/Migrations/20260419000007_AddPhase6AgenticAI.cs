using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HealthQCopilot.Agents.Migrations
{
    /// <inheritdoc />
    public partial class AddPhase6AgenticAI : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "reasoning_audit_entries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    AgentDecisionId = table.Column<Guid>(type: "TEXT", nullable: false),
                    AgentName = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    RagChunkIdsJson = table.Column<string>(type: "TEXT", nullable: false),
                    ReasoningStepsJson = table.Column<string>(type: "TEXT", nullable: false),
                    GuardVerdict = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false),
                    ConfidenceScore = table.Column<double>(type: "REAL", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_reasoning_audit_entries", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "prompt_experiment_outcomes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ExperimentId = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    ControlLatencyMs = table.Column<long>(type: "INTEGER", nullable: false),
                    ChallengerLatencyMs = table.Column<long>(type: "INTEGER", nullable: false),
                    ControlGuardPassed = table.Column<bool>(type: "INTEGER", nullable: false),
                    ChallengerGuardPassed = table.Column<bool>(type: "INTEGER", nullable: false),
                    ControlOutput = table.Column<string>(type: "TEXT", maxLength: 512, nullable: false),
                    ChallengerOutput = table.Column<string>(type: "TEXT", maxLength: 512, nullable: false),
                    RecordedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_prompt_experiment_outcomes", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_reasoning_audit_entries_AgentDecisionId",
                table: "reasoning_audit_entries",
                column: "AgentDecisionId");

            migrationBuilder.CreateIndex(
                name: "IX_reasoning_audit_entries_CreatedAt",
                table: "reasoning_audit_entries",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_prompt_experiment_outcomes_ExperimentId",
                table: "prompt_experiment_outcomes",
                column: "ExperimentId");

            migrationBuilder.CreateIndex(
                name: "IX_prompt_experiment_outcomes_RecordedAt",
                table: "prompt_experiment_outcomes",
                column: "RecordedAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "reasoning_audit_entries");
            migrationBuilder.DropTable(name: "prompt_experiment_outcomes");
        }
    }
}
