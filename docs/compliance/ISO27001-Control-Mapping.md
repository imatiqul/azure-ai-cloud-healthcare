# ISO 27001:2022 Control Mapping — HealthQ Copilot Platform

> **Standard**: ISO/IEC 27001:2022  
> **Annex A revision**: 2022 (93 controls in 4 themes)  
> **Scope**: HealthQ Copilot — cloud-native healthcare AI platform on Azure Container Apps  
> **Classification**: CONFIDENTIAL — Internal Compliance Documentation  
> **Owner**: Security & Compliance Team  
> **Last Updated**: 2025  
> **Review Cycle**: Annual or upon significant infrastructure change  

---

## Document Purpose

This document maps each ISO 27001:2022 Annex A control to the specific technical and organisational controls implemented in the HealthQ Copilot platform. The mapping supports:

- **Internal audits** — evidence traceability for auditors
- **Certification readiness** — gap identification before third-party audit
- **Risk treatment** — evidence that identified risks have accepted, mitigated, or transferred controls
- **Regulatory alignment** — supports HIPAA Security Rule cross-mapping (PHI = information asset)

**Status key**

| Symbol | Meaning |
|--------|---------|
| ✅ | Control implemented and evidence available |
| ⚠️ | Partial — control exists but gaps remain |
| ❌ | Not implemented — risk accepted or control excluded |
| N/A | Not applicable to platform scope |

---

## Theme A.5 — Organisational Controls (37 controls)

