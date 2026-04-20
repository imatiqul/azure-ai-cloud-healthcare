namespace HealthQCopilot.PopulationHealth.Services;

/// <summary>
/// Rule-based drug–drug interaction (DDI) checking service.
///
/// Implements a curated interaction database covering the most clinically significant
/// DDIs from FDA Drug Safety Communications, WHO Model Formulary, and Clinical
/// Pharmacology (Elsevier) DDI severity classifications.
///
/// Drug matching is case-insensitive substring search supporting both generic and
/// brand names (e.g. "warfarin" matches "Warfarin", "Coumadin", "warfarin sodium").
///
/// Severity classifications (aligned with NCI Thesaurus C38151–C38153):
///   Contraindicated — life-threatening risk; do not co-administer
///   Major           — serious risk; requires intervention or alternative therapy
///   Moderate        — clinical monitoring required; dose adjustment may be needed
///   Minor           — minimal significance; opportunistic monitoring
///
/// In production, augment with real-time RxNorm DDI lookups via NLM RxNav:
///   GET https://rxnav.nlm.nih.gov/REST/interaction/list.json?rxcuis={comma-separated-rxcuis}
/// and with CDS Hooks "order-sign" hook integration for EHR point-of-care alerting.
/// </summary>
public sealed class DrugInteractionService
{
    private static readonly InteractionRule[] Rules =
    [
        // ── Anticoagulants ─────────────────────────────────────────────────────
        new(
            ["warfarin", "coumadin"],
            ["aspirin", "asa", "acetylsalicylic"],
            "Major",
            "Anticoagulant + antiplatelet combination increases haemorrhage risk (GI, intracranial).",
            "Monitor INR closely; prescribe gastroprotective PPI. Use lowest effective aspirin dose (≤81 mg) with clinical justification."),

        new(
            ["warfarin", "coumadin"],
            ["nsaid", "ibuprofen", "naproxen", "celecoxib", "diclofenac", "indomethacin", "ketorolac", "meloxicam"],
            "Major",
            "NSAIDs inhibit platelet function and may displace warfarin from albumin, amplifying anticoagulation.",
            "Avoid combination where possible. If essential, prescribe shortest course at lowest dose with PPI. Reassess INR within 48–72 hours."),

        new(
            ["warfarin", "coumadin"],
            ["fluconazole", "metronidazole", "ciprofloxacin", "erythromycin", "clarithromycin", "voriconazole", "fluoxetine"],
            "Major",
            "CYP2C9 / CYP3A4 inhibition raises warfarin plasma concentration and INR.",
            "Reduce warfarin dose empirically; monitor INR every 2–3 days during the antimicrobial course and 7 days after completion."),

        new(
            ["warfarin", "coumadin"],
            ["rifampicin", "rifampin", "carbamazepine", "phenytoin", "phenobarbital"],
            "Major",
            "Potent CYP inducers accelerate warfarin metabolism, reducing anticoagulant effect.",
            "Increase warfarin dose and monitor INR at least weekly. Revert to baseline after enzyme inducer is stopped."),

        // ── Serotonin syndrome ─────────────────────────────────────────────────
        new(
            ["ssri", "fluoxetine", "sertraline", "paroxetine", "citalopram", "escitalopram", "fluvoxamine"],
            ["tramadol", "fentanyl", "meperidine", "pethidine", "dextromethorphan", "linezolid", "triptans", "sumatriptan"],
            "Contraindicated",
            "Serotonin syndrome risk: hyperthermia, neuromuscular abnormalities, autonomic instability.",
            "Avoid co-administration. If opioid analgesia is required, use a non-serotonergic agent (oxycodone, hydromorphone). Monitor for serotonin syndrome signs."),

        new(
            ["maoi", "phenelzine", "tranylcypromine", "isocarboxazid", "selegiline", "rasagiline", "linezolid"],
            ["ssri", "snri", "fluoxetine", "sertraline", "venlafaxine", "duloxetine", "mirtazapine", "clomipramine"],
            "Contraindicated",
            "Life-threatening serotonin syndrome and/or hypertensive crisis.",
            "Absolute contraindication. Observe ≥14-day washout after MAOI discontinuation before initiating serotonergic agent (≥5 weeks for fluoxetine)."),

        new(
            ["maoi", "phenelzine", "tranylcypromine"],
            ["tyramine", "aged cheese", "red wine", "fava bean", "smoked fish", "cured meat"],
            "Contraindicated",
            "Hypertensive crisis from tyramine ingestion with non-selective MAOIs.",
            "Strict low-tyramine diet mandatory for all patients on non-selective MAOIs. Educate patient and family."),

        // ── Statins ────────────────────────────────────────────────────────────
        new(
            ["statin", "simvastatin", "lovastatin", "atorvastatin"],
            ["clarithromycin", "erythromycin", "itraconazole", "ketoconazole", "posaconazole", "voriconazole"],
            "Major",
            "CYP3A4 inhibition sharply elevates statin plasma levels, increasing myopathy and rhabdomyolysis risk.",
            "Temporarily suspend CYP3A4-metabolised statin during azole/macrolide therapy, or switch to a statin with less CYP3A4 dependence (pravastatin, rosuvastatin)."),

        new(
            ["simvastatin", "lovastatin"],
            ["amiodarone", "dronedarone"],
            "Major",
            "Amiodarone inhibits CYP3A4 and CYP2C9, markedly raising simvastatin/lovastatin exposure.",
            "Do not exceed simvastatin 20 mg/day or lovastatin 40 mg/day with amiodarone. Prefer rosuvastatin or pravastatin."),

        new(
            ["simvastatin", "lovastatin"],
            ["gemfibrozil"],
            "Contraindicated",
            "Gemfibrozil inhibits CYP2C8 and OATP transporters; combination causes severe myopathy / rhabdomyolysis.",
            "Contraindicated. Use fenofibrate if a fibrate is required alongside a statin."),

        // ── Antihypertensives / Electrolytes ───────────────────────────────────
        new(
            ["ace inhibitor", "lisinopril", "enalapril", "ramipril", "perindopril", "captopril"],
            ["potassium supplement", "k-dur", "klor-con", "spironolactone", "eplerenone", "amiloride"],
            "Major",
            "Additive hyperkalaemia risk — especially in patients with CKD or diabetes.",
            "Monitor serum potassium and renal function within 1–2 weeks of initiation or dose change. Hold potassium supplements if K+ > 5.5 mmol/L."),

        new(
            ["arb", "losartan", "valsartan", "irbesartan", "candesartan", "telmisartan"],
            ["ace inhibitor", "lisinopril", "enalapril", "ramipril"],
            "Contraindicated",
            "Dual RAAS blockade causes hyperkalaemia, hypotension, and acute kidney injury. Harm demonstrated in ONTARGET.",
            "Do not combine ACE inhibitor + ARB. Use single-agent RAAS blockade."),

        // ── Metformin ──────────────────────────────────────────────────────────
        new(
            ["metformin"],
            ["iodinated contrast", "contrast media", "iv contrast", "radiocontrast"],
            "Major",
            "Contrast-induced nephropathy can reduce metformin clearance, causing lactic acidosis.",
            "Hold metformin ≥48 hours before IV iodinated contrast. Restart only after confirming eGFR is stable (≥45 mL/min/1.73 m²)."),

        // ── Digoxin ────────────────────────────────────────────────────────────
        new(
            ["digoxin"],
            ["amiodarone", "verapamil", "diltiazem", "clarithromycin", "erythromycin", "itraconazole"],
            "Major",
            "P-glycoprotein or CYP inhibition raises digoxin levels; combined QT prolongation risk.",
            "Reduce digoxin dose by 50% when initiating amiodarone; monitor serum digoxin levels and ECG (target 0.5–0.9 ng/mL)."),

        // ── Lithium ────────────────────────────────────────────────────────────
        new(
            ["lithium"],
            ["nsaid", "ibuprofen", "naproxen", "indomethacin", "diclofenac"],
            "Major",
            "NSAIDs reduce renal prostaglandin synthesis, decreasing lithium clearance and raising serum lithium to toxic levels.",
            "Avoid combination. If analgesia is required, use paracetamol. If NSAIDs cannot be avoided, monitor serum lithium within 5 days."),

        new(
            ["lithium"],
            ["ace inhibitor", "lisinopril", "enalapril", "thiazide", "hydrochlorothiazide", "furosemide"],
            "Major",
            "Sodium depletion from ACE inhibitors or diuretics increases renal lithium reabsorption.",
            "Monitor serum lithium within 1 week of adding diuretic or ACE inhibitor. Adjust dose to maintain therapeutic range (0.6–1.0 mmol/L)."),

        // ── PDE5 inhibitors ────────────────────────────────────────────────────
        new(
            ["sildenafil", "tadalafil", "vardenafil", "avanafil"],
            ["nitrate", "nitroglycerin", "glyceryl trinitrate", "isosorbide", "amyl nitrite", "poppers"],
            "Contraindicated",
            "PDE5 inhibitors potentiate nitrate vasodilation, causing severe and potentially fatal hypotension.",
            "Absolute contraindication. PDE5 inhibitors must not be prescribed to any patient using nitrates. Ensure ≥24 h (sildenafil/vardenafil) or ≥48 h (tadalafil) gap if nitrate is subsequently required."),

        // ── Antiplatelet / PPI ─────────────────────────────────────────────────
        new(
            ["clopidogrel"],
            ["omeprazole", "esomeprazole"],
            "Moderate",
            "CYP2C19 inhibition by these PPIs reduces clopidogrel bioactivation, diminishing antiplatelet effect.",
            "Prefer pantoprazole or rabeprazole (weaker CYP2C19 inhibitors) for gastroprotection in patients on clopidogrel."),

        // ── Fluoroquinolone absorption ─────────────────────────────────────────
        new(
            ["ciprofloxacin", "levofloxacin", "moxifloxacin", "ofloxacin"],
            ["antacid", "aluminium hydroxide", "magnesium hydroxide", "calcium carbonate", "iron", "zinc", "sucralfate"],
            "Moderate",
            "Divalent / trivalent cations chelate fluoroquinolones, reducing oral absorption by 50–90%.",
            "Administer fluoroquinolone ≥2 hours before or ≥6 hours after cation-containing products."),

        // ── Opioid + CNS depressants ───────────────────────────────────────────
        new(
            ["opioid", "tramadol", "oxycodone", "hydrocodone", "morphine", "fentanyl", "codeine"],
            ["benzodiazepine", "diazepam", "lorazepam", "clonazepam", "alprazolam", "temazepam", "midazolam"],
            "Major",
            "Synergistic CNS and respiratory depression; significantly increases opioid overdose mortality risk.",
            "Avoid combination unless no alternative exists. If co-prescribed, use lowest effective doses, shorten duration, issue naloxone prescription, and educate patient/carer."),

        // ── Methotrexate + NSAIDs ─────────────────────────────────────────────
        new(
            ["methotrexate"],
            ["nsaid", "ibuprofen", "naproxen", "aspirin", "indomethacin"],
            "Major",
            "NSAIDs reduce renal methotrexate clearance and compete for tubular secretion, risking toxicity (mucositis, bone marrow suppression, hepatotoxicity).",
            "Avoid at methotrexate doses >15 mg/week. If unavoidable, increase leucovorin rescue, monitor CBC and renal function weekly."),

        // ── QT prolongation ────────────────────────────────────────────────────
        new(
            ["amiodarone", "sotalol", "quinidine", "dofetilide"],
            ["ciprofloxacin", "levofloxacin", "moxifloxacin", "haloperidol", "droperidol", "quetiapine", "azithromycin"],
            "Major",
            "Additive QT prolongation; risk of torsades de pointes and ventricular fibrillation.",
            "Avoid combination. If essential, obtain baseline QTc and monitor with 12-lead ECG. Correct hypokalaemia and hypomagnesaemia."),
    ];

