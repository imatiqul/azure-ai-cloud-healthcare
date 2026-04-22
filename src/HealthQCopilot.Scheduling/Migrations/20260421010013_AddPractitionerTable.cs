using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HealthQCopilot.Scheduling.Migrations
{
    /// <inheritdoc />
    public partial class AddPractitionerTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "practitioners",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    PractitionerId = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false),
                    Specialty = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    Email = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false),
                    AvailabilityStart = table.Column<TimeOnly>(type: "TEXT", nullable: false),
                    AvailabilityEnd = table.Column<TimeOnly>(type: "TEXT", nullable: false),
                    TimeZoneId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_practitioners", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "waitlist_entries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    PatientId = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    PractitionerId = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    PreferredDateFrom = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    PreferredDateTo = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    Status = table.Column<string>(type: "TEXT", nullable: false),
                    Priority = table.Column<int>(type: "INTEGER", nullable: false),
                    Reason = table.Column<string>(type: "TEXT", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    PromotedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    PromotedToBookingId = table.Column<Guid>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_waitlist_entries", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_practitioners_IsActive",
                table: "practitioners",
                column: "IsActive");

            migrationBuilder.CreateIndex(
                name: "IX_practitioners_PractitionerId",
                table: "practitioners",
                column: "PractitionerId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_waitlist_entries_PatientId_Status",
                table: "waitlist_entries",
                columns: new[] { "PatientId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_waitlist_entries_PractitionerId_Status",
                table: "waitlist_entries",
                columns: new[] { "PractitionerId", "Status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "practitioners");

            migrationBuilder.DropTable(
                name: "waitlist_entries");
        }
    }
}