| Control | Title | Implementation | Status | Evidence |
|---------|-------|---------------|--------|---------|
| A.5.1 | Policies for information security | Information Security Policy, Acceptable Use Policy, and Data Classification Policy published in Confluence. Reviewed annually by CISO. | ✅ | Confluence policy repository |
| A.5.2 | Information security roles and responsibilities | RACI matrix defines CISO, DPO, Security Champions per microservice team. Defined in `docs/governance/RACI.md`. | ✅ | RACI.md, JD templates |
| A.5.3 | Segregation of duties | Prod deployments require two-person approval in GitHub Actions. No engineer has simultaneous write access to prod secrets and prod database. Azure RBAC enforced. | ✅ | GitHub branch protection rules, Azure RBAC assignments |
| A.5.4 | Management responsibilities | Security objectives included in team OKRs. Quarterly security reviews with engineering leads. | ✅ | OKR records |
| A.5.5 | Contact with authorities | IR plan includes DHS CISA reporting contact and HHS OCR breach notification contact. | ✅ | `docs/security/incident-response-plan.md` |
| A.5.6 | Contact with special interest groups | Membership in HIMSS, ISAC-H for threat intelligence sharing. | ⚠️ | Membership confirmation letters |
| A.5.7 | Threat intelligence | Azure Sentinel threat feeds + ISAC-H alerts ingested. CVE monitoring via Dependabot and GitHub Advanced Security. | ✅ | Sentinel workspace, Dependabot alerts |
| A.5.8 | Information security in project management | Security review gates in CI/CD pipeline: SAST, DAST, SCA. Threat model required for new services. | ✅ | GitHub Actions workflows, threat model templates |
| A.5.9 | Inventory of information and other associated assets | PHI data map maintained in Collibra; FHIR resource inventory in `docs/data/phi-inventory.md`. | ✅ | phi-inventory.md, Collibra catalog |
| A.5.10 | Acceptable use of information and other associated assets | AUP in onboarding pack; annual acknowledgement required. | ✅ | HR onboarding records |
| A.5.11 | Return of assets | Offboarding checklist includes device return, credential revocation, and Entra ID account disable. | ✅ | Offboarding checklist |
| A.5.12 | Classification of information | Four-tier classification: Public / Internal / Confidential / PHI-Restricted. Automated classification labels via Microsoft Purview. | ✅ | Purview configuration, classification policy |
| A.5.13 | Labelling of information | Microsoft Purview sensitivity labels applied to emails, Teams, SharePoint. HL7 FHIR resources tagged with `x-healthq-classification` extension. | ✅ | Purview label policies |
| A.5.14 | Information transfer | All API traffic TLS 1.3. Inter-service traffic via Dapr with mTLS. SFTP/FTPS for legacy EDI partner transfers. Data classification in DPA with partners. | ✅ | Dapr mTLS config, TLS policy |
| A.5.15 | Access control | Entra ID RBAC + Azure RBAC. Role definitions in `src/HealthQCopilot.Infrastructure/Auth/`. Least-privilege enforced. | ✅ | Entra ID groups, Azure RBAC |
| A.5.16 | Identity management | Entra ID as IdP. No shared accounts. Service identities use Managed Identities (no passwords). | ✅ | Entra ID tenant config |
| A.5.17 | Authentication information | Passwords prohibited for service-to-service. MFA required for all human accounts. Key Vault stores secrets; rotation policy 90 days. | ✅ | Entra MFA policy, Key Vault policies |
| A.5.18 | Access rights | Access provisioning via Entra ID groups with PIM for privileged roles. Quarterly access reviews. | ✅ | PIM configuration, access review reports |
| A.5.19 | Information security in supplier relationships | Supplier security assessments for all PHI-processing third parties. DPA and BAA in place. | ✅ | BAA register |
| A.5.20 | Addressing information security within supplier agreements | Security clauses in all vendor contracts: encryption, audit rights, breach notification within 24h. | ✅ | Contract templates |
| A.5.21 | Managing information security in the ICT supply chain | Software composition analysis in CI (Dependabot, OWASP Dependency-Check). Attestation from key suppliers. | ✅ | GitHub SCA reports |
| A.5.22 | Monitoring, review and change management of supplier services | Annual vendor risk reviews. Critical suppliers (Azure, Twilio, Qdrant) reviewed quarterly. | ⚠️ | Vendor review records |
| A.5.23 | Information security for use of cloud services | Cloud Security Policy covers IaaS/PaaS/SaaS usage. Azure Well-Architected review annually. | ✅ | Cloud security policy |
| A.5.24 | Information security incident management planning | IR plan documented, tested annually via tabletop exercise. Severity matrix defined. | ✅ | `docs/security/incident-response-plan.md` |
| A.5.25 | Assessment and decision on information security events | SOC analyst playbooks in Sentinel. P1 = immediate escalation to CISO. | ✅ | Sentinel playbooks |
| A.5.26 | Response to information security incidents | IR runbooks in `docs/security/runbooks/`. Azure Sentinel automated response for common attack patterns. | ✅ | Sentinel automation rules |
| A.5.27 | Learning from information security incidents | Post-incident reviews mandatory for P1/P2. Action items tracked in Jira Security project. | ✅ | PIR templates, Jira records |
| A.5.28 | Collection of evidence | Azure Monitor / Sentinel log retention 2 years. Immutable audit logs in Event Hubs. Legal hold capability via Purview. | ✅ | Log retention policies |
| A.5.29 | Information security during disruption | BCP/DR plan with RTO ≤4h / RPO ≤1h for PHI data. Geo-redundant Azure Container Apps + Cosmos DB failover. | ✅ | `docs/operations/bcp-dr.md` |
| A.5.30 | ICT readiness for business continuity | Quarterly DR drills. Chaos engineering via Azure Chaos Studio. | ⚠️ | DR drill reports |
| A.5.31 | Legal, statutory, regulatory and contractual requirements | Legal register maintained: HIPAA, HITECH, state privacy laws. DPO review for new features. | ✅ | Legal register |
| A.5.32 | Intellectual property rights | Open-source licence tracking via FOSSA. No GPL-licensed components in production runtime. | ✅ | FOSSA reports |
| A.5.33 | Protection of records | PHI records retention per HIPAA (6 years). Immutable blob storage for audit records. | ✅ | Azure Immutable Blob policies |
| A.5.34 | Privacy and protection of personally identifiable information | HIPAA Privacy Rule programme + GDPR for EU staff data. Privacy-by-design in product development. | ✅ | Privacy programme documentation |
| A.5.35 | Independent review of information security | Annual penetration test by accredited third party. Internal quarterly vulnerability scans. | ✅ | Pen test reports |
| A.5.36 | Compliance with policies, rules and standards | Automated compliance checks in CI (checkov, OPA Gatekeeper for AKS policies). | ✅ | CI pipeline, Gatekeeper policies |
| A.5.37 | Documented operating procedures | Runbooks for all production operations in `docs/operations/runbooks/`. | ✅ | Runbooks directory |

---

## Theme A.6 — People Controls (8 controls)

