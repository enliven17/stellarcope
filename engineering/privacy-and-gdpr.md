# Production privacy and GDPR review

Reviewed 27 November 2026 against the technical architecture, technology decisions, diagrams, SCF commitments and pilot source. This is an implementation and disclosure assessment, not legal certification. The production plans are the basis for the proposed service; the pilot is not expected to have completed those plans.

## Assessment

The direction supports data protection by design: minimized analytics, site-scoped daily identifiers, no tracker cookies, country-only geography, restricted metrics, tenant separation, bounded retention, EU analytics infrastructure and erasure that survives queued replay and restores. These measures support GDPR obligations; they do not establish compliance on their own.

Where GDPR applies, IP processing and potentially identifiable pseudonymous records must be assessed as personal-data processing. Public Stellar identifiers and low-volume aggregate statistics can also relate to people. EU establishment is not the only territorial trigger: monitoring people in the EU or offering them relevant services may bring a non-EU operator within scope. Do not make eligibility depend only on where the servers are located.

The diagrams' phrases “personal data exists only in memory,” “unlinkable across days” and “no stored data identifies a visitor” must not become unconditional policy promises. Daily hashes reduce linkability; sparse events, auxiliary information, salt copies and backups can change identifiability. Rights are not limited to enrolled project owners merely because visitors have no login.

## What the architecture establishes and what launch must establish

| Area | Documented target | Required operational or legal evidence |
|---|---|---|
| Purpose and roles | Tenant analytics plus SCF comparisons and published proofs | Distinguish processor instructions from independent or joint-controller purposes; document recipients, legal bases and any joint-controller responsibilities. Do not describe all collection solely as website improvement. |
| Transparency | Public technical docs | Legal operator identity/address and monitored private contact; project controller notices; actual processing purposes, recipients, locations, transfers, retention, rights and any automated-decision disclosures. The technical page is not an Article 28 agreement or a complete operator privacy notice. |
| Processor arrangements | Own admission, Umami, PostgreSQL and managed queues | Article 28 terms, subprocessor authorization/change process, confidentiality, security, rights assistance, incident assistance, audit information and return/deletion commitments. Open-source components are not themselves external processors unless another entity operates or accesses them. |
| Legal basis | Privacy-focused usage measurement | A basis for each purpose. An Article 6(1)(f) assessment must establish interest, necessity and balancing before processing. Security, service administration and ecosystem/funding reuse need separate assessment. |
| ePrivacy | No tracker cookies or local storage | Assess terminal-information access and national audience-measurement exemptions. Where consent is needed, prevent collection before consent and stop it after withdrawal. DNT/GPC is not a substitute. Do not advertise CNIL certification. |
| Residency and transfers | AWS Frankfurt; Ireland standby; additional EU backup copy | Actual vendor entities, subprocessors, backup location, delivery/security/support processing and remote administrative access. Document an applicable Chapter V mechanism and assessments for restricted transfers. US hosting is not automatically forbidden, but neither a future migration nor an unsigned SCC reference is a safeguard. |
| Retention | Web 90 days; metric points 7; receipts 8; minute rollups 30; hourly and onchain aggregates at least 24 months; backups within 35 days | Enforced jobs and deletion evidence. Resolve the aggregate maximum/criteria and set periods for identities, salts, audit, support and security logs. Align primary, standby, queue and backup settings. |
| Rights and erasure | Tenant dashboard erasure; tombstones before replay and after restore | Visitor and account-holder rights workflow, proportionate identity verification, timely responses, operator assistance and qualified explanations when a record cannot be located. No default collection of extra identifiers merely to make records identifiable. |
| Seals and disclosure | Daily project summary hashes anchored on Stellar | Assess small-cohort disclosure and dictionary/inference risks before publication. Keep visitor events offchain. Explain that public ledger commitments cannot be withdrawn; remove local summary text while preserving other tenants' proofs. |
| Security and accountability | RLS, signed credentials, separated roles, alerts and resilience | Verify these controls in production; maintain processing records, security measures and incident procedures. Assess DPIA, DPO and EU representative requirements against the actual operator, scale and risks rather than asserting they always or never apply. |

## Pilot facts that must not be mistaken for production

- The configured Vercel function region is `iad1`. The pilot guide describes US managed PostgreSQL; the repository does not confirm its vendor or all infrastructure processing locations.
- The deployed pilot writer is a synchronous database sink, not the target Umami/managed-queue system. New pilot projects are private by default, whereas the target includes SCF operator comparison and machine access.
- `packages/tracker/tracker.ts` writes no cookies or local storage, respects DNT/GPC by default, and supports configured public-page exclusions. It receives screen, language and automation signals as well as the page and campaign information.
- `services/collector/server.ts` derives country from provider headers, parses raw User-Agent into categories and stores a salted site/day visitor identifier. The writer does not persist raw IP/UA as event fields. This does not establish provider-log policy.
- `services/shared/salt.ts` deletes older database salts when a later day's salt is first requested, not at an exact midnight deadline. Backup copies have their own expiry.
- Retention is a documented manual weekly procedure for web records older than 90 days. There is no automated cutoff. Backup and provider-log expiry must not be inferred from the target diagram's 35-day setting.
- Dashboard authentication uses a separate seven-day HttpOnly/SameSite=Strict cookie, Secure over HTTPS; project credentials expire after 30 days. This is distinct from visitor tracking on tenants' sites.
- Pilot suspension is not deletion. Assisted erasure must account for local summaries, retained proof hashes, existing ledger roots and removals that need reapplying after restore.

These differences are expected in a prototype. Disclose them for pilot users rather than requiring the pilot to deliver the production tranches now.

## Publication and onboarding

The public page is implemented at `/docs/data-processing`, with links from onboarding, privacy docs and the footer. It describes production in future tense, shows the retention targets and explains the limited pilot differences. It deliberately states which operator-specific disclosures are not established rather than inventing entities, contact addresses, contracts or log settings.

Before using the page as the production processing disclosure, finalize the legal notice and private contact, processing agreement and subprocessor/transfer register, account/log/support retention and aggregate maximums. Confirm the EU deployment, deletion and restore settings. Then update the page's status and review date to reflect the operating service. A publisher may link to service facts, but still supplies its own identity, purposes, actual event configuration, legal basis, consent controls and privacy contact.

## Primary guidance

- [EDPB: legitimate interests, final version 2.0, adopted 10 November 2026](https://www.edpb.europa.eu/system/files/2026-11/edpb_guidelines_202401_legitimateinterest_v2_en.pdf) — assess the interest, necessity and balancing before processing.
- [EDPB: technical scope of ePrivacy Article 5(3), final version 2.0](https://www.edpb.europa.eu/system/files/documents/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf) — scope extends beyond cookies.
- [CNIL: audience-measurement exemptions](https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience) — restricted purposes, independent publisher measurement, transparency and documented configuration; not a product certification.
- [EDPB: anonymisation and pseudonymisation](https://www.edpb.europa.eu/topics/ai-and-technology/anonymisation-pseudonymisation_en) — distinguish reduced identifiability from anonymisation.
- [EDPB: individuals' rights](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en) — transparency, private request routes, controller response and processor assistance.
- [EDPB: standard contractual clauses](https://www.edpb.europa.eu/topics/international-transfers-and-international-cooperation/standard-contractual-clauses_en) — transfer safeguards must be put in place, not merely mentioned.
- [European Commission: application of GDPR](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr_en) — territorial scope and controller/processor obligations.

The source links explain the legal requirements. The application to Stellarcope above is an assessment of the repository, not approval by a regulator.
