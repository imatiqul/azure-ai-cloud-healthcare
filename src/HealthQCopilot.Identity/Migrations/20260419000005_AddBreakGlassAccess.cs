using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HealthQCopilot.Identity.Migrations;

/// <inheritdoc />
public partial class AddBreakGlassAccess : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "break_glass_accesses",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                RequestedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                TargetPatientId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                ClinicalJustification = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false, defaultValue: "Active"),
                GrantedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                RevokedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                RevokedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                RevocationReason = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_break_glass_accesses", x => x.Id);
            });

        migrationBuilder.CreateIndex(
            name: "IX_break_glass_accesses_RequestedByUserId",
            table: "break_glass_accesses",
            column: "RequestedByUserId");

        migrationBuilder.CreateIndex(
            name: "IX_break_glass_accesses_TargetPatientId",
            table: "break_glass_accesses",
            column: "TargetPatientId");

        migrationBuilder.CreateIndex(
            name: "IX_break_glass_accesses_Status_ExpiresAt",
            table: "break_glass_accesses",
            columns: ["Status", "ExpiresAt"]);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "break_glass_accesses");
    }
}