| Control | Title | Implementation | Status | Evidence |
|---------|-------|---------------|--------|---------|
| A.6.1 | Screening | Background checks required before employment for all staff with PHI access. Level proportional to data sensitivity. | ✅ | HR screening policy |
| A.6.2 | Terms and conditions of employment | Employment contracts include information security obligations, NDA, and acceptable use agreement. | ✅ | Contract templates |
| A.6.3 | Information security awareness, education and training | Annual HIPAA security awareness training mandatory. Role-based training for developers (OWASP Top 10). | ✅ | LMS completion records |
| A.6.4 | Disciplinary process | Disciplinary policy covers information security violations; reviewed by HR and Legal. | ✅ | HR disciplinary policy |
| A.6.5 | Responsibilities after termination or change of employment | Offboarding checklist: access revocation within 4h of termination. Exit interview includes security reminder. | ✅ | Offboarding checklist |
| A.6.6 | Confidentiality or non-disclosure agreements | NDAs with all staff and contractors covering PHI and proprietary information. | ✅ | NDA templates |
| A.6.7 | Remote working | Conditional access policies enforce compliant device, MFA, and Azure AD Joined status for remote work. | ✅ | Entra Conditional Access |
| A.6.8 | Information security event reporting | Slack `#security-incidents` channel + ServiceNow ticket for reporting. Clear "See Something, Say Something" training. | ✅ | Reporting procedures |

---

## Theme A.7 — Physical Controls (14 controls)

| Control | Title | Implementation | Status | Evidence |
|---------|-------|---------------|--------|---------|
| A.7.1 | Physical security perimeters | All production infrastructure hosted in Azure data centres. Microsoft's physical security certifications (ISO 27001, SOC 2 Type II) relied upon. | ✅ | Microsoft compliance docs |
| A.7.2 | Physical entry controls | Azure data centre access controlled by Microsoft (biometric, card access, CCTV). Office access via badge. | ✅ | Microsoft data centre policy |
| A.7.3 | Securing offices, rooms and facilities | Engineering offices require badge access. PHI screens require privacy filters. | ✅ | Physical security policy |
| A.7.4 | Physical security monitoring | Azure data centre CCTV managed by Microsoft. Office areas monitored per local policy. | ✅ | Microsoft data centre policy |
| A.7.5 | Protecting against physical and environmental threats | Azure Multi-zone deployment protects against facility-level threats (fire, flood, power). | ✅ | Azure availability zone config |
| A.7.6 | Working in secure areas | No PHI on whiteboards. Clean desk policy. PHI discussed only in designated areas. | ✅ | Clean desk policy |
| A.7.7 | Clear desk and clear screen | Automatic screen lock after 5 minutes via Intune MDM policy. | ✅ | Intune device compliance policy |
| A.7.8 | Equipment siting and protection | All compute runs in Azure (no on-premises hardware). Developer laptops encrypted (BitLocker/FileVault). | ✅ | Intune encryption reports |
| A.7.9 | Security of assets off-premises | Laptops encrypted. MDM remote wipe capability. VPN required for corporate resource access. | ✅ | Intune MDM policy |
| A.7.10 | Storage media | No local PHI storage on endpoints enforced by DLP policy in Microsoft Purview. | ✅ | Purview DLP policies |
| A.7.11 | Supporting utilities | Azure data centres provide redundant power, cooling, and connectivity. UPS and generator in place per Microsoft SLA. | ✅ | Azure SLA documentation |
| A.7.12 | Cabling security | Managed by Microsoft for Azure data centres. Office structured cabling follows TIA-568 standard. | ✅ | Microsoft data centre policy |
| A.7.13 | Equipment maintenance | Azure PaaS/SaaS components maintained by Microsoft. Developer hardware on refresh cycle. | N/A | Microsoft maintenance policy |
| A.7.14 | Secure disposal or re-use of equipment | Developer laptops wiped via Intune (NIST 800-88 compliant) before reuse or disposal. Azure decommissioning follows Microsoft data destruction policy. | ✅ | Intune wipe reports |

---

## Theme A.8 — Technological Controls (34 controls)

