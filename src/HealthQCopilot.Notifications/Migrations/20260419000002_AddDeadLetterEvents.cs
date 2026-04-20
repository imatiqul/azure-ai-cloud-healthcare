using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HealthQCopilot.Notifications.Migrations
{
    /// <inheritdoc />
    public partial class AddDeadLetterEvents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "dead_letter_events",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    OriginalTopic = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false),
                    Payload = table.Column<string>(type: "TEXT", nullable: false),
                    ReceivedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    IsResolved = table.Column<bool>(type: "INTEGER", nullable: false),
                    ResolvedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_dead_letter_events", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_dead_letter_events_IsResolved",
                table: "dead_letter_events",
                column: "IsResolved");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "dead_letter_events");
        }
    }
}
