using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HealthQCopilot.Identity.Migrations
{
    /// <inheritdoc />
    public partial class AddFhirPatientId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FhirPatientId",
                table: "user_accounts",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FhirPatientId",
                table: "user_accounts");
        }
    }
}