| Control | Title | Implementation | Status | Evidence |
|---------|-------|---------------|--------|---------|
| A.8.1 | User endpoint devices | All endpoints managed via Microsoft Intune. OS patching automated. Endpoint EDR via Microsoft Defender for Endpoint. | ✅ | Intune compliance reports |
| A.8.2 | Privileged access rights | Azure PIM for just-in-time privileged access. No standing prod admin access. Separate break-glass accounts with monitoring. | ✅ | PIM configuration |
| A.8.3 | Information access restriction | RBAC enforced at API layer (`[Authorize(Policy = ...)]`). Tenant isolation in `TenantMiddleware`. PHI endpoints require `clinical-data:read` scope. | ✅ | `src/HealthQCopilot.Infrastructure/Auth/` |
| A.8.4 | Access to source code | GitHub repository: CODEOWNERS enforcement. Branch protection on `main`. No direct push to main; PR + 2 reviews required. | ✅ | GitHub branch protection rules |
| A.8.5 | Secure authentication | JWT Bearer with Entra ID. MFA on all human accounts. PKCE for public clients. No implicit flow. | ✅ | Auth configuration |
| A.8.6 | Capacity management | Azure Container Apps autoscaling (KEDA). Azure Monitor alerts for resource saturation >80%. | ✅ | KEDA scaling rules, Monitor alerts |
| A.8.7 | Protection against malware | Microsoft Defender for Containers (image scanning). Defender for Endpoint on dev machines. GitHub Advanced Security SAST. | ✅ | Defender alerts, GitHub security tab |
| A.8.8 | Management of technical vulnerabilities | Dependabot for dependency CVEs. Container image scanning in CI (Trivy). Patch SLAs: Critical=24h, High=7d, Medium=30d. | ✅ | Dependabot policy, Trivy CI step |
| A.8.9 | Configuration management | Infrastructure as Code (Bicep). No manual prod changes. Configuration drift detection via Azure Policy. | ✅ | Bicep templates, Azure Policy |
| A.8.10 | Information deletion | Patient data deletion API (`DELETE /api/v1/patients/{id}`) supports HIPAA right-to-delete. Soft-delete with TTL purge job. | ✅ | `SoftDeleteInterceptor.cs`, purge job |
| A.8.11 | Data masking | PHI masked in logs via `PhiAuditMiddleware`. Structured log fields marked `[Sensitive]` are replaced with `***`. | ✅ | `PhiAuditMiddleware.cs` |
| A.8.12 | Data leakage prevention | Microsoft Purview DLP prevents PHI egress via email/Teams. API gateway blocks responses containing regex-matched PII patterns. | ⚠️ | Purview DLP, API gateway WAF rules |
| A.8.13 | Information backup | Azure Database for PostgreSQL — automated backups 35-day retention, geo-redundant. Cosmos DB continuous backup. Event Hub capture to Blob. | ✅ | Azure backup reports |
| A.8.14 | Redundancy of information processing facilities | Azure multi-zone Container Apps + Load Balancer. Database zone-redundant. | ✅ | Azure architecture diagrams |
| A.8.15 | Logging | Structured logging (Serilog → Application Insights). Audit log via `EventHubAuditService`. Log levels: Info (API), Warn (auth failures), Error (exceptions). | ✅ | `ObservabilityExtensions.cs`, audit service |
| A.8.16 | Monitoring activities | Azure Monitor + Application Insights dashboards. Sentinel SIEM for security events. Uptime SLO alerting via Monitor. | ✅ | Monitor workbooks, Sentinel rules |
| A.8.17 | Clock synchronisation | Azure infrastructure uses NTP from Microsoft time servers. All timestamps in UTC. `DateTimeOffset.UtcNow` enforced in domain model. | ✅ | Platform default, domain model convention |
| A.8.18 | Use of privileged utility programs | No privileged utilities deployed in containers. Azure Bastion for emergency SSH access (no public SSH endpoints). | ✅ | Network security rules |
| A.8.19 | Installation of software on operational systems | Container images built from approved base images only. No runtime package installation (`apt`, `pip`) in containers. Image provenance via SBOM. | ✅ | Dockerfile base image policy, SBOM |
| A.8.20 | Networks security | Azure Virtual Network with NSGs. Private Endpoints for databases. No public internet access to storage or databases. | ✅ | VNet/NSG config, Private Endpoints |
| A.8.21 | Security of network services | All ingress via Azure Application Gateway + WAF (OWASP CRS 3.2). Dapr mTLS for service mesh. | ✅ | App Gateway WAF policy |
| A.8.22 | Segregation of networks | Separate VNet subnets per environment (dev/staging/prod). Container Apps environments isolated. | ✅ | VNet subnet allocation |
| A.8.23 | Web filtering | Outbound internet filtered via Azure Firewall with URL allow-list. DNS security via Azure DNS Private Resolver. | ✅ | Azure Firewall rules |
| A.8.24 | Use of cryptography | TLS 1.3 for transit. AES-256 at rest (Azure Storage Service Encryption). Key Vault for key management. PHI fields encrypted at column level where required. | ✅ | Key Vault policies, TLS config |
| A.8.25 | Secure development lifecycle | Threat modelling (STRIDE), SAST (CodeQL), DAST (OWASP ZAP), dependency scan in CI. Security gates block merge on High/Critical findings. | ✅ | GitHub Actions CI pipeline |
| A.8.26 | Application security requirements | Security NFRs documented per service in ADRs. OWASP ASVS Level 2 compliance target. | ✅ | ADR documents |
| A.8.27 | Secure system architecture and engineering principles | Zero-trust architecture. Defence-in-depth layers: WAF → API Gateway → Auth middleware → RBAC → service-level validation. | ✅ | Architecture documentation |
| A.8.28 | Secure coding | Secure coding standards enforced via Roslyn analysers (Security Code Scan, SonarQube). OWASP Top 10 training for all developers. | ✅ | `.editorconfig`, analyser config |
| A.8.29 | Security testing in development and acceptance | Integration tests with Testcontainers in CI. OWASP ZAP DAST on staging before prod deploy. | ✅ | Test project, CI pipeline |
| A.8.30 | Outsourced development | Contractor code subject to same SDLC controls. Code review mandatory. Access revoked post-engagement. | ✅ | Contractor onboarding policy |
| A.8.31 | Separation of development, test and production environments | Separate Azure subscriptions for dev/staging/prod. No PHI in dev/staging (synthetic data only). | ✅ | Azure subscription structure |
| A.8.32 | Change management | All changes via PR → review → CI → staging deploy → prod deploy. Emergency changes via break-glass process with post-review. | ✅ | GitHub branch protection, deployment pipeline |
| A.8.33 | Test information | Synthetic data (Synthea) used in all non-production environments. PHI anonymisation pipeline for test data generation. | ✅ | Synthea config, anonymisation scripts |
| A.8.34 | Protection of information systems during audit testing | Audit penetration tests performed on isolated staging clone, not production. Findings tracked in private security Jira project. | ✅ | Pen test engagement rules |

