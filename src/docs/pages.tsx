import type { ReactNode } from 'react'
import { TRACKER } from '../../packages/tracker/release'
import { A, C, Code, H2, List, Note, P, Table } from './kit'
import DataProcessing from './data-processing'

export type DocPage = { slug: string; group: string; title: string; lead: string; body: ReactNode }

const HOST = 'https://stellarcope.xyz'
const SRI = TRACKER.integrity

export const PAGES: DocPage[] = [
  {
    slug: 'overview', group: 'Getting started', title: 'Overview',
    lead: 'Stellarcope gives every Stellar project trusted web and API analytics. Free, cookieless, and sealed on Stellar every day.',
    body: <>
      <H2>Why Stellarcope exists</H2>
      <P>Stellar Community Fund reviewers rely on self reported usage. A screenshot of a dashboard proves very little. Stellarcope is a shared analytics service run for the ecosystem, so every project is measured the same way and every number can be checked.</P>
      <H2>Two layers, one platform</H2>
      <List items={[
        <><b className="text-gold">Web analytics</b>: page views, visitors, referrers, countries, devices, custom events and a Stellar Wallets Kit funnel, from a small, version pinned script.</>,
        <><b className="text-blue">API analytics</b>: request volume, status codes and latency percentiles per normalized route, from OpenTelemetry or from a direct integration.</>,
      ]} />
      <H2>What makes the numbers trustworthy</H2>
      <List items={[
        'Events are accepted only from domains the project has proven it owns.',
        'Bots, datacenter traffic, headless browsers and bursts are filtered and counted in the open.',
        'Every night each project summary becomes a leaf in a Merkle tree, and the root is written to Stellar.',
        'Anyone can recompute a proof in the browser and compare it with the ledger.',
      ]} />
      <H2>Try it now</H2>
      <P>This site measures itself with Stellarcope. Open the <A to="/demo">tenant dashboard</A> to see its live traffic, or the <A to="/p/stellarcope">public card</A> to verify yesterday&apos;s seal against Stellar testnet.</P>
    </>,
  },
  {
    slug: 'quickstart', group: 'Getting started', title: 'Quickstart',
    lead: 'From enrollment to the first event in a few minutes.',
    body: <>
      <Note kind="status">The early web pilot uses assisted onboarding. Wallet sign-in and self-service enrollment are planned. To request access, open an issue on the <A to="https://github.com/enliven17/stellarcope/issues">repository</A> with your project name and domain. We provide your verification tag, completed snippet and private dashboard access code.</Note>
      <H2>1. Get a site id</H2>
      <P>Each enrolled project gets a tenant id and one or more site ids. The site id is public and goes into the script tag.</P>
      <H2>2. Verify your domain</H2>
      <P>Add the meta tag you receive to the head of your site, or one of the other methods in <A to="/docs/domain-verification">domain verification</A>. Events from unverified origins are refused.</P>
      <Code file="index.html" code={'<meta name="stellarcope-verify" content="YOUR_TOKEN" />'} />
      <H2>3. Add the script</H2>
      <P>Before collection starts, read the <A to="/docs/data-processing">data processing information</A>, publish your project&apos;s privacy notice and establish the applicable legal basis. If consent is required, wait for consent before loading the tracker. The current pilot differs from the planned production service.</P>
      <Code file="index.html" code={`<script async\n  src="${HOST}${TRACKER.path}"\n  integrity="${SRI}"\n  crossorigin="anonymous" referrerpolicy="no-referrer"\n  data-site="YOUR_SITE_ID"></script>`} />
      <H2>4. Watch it arrive</H2>
      <P>Open <A to="/pilot">your private dashboard</A> and enter the project access code shared with your team. Visit your verified website; the live panel refreshes every five seconds. A 202 from the deployed collector means the write committed. A 400/403 indicates a payload or domain check failed; 503 means collection could not be stored. Contact us if events do not arrive.</P>
    </>,
  },
  {
    slug: 'script-tag', group: 'Web analytics', title: 'Script tag',
    lead: 'One pinned, integrity checked script. No cookies, no local storage.',
    body: <>
      <H2>Install</H2>
      <Code file="index.html" code={`<script async src="${HOST}${TRACKER.path}"\n  integrity="${SRI}" crossorigin="anonymous" referrerpolicy="no-referrer"\n  data-site="YOUR_SITE_ID"></script>`} />
      <H2>Pinned versions</H2>
      <P>Tracker builds live at <C>/t/&lt;version&gt;/a.js</C> and never change once published. The build script refuses to overwrite a published version, the integrity hash is committed next to each build, and files are served with an immutable cache header. Upgrading means changing the version in your tag on purpose.</P>
      <H2>Options</H2>
      <Table head={['Attribute', 'Meaning']} rows={[
        ['data-site', 'Required. Your public site id.'],
        ['data-endpoint', 'Optional. Collector URL, defaults to /e on the script host. Point it at a first party proxy to avoid blockers.'],
        ['data-dnt', 'Do Not Track and Global Privacy Control are respected by default. Set "false" only after reviewing your tracking policy.'],
        ['data-exclude-paths', 'Optional comma-separated literal path prefixes, such as /account,/checkout. These routes and their children send neither pageviews nor custom events. Invalid prefixes disable collection.'],
      ]} />
      <H2>Protect the host application</H2>
      <P>Use the async snippet with its integrity hash and referrerpolicy. Version 1.0.2 sanitizes paths, campaign values and supported custom properties before sending, and omits the HTTP referrer header. Exclusions apply before normalization. Install one version per page; duplicate 1.0.2 snippets share one initialization, but older versions cannot participate in that guard.</P>
      <P>Instrument public pages only. Pattern matching cannot identify every kind of personal data. Exclude private routes explicitly and never send names, secrets or account information as custom properties. Custom event calls should use optional chaining because an async script may not have loaded yet.</P>
      <H2>First party proxy</H2>
      <P>Content blockers may drop third party analytics. Proxying through your own domain can improve delivery, but needs correct forwarding of visitor information and its own privacy review.</P>
      <Code file="next.config.js" code={`module.exports = {\n  async rewrites() {\n    return [\n      { source: '/a/t/:path*', destination: '${HOST}/t/:path*' },\n      { source: '/a/e', destination: '${HOST}/e' },\n    ]\n  },\n}`} />
    </>,
  },
  {
    slug: 'spa-and-npm', group: 'Web analytics', title: 'SPA and npm',
    lead: 'Single page apps are tracked automatically. Use the package when you bundle.',
    body: <>
      <H2>Automatic route changes</H2>
      <P>The tracker wraps <C>history.pushState</C>, <C>replaceState</C> and listens to <C>popstate</C>, so client side navigations in React, Vue, Svelte or Next count as page views without extra code. A page view is sent once per path change.</P>
      <H2>npm package</H2>
      <Code file="src/main.ts" code={`import { init, track } from '@stellarcope/tracker'\n\ninit({ site: 'YOUR_SITE_ID', endpoint: '${HOST}/e' })`} />
      <Note>The package source lives in <C>packages/tracker</C>. Publishing to npm is part of the next milestone; until then import it from the repository.</Note>
    </>,
  },
  {
    slug: 'custom-events', group: 'Web analytics', title: 'Custom events',
    lead: 'Name what matters and attach a few flat properties.',
    body: <>
      <Code file="anywhere.js" code={`window.stellarcope?.track('quote_requested', { pair: 'XLM/USDC', amount_band: '100-1000' })`} />
      <H2>Rules</H2>
      <List items={[
        'Event names up to 64 characters.',
        'Up to 20 properties, flat values only: strings, numbers or booleans.',
        'Emails, Stellar addresses and phone numbers in property values are masked to [masked] at the collector.',
      ]} />
    </>,
  },
  {
    slug: 'wallets-kit', group: 'Web analytics', title: 'Stellar Wallets Kit',
    lead: 'The signing funnel for every wallet, without a single address.',
    body: <>
      <Code file="src/wallet.ts" code={`import { withStellarcope } from '@stellarcope/swk'\nimport { track } from '@stellarcope/tracker'\n\nconst kit = withStellarcope(new StellarWalletsKit(config), track)`} />
      <H2>Events</H2>
      <Table head={['Event', 'Properties']} rows={[
        ['wallet_modal_open', 'none'],
        ['wallet_connected', 'wallet_id, network'],
        ['wallet_connect_failed', 'wallet_id, reason'],
        ['tx_sign_requested', 'wallet_id, network'],
        ['tx_signed', 'wallet_id, network'],
        ['tx_sign_rejected', 'wallet_id, network, reason'],
      ]} />
      <Note kind="privacy">The wrapper never reads or sends an address, a transaction or an amount. Its test suite asserts this.</Note>
    </>,
  },
  {
    slug: 'opentelemetry', group: 'API analytics', title: 'OpenTelemetry',
    lead: 'Keep your APM. Send a second copy of your metrics to Stellarcope.',
    body: <>
      <Note kind="status">The public OTLP endpoint is in progress. The storage model, histogram math and route normalization it will use are live today and already measure Stellarcope&apos;s own API.</Note>
      <H2>Dual export</H2>
      <Code file="otel-collector.yaml" code={`exporters:\n  otlphttp/apm:\n    endpoint: https://otlp.your-apm.example\n  otlphttp/stellarcope:\n    endpoint: ${HOST}/otlp\n    headers: { authorization: "Bearer \${STELLARCOPE_KEY}" }\n\nservice:\n  pipelines:\n    metrics:\n      exporters: [otlphttp/apm, otlphttp/stellarcope]`} />
      <H2>What is kept</H2>
      <P>Only counters and histograms, per minute: tenant, service, normalized route, status class, count, sum and explicit bucket counts. Traces, spans and logs are dropped at the door.</P>
    </>,
  },
  {
    slug: 'route-normalization', group: 'API analytics', title: 'Route normalization',
    lead: 'Fixed rules that keep routes readable and free of account data.',
    body: <>
      <Table head={['Pattern', 'Becomes']} rows={[
        ['S… secret seed', ':REDACTED, never stored, team warned'],
        ['M… muxed account', ':muxed'],
        ['G… account', ':account'],
        ['C… contract', ':contract'],
        ['CODE:G… asset', ':asset'],
        ['64 hex characters', ':hash'],
        ['UUID', ':uuid'],
        ['digits', ':id'],
        ['long tokens with digits', ':token'],
        ['trailing slash', 'removed'],
      ]} />
      <P>Rules run in order and the first match wins. After normalization a tenant keeps at most 500 distinct routes; anything beyond folds into <C>:other</C>. The rule set and its test corpus live in <C>packages/core/normalize.ts</C>.</P>
    </>,
  },
  {
    slug: 'domain-verification', group: 'Trust', title: 'Domain verification',
    lead: 'Prove the domain before a single event is accepted.',
    body: <>
      <Table head={['Method', 'How']} rows={[
        ['meta', <>A <C>&lt;meta name="stellarcope-verify" content="TOKEN"&gt;</C> tag on the home page.</>],
        ['dns', <>A TXT record <C>_stellarcope.example.com</C> with <C>stellarcope-verify=TOKEN</C>.</>],
        ['sep1', <>Your signing account listed under <C>ACCOUNTS</C> in <C>/.well-known/stellar.toml</C>.</>],
      ]} />
      <H2>Origin binding</H2>
      <P>Each event carries its hostname and the browser sends an Origin header. Both must equal a verified domain or one of its subdomains. A copied snippet on another site produces only dropped, counted events.</P>
      <P>This site is verified with the meta method. Its trust tab shows the result.</P>
    </>,
  },
  {
    slug: 'filtering', group: 'Trust', title: 'Filtering',
    lead: 'What is thrown away, and why it is still counted.',
    body: <>
      <Table head={['Reason', 'Trigger']} rows={[
        ['origin', 'Hostname or Origin is not a verified domain.'],
        ['bot', 'Known crawler, HTTP client or missing user agent.'],
        ['headless', 'navigator.webdriver is set or the screen size is impossible.'],
        ['datacenter', 'The request comes from a cloud or hosting network.'],
        ['rate', 'Too many events from one client to one site in a minute.'],
        ['referrer_spam', 'A known referrer spam domain.'],
      ]} />
      <P>Dropped events are stored as daily counts per reason and shown on the trust tab. They never appear as visitors.</P>
    </>,
  },
  {
    slug: 'trust-score', group: 'Trust', title: 'Trust score',
    lead: 'One number from verification, filtering and sealing. The formula is public.',
    body: <>
      <Code file="trust-v2" code={`score = 40\n      + 12  stellar.toml (SEP-1) verified\n      + 10  DNS or meta verified\n      + 15  origin binding active\n      + 13  included in a recent seal\n      + 10  baseline\n      - 30 x filtered share\nclamped to 0..100`} />
      <P>Filtered traffic weighs lightly on purpose: crawlers hitting a site are not the project&apos;s fault. The formula is versioned. A change ships as a new version and the dashboard shows which version produced a score.</P>
    </>,
  },
  {
    slug: 'seals-and-proofs', group: 'Trust', title: 'Seals and proofs',
    lead: 'A daily Merkle root on Stellar, and a proof anyone can check.',
    body: <>
      <H2>The daily seal</H2>
      <List items={[
        'At 00:30 UTC each active tenant gets a canonical JSON summary of the previous day.',
        'Each summary is hashed with SHA-256. Leaves are sorted by tenant id and folded into a Merkle tree.',
        <>The root is written to Stellar with <C>manage_data</C> under the key <C>stellarcope:YYYY-MM-DD</C> from the anchor account.</>,
      ]} />
      <H2>Verify a proof</H2>
      <Code file="terminal" code={`curl ${HOST}/api/proof?tenant=stellarcope\n# then: sha256(summary) == leaf, walk path to root,\n# and compare with the ledger entry:\ncurl https://horizon-testnet.stellar.org/accounts/GDHDZ57XLMH3JGZJETKLT3JDMBEPU2HYB3YH7FRLJGXREZVVV4TEBKIS/data/stellarcope:2026-11-13`} />
      <P>The <A to="/p/stellarcope">public card</A> runs exactly these steps in your browser.</P>
      <Note kind="status">Seals are written to Stellar testnet during the build phase and move to mainnet at launch.</Note>
    </>,
  },
  {
    slug: 'data-collected', group: 'Privacy', title: 'Data collected',
    lead: 'A small collection profile for public websites.',
    body: <>
      <P>This page describes the current web pilot. See <A to="/docs/data-processing">data processing information</A> for the planned production service, GDPR considerations, locations, retention and rights.</P>
      <Table head={['Information', 'Pilot handling']} rows={[
        ['Normalized page path and timestamp', 'Stored for pageviews and events; query strings and fragments removed.'],
        ['Referring domain and selected campaign labels', 'Stored after validation; do not put personal data in campaigns.'],
        ['Country', 'Supplied by the hosting edge; the provider processes the request IP.'],
        ['Browser, OS and device family', 'Derived from the User-Agent and stored as categories.'],
        ['Daily visitor hash', 'Stored; derived from site, IP and User-Agent using a daily salt.'],
        ['Custom event names and properties', 'Stored after bounded, pattern-based sanitation; arbitrary personal values may still pass.'],
        ['IP and raw User-Agent', 'Processed at collection but not stored as fields in analytics event records. Provider request and security logs are separate.'],
        ['Screen dimensions, language and automation signals', 'Sent by the tracker; screen and automation signals support filtering. These are not fields in the pilot event table.'],
      ]} />
      <P>Use the pilot on public marketing and documentation pages. Do not instrument account pages or send personal data in paths, event names or campaign labels. Sanitation reduces accidental exposure; it is not a guarantee of anonymity or a jurisdiction-wide consent exemption. Private dashboard access uses a separate HttpOnly cookie.</P>
      <H2>The visitor hash</H2>
      <P>A visitor id is <C>sha256(daily salt, site, IP, user agent)</C>. The random salt is shared through the database and changes each UTC day. Old database salts are deleted when a collector first obtains a later day&apos;s salt, not by an exact-midnight deletion job. Provider backups may retain older values until expiry. Site scoping and rotation reduce linkability; they do not guarantee anonymity.</P>
    </>,
  },
  {
    slug: 'residency-and-erasure', group: 'Privacy', title: 'Residency and erasure',
    lead: 'Where the data lives and how it is removed.',
    body: <>
      <Note kind="status">During the build phase data is stored in a managed Postgres in the United States. Production hosting moves to the EU before launch, as stated in the RFP response.</Note>
      <H2>Erasure</H2>
      <P>Pilot offboarding is assisted: contact us to stop collection, revoke access, export reports or request deletion. Retention and deletion are operator procedures during the pilot; automated tenant-triggered erasure is planned. Previously anchored aggregate commitments cannot be removed from Stellar. See the repository pilot guide for the backup and deletion boundaries.</P>
      <P>The <A to="/docs/data-processing">data processing information</A> explains the EU production target, manual pilot retention, backup limitations and applicable rights. The planned production backup expiry of 35 days is not a verified pilot setting.</P>
    </>,
  },
  {
    slug: 'data-processing', group: 'Privacy', title: 'Data processing information',
    lead: 'Planned production processing, EU residency, retention and GDPR responsibilities, with current pilot differences.',
    body: <DataProcessing />,
  },
  {
    slug: 'rest-api', group: 'Reference', title: 'REST API',
    lead: 'Read only JSON endpoints behind the dashboards.',
    body: <>
      <Table head={['Endpoint', 'Returns']} rows={[
        ['GET /api/stats?tenant=&days=', 'Web, API, wallet and trust figures for 7, 30 or 90 days.'],
        ['GET /api/live?tenant=', 'Active visitors in the last 5 minutes and the 30 latest events, without visitor ids.'],
        ['GET /api/projects?days=', 'Every public tenant with totals, trend and trust, for the operator view.'],
        ['GET /api/seals?tenant=', 'The last 14 seals with roots and transaction hashes.'],
        ['GET /api/proof?tenant=&day=', 'Summary, leaf, Merkle path, root and the ledger key for one day.'],
        ['POST /e', 'Web ingestion. 202 after storage; 400/403 for rejected input; 429 for rate limiting; 503 when storage fails.'],
      ]} />
      <Code file="terminal" code={`curl "${HOST}/api/stats?tenant=stellarcope&days=7"`} />
    </>,
  },
  {
    slug: 'self-hosting', group: 'Operations', title: 'Self hosting',
    lead: 'Everything runs from one MIT licensed repository.',
    body: <>
      <Table head={['Part', 'Path']} rows={[
        ['Shared logic', 'packages/core: normalization, filters, sessions, Merkle, histograms'],
        ['Tracker', 'packages/tracker'],
        ['Wallets Kit wrapper', 'packages/swk'],
        ['Standalone collector with a best-effort spool', 'services/collector'],
        ['Spool to Postgres writer', 'services/writer'],
        ['Read API and seals', 'services/api, api/'],
        ['Schema', 'db/schema.sql'],
      ]} />
      <H2>Environment</H2>
      <Table head={['Variable', 'Purpose']} rows={[
        ['DATABASE_URL', 'Postgres connection string.'],
        ['ANCHOR_SECRET', 'Secret key of the account that writes seals.'],
        ['ANCHOR_PUBLIC', 'Its public key, shown in proofs.'],
        ['HORIZON_URL', 'Defaults to Stellar testnet Horizon.'],
        ['CRON_SECRET', 'Bearer token for the daily seal job.'],
      ]} />
      <Code file="terminal" code={'npm install\nnpm test\nnode --env-file=.env.local services/collector/main.ts\nnode --env-file=.env.local services/writer/main.ts'} />
    </>,
  },
]