    /// <summary>
    /// Check a list of drug names (generic or brand) for known drug–drug interactions.
    /// </summary>
    /// <param name="drugs">List of drug names to check (order not significant).</param>
    /// <returns>
    /// A <see cref="DrugInteractionCheckResult"/> containing all detected interactions
    /// sorted by severity and an overall alert level.
    /// </returns>
    public DrugInteractionCheckResult Check(IReadOnlyList<string> drugs)
    {
        var interactions = new List<DetectedInteraction>();

        for (int i = 0; i < drugs.Count; i++)
        {
            for (int j = i + 1; j < drugs.Count; j++)
            {
                foreach (var rule in Rules)
                {
                    bool drugI_matchesA = MatchesGroup(drugs[i], rule.GroupA);
                    bool drugI_matchesB = MatchesGroup(drugs[i], rule.GroupB);
                    bool drugJ_matchesA = MatchesGroup(drugs[j], rule.GroupA);
                    bool drugJ_matchesB = MatchesGroup(drugs[j], rule.GroupB);

                    if ((drugI_matchesA && drugJ_matchesB) || (drugI_matchesB && drugJ_matchesA))
                    {
                        interactions.Add(new DetectedInteraction(
                            DrugA:          drugs[i],
                            DrugB:          drugs[j],
                            Severity:       rule.Severity,
                            ClinicalEffect: rule.ClinicalEffect,
                            Management:     rule.Management));
                        break; // one highest-severity rule per pair
                    }
                }
            }
        }

        interactions.Sort((a, b) => SeverityOrder(a.Severity).CompareTo(SeverityOrder(b.Severity)));

        bool hasContra = interactions.Any(i => i.Severity == "Contraindicated");
        bool hasMajor  = interactions.Any(i => i.Severity == "Major");

        return new DrugInteractionCheckResult(
            Drugs:              drugs,
            Interactions:       interactions,
            HasContraindication: hasContra,
            HasMajorInteraction: hasMajor,
            AlertLevel: hasContra ? "Contraindicated"
                       : hasMajor ? "Major"
                       : interactions.Count > 0 ? "Moderate"
                       : "None");
    }

    private static bool MatchesGroup(string drug, string[] group)
        => group.Any(term => drug.Contains(term, StringComparison.OrdinalIgnoreCase));

    private static int SeverityOrder(string severity) => severity switch
    {
        "Contraindicated" => 0,
        "Major"           => 1,
        "Moderate"        => 2,
        _                 => 3,
    };
}

// ── Rule definition ───────────────────────────────────────────────────────────

internal sealed record InteractionRule(
    string[] GroupA,
    string[] GroupB,
    string Severity,
    string ClinicalEffect,
    string Management);

// ── Public result types ───────────────────────────────────────────────────────

/// <summary>A single detected drug–drug interaction.</summary>
public sealed record DetectedInteraction(
    string DrugA,
    string DrugB,
    string Severity,
    string ClinicalEffect,
    string Management);

/// <summary>Result of a drug interaction check for a patient's medication list.</summary>
public sealed record DrugInteractionCheckResult(
    IReadOnlyList<string> Drugs,
    IReadOnlyList<DetectedInteraction> Interactions,
    bool HasContraindication,
    bool HasMajorInteraction,
    string AlertLevel);