---

## Statement of Applicability (SoA) Summary

| Theme | Total Controls | Implemented (✅) | Partial (⚠️) | Excluded (❌) | N/A |
|-------|---------------|-----------------|-------------|--------------|-----|
| A.5 — Organisational | 37 | 33 | 4 | 0 | 0 |
| A.6 — People | 8 | 8 | 0 | 0 | 0 |
| A.7 — Physical | 14 | 13 | 0 | 0 | 1 |
| A.8 — Technological | 34 | 32 | 2 | 0 | 0 |
| **Total** | **93** | **86 (92%)** | **6 (6%)** | **0** | **1** |

---

## Partial Controls — Remediation Roadmap

| Control | Gap | Remediation | Target Quarter |
|---------|-----|-------------|---------------|
| A.5.6 | ISAC-H membership not formally renewed | Renew HIMSS and ISAC-H membership and document contacts | Q3 2025 |
| A.5.22 | Quarterly vendor reviews not fully documented for all critical suppliers | Implement vendor review calendar in Jira with auto-reminders | Q2 2025 |
| A.5.30 | Chaos engineering coverage incomplete (<50% services tested) | Expand Azure Chaos Studio experiments to all critical-path services | Q3 2025 |
| A.6.5 | Access revocation SLA (4h) — not always met for contractor off-boards | Automate revocation via Entra ID lifecycle workflows triggered by HR system | Q2 2025 |
| A.8.12 | API gateway PHI regex filtering only on subset of routes | Extend WAF custom rules to all patient-data API routes | Q2 2025 |
| A.8.16 | Sentinel rules cover <80% of MITRE ATT&CK techniques | Expand Sentinel analytic rules to achieve >90% MITRE coverage | Q3 2025 |

---

## Cross-Reference: HIPAA Security Rule Mapping

| HIPAA Safeguard | HIPAA Standard | ISO 27001:2022 Control(s) |
|----------------|---------------|--------------------------|
| Administrative | §164.308(a)(1) — Risk Analysis | A.5.7, A.5.8, A.5.24 |
| Administrative | §164.308(a)(3) — Workforce Training | A.6.3, A.6.4 |
| Administrative | §164.308(a)(5) — Security Awareness | A.6.3, A.5.37 |
| Administrative | §164.308(a)(6) — Incident Response | A.5.24, A.5.25, A.5.26, A.5.27 |
| Physical | §164.310(a) — Facility Access | A.7.1, A.7.2, A.7.3 |
| Physical | §164.310(d) — Device and Media Controls | A.7.10, A.7.14, A.8.10 |
| Technical | §164.312(a) — Access Control | A.5.15, A.5.16, A.8.3, A.8.5 |
| Technical | §164.312(b) — Audit Controls | A.8.15, A.8.16 |
| Technical | §164.312(c) — Integrity | A.8.13, A.8.14, A.8.17 |
| Technical | §164.312(d) — Authentication | A.8.5, A.5.17 |
| Technical | §164.312(e) — Transmission Security | A.5.14, A.8.20, A.8.21, A.8.24 |

---

## Review and Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| CISO | TBD | — | — |
| DPO | TBD | — | — |
| Engineering Lead | TBD | — | — |
| Compliance Manager | TBD | — | — |

_This document is reviewed annually and updated within 30 days of any significant change to the platform infrastructure or security architecture._
