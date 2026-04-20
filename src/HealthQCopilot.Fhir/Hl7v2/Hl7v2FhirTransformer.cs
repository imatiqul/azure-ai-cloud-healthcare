using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace HealthQCopilot.Fhir.Hl7v2;

/// <summary>
/// Transforms HL7 v2 messages into FHIR R4 resources and writes them to the FHIR server.
///
/// Supported message types:
///   ADT^A01 — Patient Admit      → Create/update FHIR Patient + Encounter (class: IMP)
///   ADT^A03 — Patient Discharge  → Update Encounter status to "finished"
///   ADT^A08 — Patient Update     → Update FHIR Patient demographics
///   ORU^R01 — Lab Results        → Create FHIR Observation resources
///
/// All other message types receive an AA (Application Accept) ACK with no action.
/// </summary>
public sealed class Hl7v2FhirTransformer(
    IHttpClientFactory httpClientFactory,
    ILogger<Hl7v2FhirTransformer> logger) : IHl7v2MessageHandler
{
    private static readonly JsonSerializerOptions JsonOpts =
        new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public async Task<string> HandleAsync(byte[] messageBytes, CancellationToken ct)
    {
        Hl7v2Message msg;
        try
        {
            msg = Hl7v2Message.Parse(messageBytes);
        }
        catch (FormatException ex)
        {
            logger.LogWarning(ex, "MLLP: failed to parse HL7 v2 message");
            return BuildAck("AE", string.Empty, $"Parse error: {ex.Message}");
        }

        logger.LogInformation("MLLP: processing {Type}^{Event} MsgId={MsgId}",
            msg.MessageType, msg.EventTrigger, msg.MessageControlId);

        try
        {
            await ProcessAsync(msg, ct);
            return BuildAck("AA", msg.MessageControlId, "Message accepted");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "MLLP: error processing {Type}^{Event} MsgId={MsgId}",
                msg.MessageType, msg.EventTrigger, msg.MessageControlId);
            return BuildAck("AE", msg.MessageControlId, $"Processing error: {ex.Message}");
        }
    }

    private async Task ProcessAsync(Hl7v2Message msg, CancellationToken ct)
    {
        var key = $"{msg.MessageType}^{msg.EventTrigger}".ToUpperInvariant();
        switch (key)
        {
            case "ADT^A01": // Admit
            case "ADT^A04": // Register outpatient
                await HandleAdtAdmitAsync(msg, ct);
                break;
            case "ADT^A03": // Discharge
                await HandleAdtDischargeAsync(msg, ct);
                break;
            case "ADT^A08": // Update patient info
                await HandleAdtUpdatePatientAsync(msg, ct);
                break;
            case "ORU^R01": // Observation result
                await HandleOruR01Async(msg, ct);
                break;
            default:
                logger.LogDebug("MLLP: message type {Key} — no transform action", key);
                break;
        }
    }

    // ── ADT^A01 / A04 — Patient Admit ────────────────────────────────────────

    private async Task HandleAdtAdmitAsync(Hl7v2Message msg, CancellationToken ct)
    {
        var patient = BuildPatientResource(msg);
        var encounter = BuildEncounterResource(msg, "in-progress");

        var client = httpClientFactory.CreateClient("FhirServer");

        // Upsert Patient by identifier (MRN from PID-3)
        var pid3 = msg.GetFields("PID").Get(2, 0, 0); // PID-3.1 = MRN
        if (!string.IsNullOrEmpty(pid3))
        {
            var searchResp = await client.GetAsync($"Patient?identifier={Uri.EscapeDataString(pid3)}", ct);
            if (searchResp.IsSuccessStatusCode)
            {
                var searchJson = await searchResp.Content.ReadAsStringAsync(ct);
                using var searchDoc = JsonDocument.Parse(searchJson);
                if (searchDoc.RootElement.TryGetProperty("entry", out var entries)
                    && entries.GetArrayLength() > 0)
                {
                    var existingId = entries[0]
                        .GetProperty("resource")
                        .GetProperty("id")
                        .GetString();

                    patient["id"] = existingId!;
                    await client.PutAsync($"Patient/{existingId}",
                        JsonContent.Create(patient, options: JsonOpts), ct);
                }
                else
                {
                    var createResp = await client.PostAsync("Patient",
                        JsonContent.Create(patient, options: JsonOpts), ct);
                    var created = await createResp.Content.ReadAsStringAsync(ct);
                    using var doc = JsonDocument.Parse(created);
                    if (doc.RootElement.TryGetProperty("id", out var idProp))
                    {
                        encounter["subject"] = new Dictionary<string, string>
                            { ["reference"] = $"Patient/{idProp.GetString()}" };
                    }
                }
            }
        }

        await client.PostAsync("Encounter", JsonContent.Create(encounter, options: JsonOpts), ct);
        logger.LogInformation("MLLP ADT^A01: created Patient + Encounter for MRN {Mrn}", pid3);
    }

    // ── ADT^A03 — Discharge ───────────────────────────────────────────────────

    private async Task HandleAdtDischargeAsync(Hl7v2Message msg, CancellationToken ct)
    {
        var client = httpClientFactory.CreateClient("FhirServer");

        // Find the admission encounter via patient identifier
        var pid3 = msg.GetFields("PID").Get(2, 0, 0);
        var searchResp = await client.GetAsync(
            $"Encounter?patient.identifier={Uri.EscapeDataString(pid3)}&status=in-progress", ct);
        if (!searchResp.IsSuccessStatusCode) return;

        var json = await searchResp.Content.ReadAsStringAsync(ct);
        using var doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty("entry", out var entries) || entries.GetArrayLength() == 0)
            return;

        // Patch first matching encounter to "finished"
        var encId = entries[0].GetProperty("resource").GetProperty("id").GetString();
        var encResource = entries[0].GetProperty("resource").Clone();

        // Build updated encounter JSON with status = finished
        var updated = JsonSerializer.Deserialize<Dictionary<string, object>>(
            encResource.GetRawText())!;
        updated["status"] = "finished";
        var pv1 = msg.GetFields("PV1");
        var dischargeTs = pv1.Get(44, 0, 0); // PV1-45 = discharge date/time
        if (!string.IsNullOrEmpty(dischargeTs))
            updated["period"] = new { end = ParseHl7DateTime(dischargeTs) };

        await client.PutAsync($"Encounter/{encId}",
            JsonContent.Create(updated, options: JsonOpts), ct);
        logger.LogInformation("MLLP ADT^A03: discharged Encounter {EncId}", encId);
    }

    // ── ADT^A08 — Update Patient ──────────────────────────────────────────────

    private async Task HandleAdtUpdatePatientAsync(Hl7v2Message msg, CancellationToken ct)
    {
        var client = httpClientFactory.CreateClient("FhirServer");
        var pid3 = msg.GetFields("PID").Get(2, 0, 0);

        var searchResp = await client.GetAsync($"Patient?identifier={Uri.EscapeDataString(pid3)}", ct);
        if (!searchResp.IsSuccessStatusCode) return;

        var json = await searchResp.Content.ReadAsStringAsync(ct);
        using var doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty("entry", out var entries) || entries.GetArrayLength() == 0)
        {
            // Patient not found — create as a new admit
            await HandleAdtAdmitAsync(msg, ct);
            return;
        }

        var existingId = entries[0].GetProperty("resource").GetProperty("id").GetString();
        var patient = BuildPatientResource(msg);
        patient["id"] = existingId!;
        await client.PutAsync($"Patient/{existingId}",
            JsonContent.Create(patient, options: JsonOpts), ct);
        logger.LogInformation("MLLP ADT^A08: updated Patient {PatientId}", existingId);
    }

    // ── ORU^R01 — Lab Results ─────────────────────────────────────────────────

    private async Task HandleOruR01Async(Hl7v2Message msg, CancellationToken ct)
    {
        var client = httpClientFactory.CreateClient("FhirServer");
        var pid3 = msg.GetFields("PID").Get(2, 0, 0);

        // Resolve FHIR Patient ID
        string? fhirPatientId = null;
        if (!string.IsNullOrEmpty(pid3))
        {
            var searchResp = await client.GetAsync($"Patient?identifier={Uri.EscapeDataString(pid3)}", ct);
            if (searchResp.IsSuccessStatusCode)
            {
                var json = await searchResp.Content.ReadAsStringAsync(ct);
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("entry", out var entries) && entries.GetArrayLength() > 0)
                    fhirPatientId = entries[0].GetProperty("resource").GetProperty("id").GetString();
            }
        }

        // OBX segments — each is one observation
        var obxCount = msg.SegmentCount("OBX");
        for (var i = 0; i < obxCount; i++)
        {
            var obx = msg.GetFields("OBX", i);
            var observation = BuildObservationResource(obx, fhirPatientId);
            await client.PostAsync("Observation",
                JsonContent.Create(observation, options: JsonOpts), ct);
        }

        logger.LogInformation("MLLP ORU^R01: created {Count} Observation(s) for MRN {Mrn}", obxCount, pid3);
    }

    // ── FHIR Resource builders ────────────────────────────────────────────────

    private static Dictionary<string, object> BuildPatientResource(Hl7v2Message msg)
    {
        var pid = msg.GetFields("PID");
        var familyName = pid.Get(4, 0, 0); // PID-5.1 family name
        var givenName  = pid.Get(4, 0, 1); // PID-5.2 given name
        var dob        = pid.Get(6, 0, 0); // PID-7 date of birth (YYYYMMDD)
        var gender     = pid.Get(7, 0, 0); // PID-8 sex
        var mrn        = pid.Get(2, 0, 0); // PID-3 patient identifier

        return new Dictionary<string, object>
        {
            ["resourceType"] = "Patient",
            ["identifier"] = new[]
            {
                new { system = "urn:oid:2.16.840.1.113883.4.1", value = mrn }
            },
            ["name"] = new[]
            {
                new { use = "official", family = familyName, given = new[] { givenName } }
            },
            ["gender"] = gender switch
            {
                "M" => "male",
                "F" => "female",
                "O" => "other",
                _ => "unknown"
            },
            ["birthDate"] = string.IsNullOrEmpty(dob) ? (object)DBNull.Value
                : dob.Length >= 8
                    ? $"{dob[..4]}-{dob[4..6]}-{dob[6..8]}"
                    : dob,
        };
    }

    private static Dictionary<string, object> BuildEncounterResource(Hl7v2Message msg, string status)
    {
        var pv1 = msg.GetFields("PV1");
        var pid = msg.GetFields("PID");
        var mrn = pid.Get(2, 0, 0);
        var admitTs = pv1.Get(43, 0, 0); // PV1-44 = admit datetime

        var enc = new Dictionary<string, object>
        {
            ["resourceType"] = "Encounter",
            ["status"] = status,
            ["class"] = new { system = "http://terminology.hl7.org/CodeSystem/v3-ActCode", code = "IMP", display = "inpatient encounter" },
            ["subject"] = new { reference = $"Patient?identifier={mrn}" },
            ["period"] = new { start = string.IsNullOrEmpty(admitTs) ? DateTime.UtcNow.ToString("o") : ParseHl7DateTime(admitTs) },
        };

        return enc;
    }

    private static Dictionary<string, object> BuildObservationResource(SegmentFields obx, string? fhirPatientId)
    {
        var loincCode = obx.Get(2, 0, 0); // OBX-3.1
        var loincText = obx.Get(2, 0, 1); // OBX-3.2
        var value     = obx.Get(4, 0, 0); // OBX-5.1
        var unit      = obx.Get(5, 0, 0); // OBX-6.1
        var status    = obx.Get(10, 0, 0); // OBX-11 (F=final, P=preliminary)
        var obsTs     = obx.Get(13, 0, 0); // OBX-14 date/time

        var obs = new Dictionary<string, object>
        {
            ["resourceType"] = "Observation",
            ["status"] = status == "F" ? "final" : status == "P" ? "preliminary" : "unknown",
            ["code"] = new
            {
                coding = new[]
                {
                    new { system = "http://loinc.org", code = loincCode, display = loincText }
                },
                text = loincText
            },
        };

        if (fhirPatientId is not null)
            obs["subject"] = new { reference = $"Patient/{fhirPatientId}" };

        if (!string.IsNullOrEmpty(obsTs))
            obs["effectiveDateTime"] = ParseHl7DateTime(obsTs);

        // Try numeric value, fall back to string
        if (decimal.TryParse(value, out var numericValue))
        {
            obs["valueQuantity"] = new { value = numericValue, unit, system = "http://unitsofmeasure.org", code = unit };
        }
        else if (!string.IsNullOrEmpty(value))
        {
            obs["valueString"] = value;
        }

        return obs;
    }

    // ── HL7 ACK builder ───────────────────────────────────────────────────────

    private static string BuildAck(string ackCode, string msgControlId, string text)
    {
        var ts = DateTime.UtcNow.ToString("yyyyMMddHHmmss");
        return $"MSH|^~\\&|HEALTHQ|HEALTHQ|EHR|EHR|{ts}||ACK|{ts}|P|2.5\r" +
               $"MSA|{ackCode}|{msgControlId}|{text}\r";
    }

    // ── HL7 datetime → ISO 8601 ───────────────────────────────────────────────

    private static string ParseHl7DateTime(string hl7Dt)
    {
        if (hl7Dt.Length >= 14
            && DateTime.TryParseExact(hl7Dt[..14], "yyyyMMddHHmmss",
                null, System.Globalization.DateTimeStyles.None, out var dt))
            return dt.ToString("o");

        if (hl7Dt.Length >= 8
            && DateTime.TryParseExact(hl7Dt[..8], "yyyyMMdd",
                null, System.Globalization.DateTimeStyles.None, out var d))
            return d.ToString("yyyy-MM-dd");

        return hl7Dt;
    }
}
