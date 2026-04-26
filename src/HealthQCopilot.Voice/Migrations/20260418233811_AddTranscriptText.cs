using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HealthQCopilot.Voice.Migrations
{
    /// <inheritdoc />
    public partial class AddTranscriptText : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Only operation that is safe to run on PostgreSQL — the AlterColumn ops were
            // scaffolded against the SQLite design-time fallback and are suppressed here.
            migrationBuilder.AddColumn<string>(
                name: "TranscriptText",
                table: "voice_sessions",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TranscriptText",
                table: "voice_sessions");
        }
    }
}
