using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HealthQCopilot.Identity.Migrations;

/// <inheritdoc />
public partial class AddOtpRecords : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "otp_records",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                PhoneNumber = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                CodeHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                IsUsed = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                UserId = table.Column<Guid>(type: "uuid", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_otp_records", x => x.Id);
            });

        migrationBuilder.CreateIndex(
            name: "IX_otp_records_ExpiresAt",
            table: "otp_records",
            column: "ExpiresAt");

        migrationBuilder.CreateIndex(
            name: "IX_otp_records_PhoneNumber_IsUsed",
            table: "otp_records",
            columns: new[] { "PhoneNumber", "IsUsed" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "otp_records");
    }
}
