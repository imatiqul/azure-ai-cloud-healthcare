namespace HealthQCopilot.Agents.Endpoints;

/// <summary>
/// Backend-hosted demo data endpoints for routes that don't have dedicated DB-backed services.
/// All data is defined in C# and served from the backend — zero frontend hardcoding.
/// Routes are grouped by domain but served from the Agents service since it acts as the
/// catch-all BFF for the demo shell.
/// </summary>
public static class DemoDataEndpoints
{
    public static IEndpointRouteBuilder MapDemoDataEndpoints(this IEndpointRouteBuilder app)
    {
        // ── Platform health ───────────────────────────────────────────────────
        app.MapGet("/api/v1/platform/health", () => Results.Ok(new[]
        {
            new { service = "AI Agent Service",      status = "Healthy", latencyMs = 42,  uptime = "99.97%", version = "3.2.1" },
            new { service = "Population Health",     status = "Healthy", latencyMs = 31,  uptime = "99.99%", version = "2.8.4" },
            new { service = "Revenue Cycle",         status = "Healthy", latencyMs = 58,  uptime = "99.95%", version = "1.6.2" },
            new { service = "Scheduling",            status = "Healthy", latencyMs = 24,  uptime = "99.98%", version = "2.1.0" },
            new { service = "Voice Processing",      status = "Healthy", latencyMs = 67,  uptime = "99.91%", version = "1.9.3" },
            new { service = "Identity & Access",     status = "Healthy", latencyMs = 18,  uptime = "99.99%", version = "3.0.5" },
            new { service = "Notifications",         status = "Healthy", latencyMs = 39,  uptime = "99.96%", version = "2.4.1" },
            new { service = "FHIR Gateway",          status = "Healthy", latencyMs = 112, uptime = "99.89%", version = "4.0.1" },
        }))
        .WithTags("Demo")
        .WithSummary("Platform service health overview");

        // ── Business KPIs ─────────────────────────────────────────────────────
        app.MapGet("/api/v1/kpi", () => Results.Ok(new
        {
            denialRate              = 12.4,
            denialRateChange        = -2.1,
            firstPassResolutionRate = 89.3,
            fprChange               = 3.7,
            avgTimeToClose          = 8.2,
            avgTimeToCloseChange    = -1.4,
            revenueAtRisk           = 320400m,
            revenueAtRiskChange     = -15200m,
            monthlyRecoveredRevenue = 287500m,
            riskPatients            = 3,
            openCareGaps            = 12,
            schedulingUtilization   = 84.6,
            aiAccuracyRate          = 94.2,
        }))
        .WithTags("Demo")
        .WithSummary("Executive KPI dashboard metrics");

        // ── ML confidence metrics ─────────────────────────────────────────────
        app.MapGet("/api/v1/ml/confidence", () => Results.Ok(new[]
        {
            new { model = "Risk Stratification v3",     accuracy = 0.942, precision = 0.938, recall = 0.946, f1 = 0.942, auc = 0.971, samplesEvaluated = 4820, lastEvaluated = DateTime.UtcNow.AddHours(-2) },
            new { model = "Denial Prediction v2",       accuracy = 0.891, precision = 0.884, recall = 0.899, f1 = 0.891, auc = 0.943, samplesEvaluated = 2340, lastEvaluated = DateTime.UtcNow.AddHours(-6) },
            new { model = "Readmission Risk v4",        accuracy = 0.876, precision = 0.869, recall = 0.883, f1 = 0.876, auc = 0.928, samplesEvaluated = 3150, lastEvaluated = DateTime.UtcNow.AddHours(-4) },
            new { model = "Care Gap Detection v1",      accuracy = 0.913, precision = 0.908, recall = 0.918, f1 = 0.913, auc = 0.957, samplesEvaluated = 6200, lastEvaluated = DateTime.UtcNow.AddHours(-1) },
            new { model = "Triage Classification v2",  accuracy = 0.958, precision = 0.954, recall = 0.962, f1 = 0.958, auc = 0.982, samplesEvaluated = 1890, lastEvaluated = DateTime.UtcNow.AddMinutes(-30) },
        }))
        .WithTags("Demo")
        .WithSummary("ML model confidence and performance metrics");

        // ── Models registry ───────────────────────────────────────────────────
        app.MapGet("/api/v1/models/registry", () => Results.Ok(new[]
        {
            new { id = "mdl-001", name = "Risk Stratification",   version = "v3.2", stage = "Production", framework = "XGBoost", accuracy = 0.942, deployedAt = DateTime.UtcNow.AddDays(-14) },
            new { id = "mdl-002", name = "Denial Prediction",     version = "v2.1", stage = "Production", framework = "LightGBM", accuracy = 0.891, deployedAt = DateTime.UtcNow.AddDays(-30) },
            new { id = "mdl-003", name = "Readmission Risk",      version = "v4.0", stage = "Production", framework = "CatBoost", accuracy = 0.876, deployedAt = DateTime.UtcNow.AddDays(-7) },
            new { id = "mdl-004", name = "Care Gap Detection",    version = "v1.5", stage = "Production", framework = "RandomForest", accuracy = 0.913, deployedAt = DateTime.UtcNow.AddDays(-21) },
            new { id = "mdl-005", name = "Triage Classifier",     version = "v2.3", stage = "Production", framework = "Transformers", accuracy = 0.958, deployedAt = DateTime.UtcNow.AddDays(-3) },
            new { id = "mdl-006", name = "Cost Predictor",        version = "v1.1", stage = "Staging",    framework = "GradientBoosting", accuracy = 0.847, deployedAt = DateTime.UtcNow.AddDays(-2) },
        }))
        .WithTags("Demo")
        .WithSummary("Model registry entries");

        // ── A/B experiments ───────────────────────────────────────────────────
        app.MapGet("/api/v1/experiments", () => Results.Ok(new[]
        {
            new { id = "exp-001", name = "Triage Prompt v3 vs v4",           status = "Running",   control = "Prompt v3", treatment = "Prompt v4", sampleSize = 1240, uplift = 0.024, pValue = 0.041, startedAt = DateTime.UtcNow.AddDays(-12) },
            new { id = "exp-002", name = "Risk Score Threshold 0.7 vs 0.75", status = "Running",   control = "0.70",      treatment = "0.75",      sampleSize = 3820, uplift = -0.003,pValue = 0.412, startedAt = DateTime.UtcNow.AddDays(-8) },
            new { id = "exp-003", name = "SDOH Factor Inclusion",            status = "Concluded", control = "Without",   treatment = "With SDOH", sampleSize = 5200, uplift = 0.061, pValue = 0.002, startedAt = DateTime.UtcNow.AddDays(-45) },
        }))
        .WithTags("Demo")
        .WithSummary("A/B experiment summaries");

        // ── XAI explanations ──────────────────────────────────────────────────
        app.MapGet("/api/v1/xai/explanations", () => Results.Ok(new
        {
            patientId = "PAT-001",
            model     = "Risk Stratification v3",
            riskScore = 0.94,
            features  = new[]
            {
                new { feature = "Heart Failure Diagnosis",    importance = 0.31, direction = "Positive", value = "Present" },
                new { feature = "CKD Stage >= 3",             importance = 0.24, direction = "Positive", value = "Stage 3" },
                new { feature = "ED Visits (12 months)",      importance = 0.18, direction = "Positive", value = "4 visits" },
                new { feature = "Medication Adherence",       importance = 0.12, direction = "Positive", value = "72%" },
                new { feature = "Age",                        importance = 0.09, direction = "Positive", value = "71 years" },
                new { feature = "BNP Level",                  importance = 0.06, direction = "Positive", value = "480 pg/mL" },
            },
            generatedAt = DateTime.UtcNow.AddMinutes(-5),
        }))
        .WithTags("Demo")
        .WithSummary("XAI model explanation for highest-risk patient");

        // ── Governance ────────────────────────────────────────────────────────
        app.MapGet("/api/v1/governance", () => Results.Ok(new
        {
            totalModels     = 6,
            compliantModels = 5,
            underReview     = 1,
            lastAudit       = DateTime.UtcNow.AddDays(-7),
            nextAudit       = DateTime.UtcNow.AddDays(23),
            riskCategories  = new[] { "High", "Medium", "Low" },
            alerts          = new[]
            {
                new { severity = "Warning", message = "Cost Predictor v1.1 accuracy below 85% threshold — human review recommended" },
                new { severity = "Info",    message = "Model cards updated for Q2 compliance cycle" },
            },
        }))
        .WithTags("Demo")
        .WithSummary("AI governance summary");

        // ── Population risk distribution (aggregate, not patient-level) ───────
        app.MapGet("/api/v1/population-health/risk-distribution", () => Results.Ok(new[]
        {
            new { level = "Critical", count = 2,  percentage = 25.0 },
            new { level = "High",     count = 3,  percentage = 37.5 },
            new { level = "Moderate", count = 2,  percentage = 25.0 },
            new { level = "Low",      count = 1,  percentage = 12.5 },
        }))
        .WithTags("Demo")
        .WithSummary("Population risk level distribution");

        // ── Population risk trajectory (aggregate trend, not patient-specific) ─
        app.MapGet("/api/v1/population-health/risk-trajectory", () =>
        {
            var now = DateTime.UtcNow;
            return Results.Ok(Enumerable.Range(0, 90).Select(i => new
            {
                date      = now.AddDays(-89 + i).ToString("yyyy-MM-dd"),
                avgScore  = Math.Round(0.55 + 0.08 * Math.Sin(i / 12.0) + i * 0.0009, 3),
                critCount = i > 60 ? 2 : (i > 30 ? 1 : 0),
            }));
        })
        .WithTags("Demo")
        .WithSummary("90-day population risk trajectory (aggregate)");

        // ── Engagement: appointment history ──────────────────────────────────
        app.MapGet("/api/v1/engagement/appointment-history", () => Results.Ok(new[]
        {
            new { date = DateTime.UtcNow.AddDays(-45).ToString("yyyy-MM-dd"), kept = 142, cancelled = 18, noShow = 9,  total = 169 },
            new { date = DateTime.UtcNow.AddDays(-38).ToString("yyyy-MM-dd"), kept = 158, cancelled = 12, noShow = 7,  total = 177 },
            new { date = DateTime.UtcNow.AddDays(-31).ToString("yyyy-MM-dd"), kept = 165, cancelled = 21, noShow = 11, total = 197 },
            new { date = DateTime.UtcNow.AddDays(-24).ToString("yyyy-MM-dd"), kept = 149, cancelled = 14, noShow = 6,  total = 169 },
            new { date = DateTime.UtcNow.AddDays(-17).ToString("yyyy-MM-dd"), kept = 171, cancelled = 9,  noShow = 5,  total = 185 },
            new { date = DateTime.UtcNow.AddDays(-10).ToString("yyyy-MM-dd"), kept = 183, cancelled = 16, noShow = 8,  total = 207 },
            new { date = DateTime.UtcNow.AddDays(-3).ToString("yyyy-MM-dd"),  kept = 176, cancelled = 11, noShow = 4,  total = 191 },
        }))
        .WithTags("Demo")
        .WithSummary("Weekly appointment adherence history");

        // ── Engagement: prior auth status ─────────────────────────────────────
        app.MapGet("/api/v1/engagement/prior-auth-status", () => Results.Ok(new[]
        {
            new { status = "Approved",  count = 1,  percentage = 25.0 },
            new { status = "Pending",   count = 2,  percentage = 50.0 },
            new { status = "Denied",    count = 1,  percentage = 25.0 },
        }))
        .WithTags("Demo")
        .WithSummary("Prior authorisation status summary");

        // ── Engagement: care gap summary ──────────────────────────────────────
        app.MapGet("/api/v1/engagement/care-gap-summary", () => Results.Ok(new
        {
            total      = 12,
            open       = 10,
            closed     = 2,
            overdue    = 4,
            byMeasure  = new[]
            {
                new { measure = "HbA1c",            open = 1, closed = 0 },
                new { measure = "Eye Exam",          open = 1, closed = 0 },
                new { measure = "BNP",               open = 1, closed = 1 },
                new { measure = "Mammogram",         open = 1, closed = 0 },
                new { measure = "Colonoscopy",       open = 1, closed = 0 },
                new { measure = "Blood Pressure",    open = 1, closed = 0 },
                new { measure = "Spirometry",        open = 1, closed = 0 },
                new { measure = "Statin Therapy",    open = 1, closed = 0 },
                new { measure = "Wellness Visit",    open = 1, closed = 0 },
                new { measure = "BMI Counseling",    open = 0, closed = 1 },
                new { measure = "Pain Management",   open = 1, closed = 0 },
                new { measure = "Pneumovax",         open = 1, closed = 0 },
            },
        }))
        .WithTags("Demo")
        .WithSummary("Care gap summary across all patients");

        // ── Agents: feedback list ─────────────────────────────────────────────
        app.MapGet("/api/v1/agents/feedback", () => Results.Ok(new[]
        {
            new { id = "fb-001", source = "Dr. E. Parker",    rating = 5, comment = "Triage classification was spot-on — saved 20 minutes.",           category = "Triage",   submittedAt = DateTime.UtcNow.AddHours(-3) },
            new { id = "fb-002", source = "Nurse T. Williams", rating = 4, comment = "Care gap alerts useful but too many low-priority notifications.", category = "CareGap",  submittedAt = DateTime.UtcNow.AddHours(-7) },
            new { id = "fb-003", source = "Dr. M. Chandra",   rating = 5, comment = "Risk stratification aligned with my clinical assessment.",         category = "Risk",     submittedAt = DateTime.UtcNow.AddDays(-1) },
            new { id = "fb-004", source = "Mark Wilson",       rating = 3, comment = "Revenue denial suggestions need more context before actioning.",   category = "Revenue",  submittedAt = DateTime.UtcNow.AddDays(-2) },
            new { id = "fb-005", source = "Dr. Robert Smith",  rating = 5, comment = "Scheduling AI correctly identified scheduling conflicts.",          category = "Schedule", submittedAt = DateTime.UtcNow.AddDays(-3) },
        }))
        .WithTags("Demo")
        .WithSummary("Clinician feedback on AI assistant recommendations");

        // ── Feedback summary ──────────────────────────────────────────────────
        app.MapGet("/api/v1/feedback/summary", () => Results.Ok(new
        {
            totalFeedback    = 5,
            avgRating        = 4.4,
            positiveRate     = 80.0,
            byCategory       = new[]
            {
                new { category = "Triage",   avg = 5.0, count = 1 },
                new { category = "CareGap",  avg = 4.0, count = 1 },
                new { category = "Risk",     avg = 5.0, count = 1 },
                new { category = "Revenue",  avg = 3.0, count = 1 },
                new { category = "Schedule", avg = 5.0, count = 1 },
            },
        }))
        .WithTags("Demo")
        .WithSummary("Aggregate feedback summary");

        // ── Delivery analytics (notifications) ───────────────────────────────
        app.MapGet("/api/v1/delivery/analytics", () => Results.Ok(new
        {
            totalSent       = 1840,
            delivered       = 1792,
            opened          = 1124,
            clicked         = 387,
            deliveryRate    = 97.4,
            openRate        = 62.7,
            clickRate       = 21.0,
            byChannel       = new[]
            {
                new { channel = "Push",  sent = 920, delivered = 901, opened = 634 },
                new { channel = "Email", sent = 680, delivered = 672, opened = 401 },
                new { channel = "SMS",   sent = 240, delivered = 219, opened = 89 },
            },
        }))
        .WithTags("Demo")
        .WithSummary("Notification delivery analytics");

        // ── Guide viewing history ─────────────────────────────────────────────
        app.MapGet("/api/v1/guide/history", () => Results.Ok(new[]
        {
            new { id = "gh-001", title = "Risk Stratification Overview",   viewedAt = DateTime.UtcNow.AddMinutes(-8),   duration = 142 },
            new { id = "gh-002", title = "Denial Management Workflow",     viewedAt = DateTime.UtcNow.AddMinutes(-35),  duration = 87  },
            new { id = "gh-003", title = "Care Gap HEDIS Measures",        viewedAt = DateTime.UtcNow.AddHours(-2),     duration = 203 },
            new { id = "gh-004", title = "AI Triage Escalation Protocol",  viewedAt = DateTime.UtcNow.AddHours(-5),     duration = 165 },
            new { id = "gh-005", title = "Scheduling Waitlist Management", viewedAt = DateTime.UtcNow.AddDays(-1),      duration = 118 },
        }))
        .WithTags("Demo")
        .WithSummary("Recent guide viewing history");

        // ── Patient search results (population health) ────────────────────────
        app.MapGet("/api/v1/population-health/patients", () => Results.Ok(new[]
        {
            new { id = "PAT-001", name = "Sarah Mitchell",   dob = "1952-03-14", mrn = "MRN-00891", riskLevel = "Critical", openCareGaps = 2, lastVisit = DateTime.UtcNow.AddDays(-7).ToString("yyyy-MM-dd") },
            new { id = "PAT-002", name = "David Okafor",     dob = "1958-09-22", mrn = "MRN-00892", riskLevel = "Critical", openCareGaps = 2, lastVisit = DateTime.UtcNow.AddDays(-14).ToString("yyyy-MM-dd") },
            new { id = "PAT-003", name = "Maria Gonzalez",   dob = "1965-07-08", mrn = "MRN-00893", riskLevel = "High",     openCareGaps = 2, lastVisit = DateTime.UtcNow.AddDays(-21).ToString("yyyy-MM-dd") },
            new { id = "PAT-004", name = "James Williams",   dob = "1971-11-30", mrn = "MRN-00894", riskLevel = "High",     openCareGaps = 2, lastVisit = DateTime.UtcNow.AddDays(-28).ToString("yyyy-MM-dd") },
            new { id = "PAT-005", name = "Elena Petrov",     dob = "1978-04-17", mrn = "MRN-00895", riskLevel = "High",     openCareGaps = 2, lastVisit = DateTime.UtcNow.AddDays(-10).ToString("yyyy-MM-dd") },
            new { id = "PAT-006", name = "Michael Thompson", dob = "1984-12-05", mrn = "MRN-00896", riskLevel = "Moderate", openCareGaps = 1, lastVisit = DateTime.UtcNow.AddDays(-45).ToString("yyyy-MM-dd") },
            new { id = "PAT-007", name = "Linda Chen",       dob = "1990-06-19", mrn = "MRN-00897", riskLevel = "Moderate", openCareGaps = 1, lastVisit = DateTime.UtcNow.AddDays(-60).ToString("yyyy-MM-dd") },
            new { id = "PAT-008", name = "Robert Kim",       dob = "1995-02-28", mrn = "MRN-00898", riskLevel = "Low",      openCareGaps = 1, lastVisit = DateTime.UtcNow.AddDays(-90).ToString("yyyy-MM-dd") },
        }))
        .WithTags("Demo")
        .WithSummary("Patient search results with risk summary");

        // ── Tenant admin ──────────────────────────────────────────────────────
        app.MapGet("/api/v1/tenant", () => Results.Ok(new
        {
            tenantId     = "TENANT-DEMO-001",
            name         = "HealthQ Copilot Demo",
            plan         = "Enterprise",
            region       = "East US",
            dataResidency= "US",
            features     = new[] { "ai-triage", "risk-stratification", "revenue-cycle", "population-health", "voice-ai", "scheduling" },
            createdAt    = DateTime.UtcNow.AddDays(-180),
        }))
        .WithTags("Demo")
        .WithSummary("Current tenant configuration");

        // ── Admin audit summary ───────────────────────────────────────────────
        app.MapGet("/api/v1/admin/audit/summary", () => Results.Ok(new
        {
            totalEvents     = 4820,
            last24Hours     = 247,
            phiAccessEvents = 83,
            breakGlassEvents= 2,
            failedLogins    = 4,
            topUsers        = new[]
            {
                new { userId = "00000000-0001-0000-0000-000000000001", displayName = "Dr. E. Parker",   events = 94 },
                new { userId = "00000000-0002-0000-0000-000000000002", displayName = "Dr. M. Chandra",  events = 71 },
                new { userId = "00000000-0004-0000-0000-000000000004", displayName = "Mark Wilson",     events = 58 },
            },
        }))
        .WithTags("Demo")
        .WithSummary("Admin audit event summary");

        return app;
    }
}
