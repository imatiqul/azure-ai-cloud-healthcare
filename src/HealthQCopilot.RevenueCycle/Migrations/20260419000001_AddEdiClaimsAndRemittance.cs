using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HealthQCopilot.RevenueCycle.Migrations;

/// <inheritdoc />
public partial class AddEdiClaimsAndRemittance : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // ── claim_submissions ────────────────────────────────────────────────
        migrationBuilder.CreateTable(
            name: "claim_submissions",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                CodingJobId = table.Column<Guid>(type: "uuid", nullable: false),
                PatientId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                PatientName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                EncounterId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                InsurancePayer = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                DiagnosisCodes = table.Column<string>(type: "text", nullable: false, defaultValue: ""),
                ClaimType = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                ClearinghouseClaimId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                TotalChargesCents = table.Column<long>(type: "bigint", nullable: false),
                InterchangeControlNumber = table.Column<string>(type: "character varying(9)", maxLength: 9, nullable: false),
                CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                SubmittedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                AcknowledgedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                RejectionReason = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_claim_submissions", x => x.Id);
            });

        migrationBuilder.CreateIndex(
            name: "IX_claim_submissions_CodingJobId",
            table: "claim_submissions",
            column: "CodingJobId");

        migrationBuilder.CreateIndex(
            name: "IX_claim_submissions_PatientId",
            table: "claim_submissions",
            column: "PatientId");

        migrationBuilder.CreateIndex(
            name: "IX_claim_submissions_Status",
            table: "claim_submissions",
            column: "Status");

        // ── remittance_advices ───────────────────────────────────────────────
        migrationBuilder.CreateTable(
            name: "remittance_advices",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                PaymentReferenceNumber = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                PayerName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                TotalPaymentCents = table.Column<long>(type: "bigint", nullable: false),
                PaymentMethod = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                PaymentDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                PostedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_remittance_advices", x => x.Id);
            });

        migrationBuilder.CreateIndex(
            name: "IX_remittance_advices_PaymentReferenceNumber",
            table: "remittance_advices",
            column: "PaymentReferenceNumber");

        migrationBuilder.CreateIndex(
            name: "IX_remittance_advices_Status",
            table: "remittance_advices",
            column: "Status");

        // ── remittance_claim_lines ───────────────────────────────────────────
        migrationBuilder.CreateTable(
            name: "remittance_claim_lines",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                RemittanceAdviceId = table.Column<Guid>(type: "uuid", nullable: false),
                ClearinghouseClaimId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                PatientId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                BilledAmountCents = table.Column<long>(type: "bigint", nullable: false),
                PaidAmountCents = table.Column<long>(type: "bigint", nullable: false),
                ClpStatusCode = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: false),
                DenialReasonCode = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_remittance_claim_lines", x => x.Id);
                table.ForeignKey(
                    name: "FK_remittance_claim_lines_remittance_advices_RemittanceAdviceId",
                    column: x => x.RemittanceAdviceId,
                    principalTable: "remittance_advices",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_remittance_claim_lines_RemittanceAdviceId",
            table: "remittance_claim_lines",
            column: "RemittanceAdviceId");

        // ── remittance_service_lines ─────────────────────────────────────────
        migrationBuilder.CreateTable(
            name: "remittance_service_lines",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                RemittanceClaimLineId = table.Column<Guid>(type: "uuid", nullable: false),
                ProcedureCode = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                BilledCents = table.Column<long>(type: "bigint", nullable: false),
                PaidCents = table.Column<long>(type: "bigint", nullable: false),
                ReasonCode = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_remittance_service_lines", x => x.Id);
                table.ForeignKey(
                    name: "FK_remittance_service_lines_remittance_claim_lines_RemittanceClaimLineId",
                    column: x => x.RemittanceClaimLineId,
                    principalTable: "remittance_claim_lines",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_remittance_service_lines_RemittanceClaimLineId",
            table: "remittance_service_lines",
            column: "RemittanceClaimLineId");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "remittance_service_lines");
        migrationBuilder.DropTable(name: "remittance_claim_lines");
        migrationBuilder.DropTable(name: "remittance_advices");
        migrationBuilder.DropTable(name: "claim_submissions");
    }
}
