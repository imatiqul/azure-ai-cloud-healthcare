using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HealthQCopilot.Identity.Migrations;

/// <inheritdoc />
public partial class AddConsentRecords : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "consent_records",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                PatientUserId = table.Column<Guid>(type: "uuid", nullable: false),
                Purpose = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                Scope = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false, defaultValue: "Active"),
                JurisdictionCode = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: true),
                GrantedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                RevokedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                RevocationReason = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                GrantedByIp = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                PolicyVersion = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_consent_records", x => x.Id);
            });

        migrationBuilder.CreateIndex(
            name: "IX_consent_records_PatientUserId",
            table: "consent_records",
            column: "PatientUserId");

        migrationBuilder.CreateIndex(
            name: "IX_consent_records_PatientUserId_Purpose_Status",
            table: "consent_records",
            columns: ["PatientUserId", "Purpose", "Status"]);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "consent_records");
    }
}
