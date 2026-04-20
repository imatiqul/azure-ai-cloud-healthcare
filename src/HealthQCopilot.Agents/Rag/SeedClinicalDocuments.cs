namespace HealthQCopilot.Agents.Rag;

/// <summary>
/// Seed clinical knowledge base documents.
/// These are chunked and ingested into Qdrant on first startup.
/// In production, this is supplemented with organization-specific clinical protocols,
/// drug formularies, CPT/ICD-10 code maps, and payer-specific prior auth criteria
/// loaded from Azure Blob Storage.
///
/// Document categories:
///   "protocol"  — clinical workflow protocols (triage, escalation, care pathways)
///   "guideline" — evidence-based clinical guidelines (AHA, JNC8, ADA, USPSTF)
///   "drug"      — drug interactions, formulary, dosing guidelines
///   "icd10"     — ICD-10 code descriptions and coding guidance
///   "hedis"     — HEDIS measure definitions and denominator/numerator criteria
/// </summary>
public static class SeedClinicalDocuments
{
    public static IEnumerable<(string Source, string Category, string Text)> GetAll()
    {
        // ── Triage Protocols ──────────────────────────────────────────────────

        yield return ("triage-protocol-p1.md", "protocol",
            """
            P1 — Immediate (Emergency): Activate within 5 minutes.
            Indicators: chest pain, stroke symptoms (FAST: face drooping, arm weakness, speech difficulty, time),
            respiratory distress (SpO2 < 90%), severe allergic reaction (anaphylaxis), uncontrolled hemorrhage,
            altered consciousness (GCS < 9), septic shock (HR > 130, BP < 90 systolic, fever > 38.5°C),
            acute MI (ST-elevation on ECG, troponin rise).
            Action: Alert attending physician, prepare resuscitation bay, activate STEMI/stroke pathway.
            """);

        yield return ("triage-protocol-p2.md", "protocol",
            """
            P2 — Urgent: Assessment within 15–30 minutes.
            Indicators: moderate abdominal pain, moderate dyspnea (SpO2 92–95%), fractures without neurovascular compromise,
            high fever (> 39.5°C) with systemic signs, active asthma attack (mild-moderate), hypertensive urgency
            (BP 180–220 systolic, no end-organ damage), severe headache without focal neuro signs,
            GI bleeding (haematemesis or melena) haemodynamically stable.
            Action: Continuous pulse oximetry, IV access, labs, specialist consult within 60 minutes.
            """);

        yield return ("triage-protocol-p3.md", "protocol",
            """
            P3 — Standard: Assessment within 60 minutes.
            Indicators: stable vital signs, minor lacerations, urinary symptoms, low-grade fever (< 38.5°C),
            back pain (no red flags), vomiting/diarrhea without dehydration, minor trauma.
            Action: Standard nursing assessment, analgesia PRN, diagnostic workup as indicated.
            """);

        yield return ("triage-protocol-p4.md", "protocol",
            """
            P4 — Non-Urgent: Assessment within 2 hours.
            Indicators: chronic condition follow-up, prescription refill, routine lab results review,
            minor skin conditions, dental pain (stable), chronic pain management review.
            Action: Register, document chief complaint, reassess if condition changes.
            """);

        // ── Sepsis ────────────────────────────────────────────────────────────

        yield return ("sepsis-bundle.md", "guideline",
            """
            Surviving Sepsis Campaign 1-Hour Bundle (SSC 2018 Update):
            1. Measure lactate — if > 2 mmol/L, repeat within 2 hours.
            2. Obtain blood cultures before antibiotics (at least 2 sets).
            3. Administer broad-spectrum IV antibiotics within 1 hour of sepsis recognition.
            4. Fluid resuscitation: 30 mL/kg IV crystalloid for hypotension (MAP < 65) or lactate ≥ 4 mmol/L.
            5. Vasopressors: norepinephrine first-line if MAP < 65 after adequate fluid resuscitation.
            SOFA criteria: assess organ dysfunction — respiratory (PaO2/FiO2 ratio), coagulation (platelets),
            liver (bilirubin), cardiovascular (MAP, vasopressors), CNS (GCS), renal (creatinine, urine output).
            qSOFA ≥ 2 outside ICU: suspect sepsis and initiate full SOFA assessment.
            """);

        // ── Diabetes Management ───────────────────────────────────────────────

        yield return ("ada-diabetes-2024.md", "guideline",
            """
            ADA Standards of Medical Care in Diabetes 2024:
            Glycemic targets: HbA1c < 7.0% for most adults; 7.5–8.0% for elderly with comorbidities.
            First-line: Metformin 500mg BID (titrate to 2000mg/day); dose reduce if eGFR < 45, stop if < 30.
            Second-line additions: SGLT-2 inhibitor (empagliflozin, dapagliflozin) preferred if HF or CKD;
              GLP-1 agonist (semaglutide, liraglutide) preferred if obesity or ASCVD risk reduction needed.
            Blood pressure target: < 130/80 mmHg; ACE inhibitor/ARB preferred if albuminuria present.
            Statin therapy: moderate-intensity if age 40–75; high-intensity if ASCVD or 10-year risk > 20%.
            Annual monitoring: HbA1c (every 3 months if uncontrolled), eGFR, urine albumin-creatinine ratio,
              lipid panel, dilated retinal exam, foot exam, blood pressure.
            Hypoglycemia management: 15g fast-acting carbohydrate for BGL < 3.9 mmol/L; recheck in 15 minutes.
            """);

        // ── Heart Failure ─────────────────────────────────────────────────────

        yield return ("aha-heart-failure-2022.md", "guideline",
            """
            ACC/AHA 2022 Heart Failure Guidelines:
            HFrEF (EF ≤ 40%): GDMT — ACE inhibitor/ARB/ARNI + beta-blocker + MRA + SGLT-2 inhibitor.
              ARNI (sacubitril/valsartan) preferred over ACE-I if NYHA II-III, stable BP.
              Carvedilol, metoprolol succinate, or bisoprolol are evidence-based beta-blockers.
              Loop diuretics (furosemide) for decongestion — target euvolemia; monitor electrolytes and renal function.
            HFpEF (EF ≥ 50%): SGLT-2 inhibitors (empagliflozin, dapagliflozin) reduce HF hospitalisations.
              Blood pressure control, treat AF if present, diuretics for symptomatic volume overload.
            NYHA Functional Classification: I (no symptoms), II (symptoms with moderate exertion),
              III (symptoms with minimal exertion), IV (symptoms at rest).
            Acute decompensated HF: IV diuretics (furosemide 40–80 mg bolus or infusion),
              vasodilators (nitroglycerin, nesiritide) if hypertensive; inotropes if cardiogenic shock.
            ICD indication: EF ≤ 35%, NYHA II–III, on GDMT ≥ 90 days, life expectancy > 1 year.
            """);

        // ── Hypertension ──────────────────────────────────────────────────────

        yield return ("jnc8-hypertension.md", "guideline",
            """
            JNC 8 / 2017 AHA Hypertension Guideline:
            Normal: < 120/80 mmHg. Elevated: 120–129 / < 80 mmHg. Stage 1 HTN: 130–139 / 80–89 mmHg.
            Stage 2 HTN: ≥ 140/90 mmHg. Hypertensive crisis: > 180/120 mmHg.
            Treatment thresholds: Initiate medication at ≥ 130/80 mmHg with CVD or 10-year ASCVD risk ≥ 10%.
              All patients ≥ 140/90 mmHg should receive medication.
            Preferred agents: ACE-I or ARB (not in combination) for DM or CKD;
              thiazide diuretic (chlorthalidone 12.5–25 mg/day) as first-line for general hypertension;
              amlodipine (CCB) for Black patients or elderly;
              beta-blockers reserved for CAD, HF with reduced EF, or post-MI.
            Resistant hypertension (BP uncontrolled on 3 agents including diuretic):
              add spironolactone 25–50 mg/day; screen for secondary causes (renal artery stenosis, hyperaldosteronism).
            """);

        // ── COPD ─────────────────────────────────────────────────────────────

        yield return ("gold-copd-2024.md", "guideline",
            """
            GOLD 2024 COPD Report:
            Diagnosis: post-bronchodilator FEV1/FVC < 0.70. Grade by FEV1: GOLD 1 (≥ 80%), GOLD 2 (50–79%),
              GOLD 3 (30–49%), GOLD 4 (< 30%).
            Group by symptoms + exacerbations: A (low symptoms, 0–1 exacerbation), B (high symptoms, 0–1 exacerbation),
              E (≥ 2 exacerbations or ≥ 1 hospitalisation).
            Initial therapy: Group A — short-acting bronchodilator (SABA or SAMA PRN).
              Group B — long-acting bronchodilator (LABA or LAMA preferred).
              Group E — LAMA + LABA ± ICS (add ICS if eosinophils > 300 cells/μL).
            Acute exacerbation: short-acting bronchodilators, systemic corticosteroids (prednisolone 40 mg/day × 5 days),
              antibiotics if purulent sputum or CRP > 40. Oxygen to maintain SpO2 88–92%.
            Pulmonary rehabilitation: indicated for MRC dyspnoea scale ≥ 2. Improves exercise tolerance, QoL, reduces hospitalisations.
            Smoking cessation: first-line intervention; varenicline most effective pharmacotherapy.
            """);

        // ── ICD-10 Common Codes ───────────────────────────────────────────────

        yield return ("icd10-common-codes.md", "icd10",
            """
            Common ICD-10-CM codes for AI triage assistance:
            I21.9  — Acute myocardial infarction, unspecified
            I63.9  — Cerebral infarction, unspecified (stroke)
            J96.00 — Acute respiratory failure, unspecified
            A41.9  — Sepsis, unspecified organism
            I50.9  — Heart failure, unspecified
            J44.1  — COPD with acute exacerbation
            E11.9  — Type 2 diabetes mellitus without complications
            E11.65 — Type 2 diabetes mellitus with hyperglycemia
            I10    — Essential (primary) hypertension
            N18.3  — Chronic kidney disease, stage 3 (GFR 30–59)
            N18.4  — Chronic kidney disease, stage 4 (GFR 15–29)
            N18.6  — End-stage renal disease
            J18.9  — Pneumonia, unspecified
            K92.1  — Melena (GI bleeding)
            T78.2XXA — Anaphylaxis, initial encounter
            R55    — Syncope and collapse
            R00.0  — Tachycardia, unspecified (HR > 100)
            R06.00 — Dyspnea, unspecified
            R07.9  — Chest pain, unspecified
            """);

        // ── Drug Interactions ─────────────────────────────────────────────────

        yield return ("drug-interactions-critical.md", "drug",
            """
            Critical Drug-Drug Interactions (DDI) — Clinical Decision Support Reference:
            Warfarin + NSAIDs: increased bleeding risk — avoid; use paracetamol for analgesia.
            Warfarin + antibiotics (metronidazole, fluoroquinolones, azoles): INR increase — reduce warfarin dose, monitor INR 2–3× per week.
            ACE inhibitor + potassium-sparing diuretic (spironolactone): risk of hyperkalaemia — monitor serum K+ at 1 week.
            SSRI + tramadol: serotonin syndrome risk — avoid; use alternative analgesics.
            Metformin + IV contrast: hold metformin 48h before/after IV contrast if eGFR < 60 — risk of lactic acidosis.
            Statins + macrolide antibiotics (clarithromycin, erythromycin): increased myopathy risk — suspend statin or use azithromycin.
            QT-prolonging drugs (haloperidol, ondansetron, azithromycin, moxifloxacin): additive QT prolongation — ECG monitoring, avoid combinations.
            Digoxin + amiodarone: digoxin toxicity — reduce digoxin dose by 50%, monitor levels.
            Lithium + thiazide diuretics: lithium toxicity — monitor levels, adjust dose.
            """);

        // ── HEDIS Measures ────────────────────────────────────────────────────

        yield return ("hedis-measures.md", "hedis",
            """
            NCQA HEDIS Key Measures for Population Health Management:
            CDC-HbA1c (Comprehensive Diabetes Care): % members with diabetes, aged 18–75, with HbA1c < 8.0%.
              Denominator: members with type 1 or 2 diabetes, age 18–75, enrolled ≥ 12 months.
              Numerator: HbA1c < 8.0% in measurement year.

            CBP (Controlling High Blood Pressure): % members aged 18–85 with diagnosed HTN, BP < 140/90 mmHg.

            BCS (Breast Cancer Screening): % women 50–74 with ≥ 1 mammogram in prior 2 years.

            COL (Colorectal Cancer Screening): % members 45–75 appropriately screened.
              Acceptable tests: FOBT (annual), FIT-DNA (every 1–3 years), flexible sigmoidoscopy (every 5 years),
              CT colonography (every 5 years), colonoscopy (every 10 years).

            FUH (Follow-up after Hospitalization for Mental Illness): % discharges with follow-up within 7 days and 30 days.

            AMR (Asthma Medication Ratio): % members aged 5–64 with persistent asthma with ratio ≥ 0.50 controller to total asthma medications.

            PPC (Prenatal/Postpartum Care): % deliveries with prenatal visit in first trimester and postpartum visit within 7–84 days.

            Plan score calculation: each measure contributes to the overall HEDIS composite. Rates are risk-adjusted for age, sex, socioeconomic status.
            Gap identification: patients not meeting numerator criteria within 90 days of year-end are flagged for care gap outreach.
            """);

        // ── Prior Authorization Criteria ──────────────────────────────────────

        yield return ("prior-auth-criteria.md", "protocol",
            """
            Common Prior Authorization Criteria (Payer-Agnostic Reference):
            Biologic therapies (adalimumab, etanercept, infliximab — rheumatoid arthritis):
              Require: ≥ 3 months failure of ≥ 2 conventional DMARDs (methotrexate, hydroxychloroquine, sulfasalazine),
              documented disease activity (DAS28 > 3.2 or CDAI > 10), negative TB screen.

            GLP-1 agonists for obesity (semaglutide 2.4 mg — Wegovy):
              Require: BMI ≥ 30 (or ≥ 27 with weight-related comorbidity), failed ≥ 6 months dietary/exercise intervention,
              no personal/family history of medullary thyroid carcinoma or MEN2.

            Advanced imaging (MRI spine, PET scan):
              MRI lumbar spine: ≥ 6 weeks conservative therapy failure, neurological deficit, or red flag symptoms.
              PET scan: documented cancer staging or restaging, treatment response evaluation.

            Specialty drugs (> $500/month): step therapy required — document failure of preferred alternatives.
            """);
    }
}
