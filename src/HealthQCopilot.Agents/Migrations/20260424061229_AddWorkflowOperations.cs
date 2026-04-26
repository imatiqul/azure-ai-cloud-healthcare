using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HealthQCopilot.Agents.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkflowOperations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ApprovalNote",
                table: "triage_workflows",
                type: "TEXT",
                maxLength: 2048,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ApprovedAt",
                table: "triage_workflows",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ApprovedBy",
                table: "triage_workflows",
                type: "TEXT",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "BookedAt",
                table: "triage_workflows",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BookingId",
                table: "triage_workflows",
                type: "TEXT",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CurrentPractitionerId",
                table: "triage_workflows",
                type: "TEXT",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CurrentSlotId",
                table: "triage_workflows",
                type: "TEXT",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EncounterStatus",
                table: "triage_workflows",
                type: "TEXT",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "HumanReviewDueAt",
                table: "triage_workflows",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastActivityAt",
                table: "triage_workflows",
                type: "TEXT",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<string>(
                name: "LatestExceptionCode",
                table: "triage_workflows",
                type: "TEXT",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LatestExceptionMessage",
                table: "triage_workflows",
                type: "TEXT",
                maxLength: 2048,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NotificationStatus",
                table: "triage_workflows",
                type: "TEXT",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "PatientId",
                table: "triage_workflows",
                type: "TEXT",
                maxLength: 256,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "PatientName",
                table: "triage_workflows",
                type: "TEXT",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RequiresAttention",
                table: "triage_workflows",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "RevenueStatus",
                table: "triage_workflows",
                type: "TEXT",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SchedulingStatus",
                table: "triage_workflows",
                type: "TEXT",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "WaitlistQueuedAt",
                table: "triage_workflows",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_triage_workflows_BookedAt",
                table: "triage_workflows",
                column: "BookedAt");

            migrationBuilder.CreateIndex(
                name: "IX_triage_workflows_PatientId",
                table: "triage_workflows",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_triage_workflows_RequiresAttention",
                table: "triage_workflows",
                column: "RequiresAttention");

            migrationBuilder.CreateIndex(
                name: "IX_triage_workflows_Status",
                table: "triage_workflows",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_triage_workflows_BookedAt",
                table: "triage_workflows");

            migrationBuilder.DropIndex(
                name: "IX_triage_workflows_PatientId",
                table: "triage_workflows");

            migrationBuilder.DropIndex(
                name: "IX_triage_workflows_RequiresAttention",
                table: "triage_workflows");

            migrationBuilder.DropIndex(
                name: "IX_triage_workflows_Status",
                table: "triage_workflows");

            migrationBuilder.DropColumn(
                name: "ApprovalNote",
                table: "triage_workflows");

            migrationBuilder.DropColumn(
                name: "ApprovedAt",
                table: "triage_workflows");

            migrationBuilder.DropColumn(
                name: "ApprovedBy",
                table: "triage_workflows");

            migrationBuilder.DropColumn(
                name: "BookedAt",
                table: "triage_workflows");

            migrationBuilder.DropColumn(
                name: "BookingId",
                table: "triage_workflows");

            migrationBuilder.DropColumn(
                name: "CurrentPractitionerId",
                table: "triage_workflows");

            migrationBuilder.DropColumn(
                name: "CurrentSlotId",
                table: "triage_workflows");

            migrationBuilder.DropColumn(
                name: "EncounterStatus",
                table: "triage_workflows");

            migrationBuilder.DropColumn(
                name: "HumanReviewDueAt",
                table: "triage_workflows");

            migrationBuilder.DropColumn(
                name: "LastActivityAt",
                table: "triage_workflows");

            migrationBuilder.DropColumn(
                name: "LatestExceptionCode",
                table: "triage_workflows");

            migrationBuilder.DropColumn(
                name: "LatestExceptionMessage",
                table: "triage_workflows");

            migrationBuilder.DropColumn(
                name: "NotificationStatus",
                table: "triage_workflows");

            migrationBuilder.DropColumn(
                name: "PatientId",
                table: "triage_workflows");

            migrationBuilder.DropColumn(
                name: "PatientName",
                table: "triage_workflows");

            migrationBuilder.DropColumn(
                name: "RequiresAttention",
                table: "triage_workflows");

            migrationBuilder.DropColumn(
                name: "RevenueStatus",
                table: "triage_workflows");

            migrationBuilder.DropColumn(
                name: "SchedulingStatus",
                table: "triage_workflows");

            migrationBuilder.DropColumn(
                name: "WaitlistQueuedAt",
                table: "triage_workflows");
        }
    }
}
