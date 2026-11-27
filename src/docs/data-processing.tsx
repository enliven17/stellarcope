import { A, C, Code, H2, List, Note, P, Table } from './kit'

const REPO = 'https://github.com/enliven17/stellarcope'

export default function DataProcessing() {
  return <>
    <P>Last reviewed: 27 November 2026.</P>
    <Note kind="status">This page describes the planned production service in our SCF submission and architecture. It is a technical disclosure for review, not a statement that production is live or a signed data processing agreement. The early web pilot uses a different implementation and US-hosted infrastructure. Operator identity, a private privacy contact, provider contracts and operational retention settings must be confirmed before this becomes the production disclosure.</Note>

    <H2>Purpose and responsibilities</H2>
    <P>Stellarcope is being built to provide website, API and onchain usage statistics for projects building on Stellar. Project teams will use these statistics to understand their services. Authorized SCF operators will compare project usage across the ecosystem. Daily commitments will make published summaries tamper evident; they do not establish that every event represents a real person.</P>
    <P>For analytics collected on a project&apos;s instructions, the project normally acts as the data controller and Stellarcope as its processor. The project determines which pages and interactions to measure, informs visitors and establishes its legal basis. An Article 28 processing agreement must define the instructions, security measures, subprocessors, assistance with rights and incidents, and return or deletion of data.</P>
    <P>Using information independently for funding decisions or ecosystem research may involve separate or joint controller responsibilities. Those purposes, recipients and responsibilities must be agreed and disclosed before that processing starts. Website improvement alone does not describe every intended use of the platform. Administration, support and security processing also need their own purposes, legal bases and retention rules.</P>

    <H2>Website analytics</H2>
    <Table head={['Information', 'Planned handling']} rows={[
      ['Pageviews and custom events', 'Site identifier, event time, event type, normalized page path and approved event names and properties. Query strings and fragments are removed, except for selected campaign labels handled separately.'],
      ['Traffic sources', 'Referring domain and selected campaign labels, such as source, medium and campaign.'],
      ['Browser and device', 'Browser, operating system and device categories; language and screen or automation signals may be processed for reporting or filtering.'],
      ['Country', 'Country-level location. The production design truncates the IP address before country lookup; it does not require precise location.'],
      ['Visitor and visit identifiers', 'Site-scoped salted hashes derived from IP address and browser information, using a daily salt. These support approximate visitor and visit counts without a persistent cross-site identifier.'],
      ['IP address and User-Agent', 'Processed transiently at admission for identifiers and abuse filtering. The design excludes raw IP addresses and raw User-Agent strings from analytics records, queue messages and application access logs. Provider security logs need separate controls and disclosure.'],
    ]} />
    <P>The tracker will not use tracking cookies or browser local storage. Daily identifier rotation reduces linkability; it is not a guarantee of anonymity. Pseudonymous event records can remain personal data, and unusual page paths or custom properties can identify someone. Hashing is a safeguard, not a reason to disregard data-protection rights.</P>
    <P>Projects must avoid names, emails, visitor wallet addresses, user identifiers, secrets and sensitive information in paths, campaigns and event properties. Only public marketing or documentation pages belong in the pilot. Pattern-based sanitation is a second line of defense and cannot recognize every personal value. See <A to="/docs/script-tag">script configuration and route exclusions</A>.</P>

    <H2>API, wallet and onchain information</H2>
    <P>The planned API path accepts OpenTelemetry counters and histograms. It retains tenant and service identifiers, normalized routes, status information, counts and latency histograms. Traces, spans, logs, request bodies and exemplars are excluded. Route normalization replaces recognized account addresses, transaction hashes and identifiers; tenants must also prevent personal data in service names, route templates and attributes.</P>
    <P>Stellar Wallets Kit integration is intended to record connection and signing event types and wallet type, without visitor wallet addresses, signed transactions or amounts. These events still require a disclosed purpose and an appropriate legal basis.</P>
    <P>Projects will register the Stellar accounts and Soroban contracts they own. Stellarcope will read public activity from Horizon and Stellar RPC to calculate daily transaction, invocation and distinct-interacting-account counts. Project registrations and ownership proofs include public account or contract identifiers; visitor addresses are not intended as stored reporting dimensions. Public blockchain information can be personal data, and aggregate counts are not automatically anonymous.</P>

    <H2>Access and sharing</H2>
    <P>The production design includes private project dashboards, a global SCF operator console and revocable operator API keys. Authorized service operators and infrastructure providers will have access as needed to run and secure the service. The processing agreement and project notice must identify the relevant recipients and permitted uses.</P>
    <P>Public project cards and published summaries expose the information selected for publication. A public commitment is different from a public dashboard: anchoring a Merkle root does not require publishing underlying visitor records. Any public release or downstream sharing must be assessed and explained before it occurs.</P>
    <P>New pilot projects are private by default. Shared project access codes are stored as hashes and expire after 30 days. Dashboard sign-in uses a separate seven-day HttpOnly cookie, Secure on HTTPS and SameSite=Strict. This authentication cookie is on Stellarcope, not a tracking cookie installed on the project&apos;s website.</P>

    <H2>Processing locations and providers</H2>
    <Table head={['Environment', 'Location and status']} rows={[
      ['Production primary — planned', 'AWS eu-central-1, Frankfurt, Germany, across three availability zones. Application processing, analytics queues and PostgreSQL will run in the primary region.'],
      ['Production standby — planned', 'AWS eu-west-1, Ireland. Standby intake and its fallback queue will buffer events during a primary-region outage.'],
      ['Production backups — planned', 'A separate AWS backup account and an additional encrypted database copy with an EU-located provider outside AWS. The external provider has not been selected in the published architecture.'],
      ['Current pilot', 'Vercel functions configured for iad1 in the United States and managed PostgreSQL documented as US-hosted. The published repo does not establish the database provider, backup settings or every provider processing location.'],
    ]} />
    <P>The production target is EU processing and storage for analytics, including backups. An EU cloud region alone does not establish that every support, security, delivery or administrative operation remains in the EU. Before launch, the operator must publish the actual provider legal entities, services, processing and access locations, and subprocessor arrangements.</P>
    <P>Where personal data is transferred outside the EEA, the relevant transfer mechanism and safeguards must be documented and made available as required. These may involve an applicable adequacy decision or standard contractual clauses with the necessary assessment and supplementary measures. This page does not claim that any particular mechanism is already in place. A future EU migration does not resolve the current pilot&apos;s transfer obligations.</P>

    <H2>Retention</H2>
    <P>The following periods are production design targets, not evidence of retention jobs running today. A lower-bound aggregate retention target is not a settled maximum for personal data; the launch policy must define maximum periods or meaningful deletion criteria for every data category.</P>
    <Table head={['Production data', 'Planned period']} rows={[
      ['Raw web events', '90 days'],
      ['Raw API metric points', '7 days'],
      ['Deduplication receipts', '8 days'],
      ['Inactive cumulative-stream checkpoints', '30 days after the last point'],
      ['Minute API rollups', '30 days'],
      ['Hourly API aggregates and daily onchain counts', 'At least 24 months; maximum retention or deletion criteria must be set before launch'],
      ['Analytics queues / dead-letter queues', '7 days / up to 14 days; records beyond the replay horizon are not added back into totals'],
      ['Backups', 'Expiry within 35 days'],
      ['Daily seals', 'Publicly anchored commitments are intended to remain verifiable indefinitely; stored summaries are subject to the erasure boundaries below'],
    ]} />
    <P>During the pilot, the documented operator procedure is to delete web events and drop counters older than 90 days at least weekly. This is manual maintenance, not an automated 90-day cutoff, and records can remain until the next cleanup. Actual pilot backup expiry and provider-log retention have not been established in the published documentation. Retention for production account records, support correspondence, audit and security logs also needs to be set before launch.</P>

    <H2>Erasure and immutable commitments</H2>
    <P>Production is planned to support tenant-triggered erasure. A deletion marker will stop admission and queued replay before live data and caches are removed. Tenant identifiers will not be reused. Backups will expire within the configured period, and deletion markers must be reapplied before a restored database serves traffic.</P>
    <P>Pilot offboarding is assisted. Suspension stops collection and access but does not erase records. The operator can export reports and perform deletion using the <A to={`${REPO}/blob/main/engineering/pilot.md`}>pilot procedure</A>. Deletions must also be recorded for reapplication after a restore.</P>
    <P>Daily summaries contain project-level totals and are hashed into a Merkle tree. The public ledger receives the root, not raw visitor events. The prototype uses Stellar testnet; mainnet anchoring is planned. Once published, ledger commitments cannot be withdrawn by deleting the database. Locally stored summaries can be removed while retaining the hashes and ordering needed to preserve other projects&apos; proofs. Hashes and small-count summaries must still be assessed for identifiability; publishing a hash does not itself make information anonymous.</P>

    <H2>GDPR and consent</H2>
    <P>Where GDPR applies, the project must identify a legal basis for each purpose. Legitimate interests under Article 6(1)(f) requires a documented assessment of the interest, necessity and balance with individuals&apos; rights. It is not an automatic legal basis for analytics or for independent funding-related reuse.</P>
    <P>Cookie-free does not mean consent-free. National ePrivacy rules can apply to accessing browser information and similar tracking technologies. Projects must assess applicable consent requirements or document a valid audience-measurement exemption. Where consent is required, the tracker must wait until consent is obtained; withdrawal must stop future collection. Respecting Do Not Track or Global Privacy Control is useful but does not replace consent or a rights-request process.</P>
    <P>Stellarcope has not established a blanket consent exemption, CNIL certification or a jurisdiction-wide compliance guarantee. The architecture supports minimization and tenant separation, but compliance also requires operational evidence, contracts, transparency and a functioning rights process.</P>

    <H2>Privacy requests and contact</H2>
    <P>Visitors should contact the operator of the website they visited using the contact in that website&apos;s privacy policy. Depending on the circumstances, rights may include access, correction, erasure, restriction, portability, objection and withdrawal of consent. Individuals may complain to their competent data-protection authority. Controllers normally respond within one month, with any permitted extension explained within that period; Stellarcope must assist when acting as processor.</P>
    <P>Daily pseudonymous identifiers can make it difficult to locate an individual&apos;s records. That does not remove applicable rights or justify collecting additional identifying data by default. Requests must be assessed on their facts. Never ask for a wallet secret or publish visitor information, access codes or privacy requests in a public issue.</P>
    <Note>The public repository does not yet publish a confirmed legal operator identity and private privacy-request channel. These must be provided in the service legal notice before production onboarding. Existing pilot teams should use their agreed private onboarding channel; a public GitHub issue is not a private rights-request route.</Note>

    <H2>Information projects must add</H2>
    <P>Projects can link to this page for the service&apos;s technical processing details. Their own privacy notice must identify their controller and contact, describe the purposes and actual events they measure, explain the applicable legal basis and rights, and identify relevant recipients and transfers. The project cannot replace those details with a link to Stellarcope.</P>
    <P>The following is a starting point for the planned production service. Use it only when the described deployment and retention are operating, add any custom-event or SCF-sharing purposes, and complete the project&apos;s legal-basis and consent assessment first.</P>
    <Code file="Privacy policy — production starting point" code={`Website analytics\n\nWe use Stellarcope to understand how visitors use this website and to improve its content and usability.\n\nStellarcope's analytics tracker does not use tracking cookies or browser local storage. It estimates daily visitors using a pseudonymous identifier specific to this website and UTC day, rather than a persistent identifier shared across websites.\n\nStellarcope processes IP addresses and browser information to generate identifiers and filter automated traffic. Analytics records include page paths, referring domains, campaign labels, timestamps, country, browser and device categories, and daily visitor identifiers. Raw IP addresses and raw user-agent strings are not stored in analytics records. Infrastructure providers may process request information separately for delivery and security.\n\nWebsite analytics event records are retained for 90 days. Analytics processing and storage use EU infrastructure, with primary services in Germany, standby intake in Ireland and EU-based backups that expire within 35 days. Further information: https://stellarcope.xyz/docs/data-processing\n\n[Describe any custom events and any sharing with SCF or other recipients.]\n[State your assessed legal basis and, where relevant, your consent and withdrawal controls.]\n[Provide your controller identity, privacy contact and applicable rights information.]`} />

    <H2>Sources and updates</H2>
    <P>The <A to={`${REPO}/blob/main/engineering/technical-architecture.md`}>technical architecture</A>, <A to={`${REPO}/blob/main/engineering/decisions.md`}>technology decisions</A> and <A to={`${REPO}/blob/main/engineering/pilot.md`}>pilot guide</A> describe the target and current implementation. This disclosure must be updated before material changes to purposes, recipients, locations or retention take effect.</P>
    <List items={[
      <A to="https://www.edpb.europa.eu/system/files/2026-11/edpb_guidelines_202401_legitimateinterest_v2_en.pdf">EDPB guidelines on legitimate interests</A>,
      <A to="https://www.edpb.europa.eu/system/files/documents/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf">EDPB guidance on ePrivacy scope</A>,
      <A to="https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience">CNIL conditions for audience-measurement exemptions</A>,
      <A to="https://www.edpb.europa.eu/topics/ai-and-technology/anonymisation-pseudonymisation_en">EDPB explanation of anonymisation and pseudonymisation</A>,
      <A to="https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en">EDPB guidance on transparency and individuals&apos; rights</A>,
      <A to="https://www.edpb.europa.eu/topics/international-transfers-and-international-cooperation/standard-contractual-clauses_en">EDPB information on standard contractual clauses</A>,
    ]} />
    <P><C>Scope:</C> technical processing information for the planned production service, with explicit pilot differences. This page does not replace the operator&apos;s legal notice, project-specific privacy notices or a processing agreement.</P>
  </>
}
