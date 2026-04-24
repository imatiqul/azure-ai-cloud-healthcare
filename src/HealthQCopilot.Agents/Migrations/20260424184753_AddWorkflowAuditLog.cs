using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HealthQCopilot.Agents.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkflowAuditLog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "workflow_audit_logs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    WorkflowId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Actor = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false),
                    Action = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    Note = table.Column<string>(type: "TEXT", maxLength: 2048, nullable: true),
                    Timestamp = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_workflow_audit_logs", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_workflow_audit_logs_Timestamp",
                table: "workflow_audit_logs",
                column: "Timestamp");

            migrationBuilder.CreateIndex(
                name: "IX_workflow_audit_logs_WorkflowId",
                table: "workflow_audit_logs",
                column: "WorkflowId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "workflow_audit_logs");
        }
    }
}
