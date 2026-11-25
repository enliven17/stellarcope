# Early web pilot

This is the existing Stellarcope prototype prepared for three to five manually onboarded projects, initially one public marketing or documentation website per project. It reuses the legacy analytics schema and dashboard. It does not deliver the production Umami/queue architecture or a grant milestone.

## What the project installs

The operator supplies a domain-verification meta tag and a completed script tag. Add them to the shared document head (every page for static sites). The script has an immutable versioned URL and SHA-384 integrity hash. Ordinary History API SPA navigation is automatic; hash-router navigation is not supported. No npm package or backend integration is required. A restrictive CSP must permit the script host in `script-src` and collection host in `connect-src`.

Version 1.0.2 uses `async` so a slow tracker download does not hold up `DOMContentLoaded`. Install the completed snippet with its integrity hash, `crossorigin="anonymous"` and `referrerpolicy="no-referrer"`. It respects Do Not Track and Global Privacy Control by default and uses credential-free, best-effort `fetch` with keepalive and no HTTP referrer header. There is no automatic retry or exactly-once claim. Only a committed server-side write receives 202; the browser can still close or the network can still fail before delivery.

The tracker applies the collector's path, campaign, event-name and custom-property sanitation before serialization. It keeps at most 20 flat custom properties, masks strings over 200 characters and recognized personal values (including common percent-encoded copies), and sends no payload larger than 8 KiB. This is pattern-based minimization, not a guarantee that arbitrary personal data is recognized. The collector independently validates the request again. Requests still expose normal network metadata to the hosting provider.

For a site containing private pages, add `data-exclude-paths="/account,/checkout,/reset-password"` to the script tag, replacing these examples with the site's actual sensitive routes. These are literal path prefixes, not regular expressions or globs: `/account` excludes itself and `/account/settings`, but not `/accounting`. The tracker decodes paths before checking exclusions, and skips both pageviews and custom events. An invalid exclusion disables that tracker instance without throwing into the host. Exclusions default to an empty list; they must be configured for each site's routes.

Install the tracker once in the shared document head. Duplicate 1.0.2 scripts use one page-wide owner and keep the first instance's configuration and custom-event API. Do not mix legacy 1.0.0/1.0.1 snippets with 1.0.2: replace the old tag entirely. Those historical artifacts stay unchanged; updating this repository does not upgrade a tenant's existing tag. Custom calls should use `window.stellarcope?.track(...)` so a slow or blocked async script does not break the host's event handlers. Browser-native navigation errors retain their original behavior; failures in analytics scheduling are contained.

## Local development

Use Node 26.13.1 or 24.22.3 and `npm ci`. Create a disposable local PostgreSQL database; never point local tests at production. Copy `.env.example` to `.env.local` and supply the local database URL. The CLI and local backend explicitly load `.env.local`; Vite proxies API and collection traffic to `127.0.0.1:8787` by default. It no longer silently proxies to production.

```sh
npm run pilot -- init
npm run start:pilot    # terminal 1, loopback backend on :8787
npm run dev            # terminal 2, frontend on localhost:5173
```

`PILOT_ORIGIN` must match the browser origin exactly, without a trailing slash. For a deployed installation use `https://stellarcope.xyz` (or your actual HTTPS origin); for the default development setup use `http://localhost:5173`. Set `VITE_API_PROXY` only when intentionally using a different backend. The small local backend exposes the pilot APIs, proofs and collector; it does not emulate Vercel cron or the legacy operator project list.

## Operator onboarding

Use a trusted workstation and a database credential restricted to the intended environment. These commands write to that database. `init` creates missing legacy tables; it is not a versioned production migration system.

```sh
npm run pilot -- enroll --id example-project --name 'Example project' --domain example.org
```

Enrollment creates an active **private** tenant, one site, an unverified domain and a read credential. The command prints the verification tag, site snippet, `/pilot` dashboard URL and access code once. Send the code privately to the project's team, separately from public installation instructions. Never paste it into a website, URL, issue, screenshot, log or committed file. Store only its hash in `api_keys`.

The team can sign in before collection starts. The dashboard explains that domain verification is pending. After the team installs the verification tag:

```sh
npm run pilot -- verify --id example-project
```

Positive verification enables collection. A failed recheck clears verification and disables collection. Alternative methods use the existing verifier helpers:

```sh
npm run pilot -- verify --id example-project --method dns
npm run pilot -- verify --id example-project --method sep1 --account PUBLIC_STELLAR_ACCOUNT
```

For DNS publish `_stellarcope.example.org` TXT `stellarcope-verify=TOKEN`. For SEP-1 the specified public account must appear in the domain's stellar.toml; the operator confirms which account belongs to the team. Never request a wallet secret. Domain checks are operator commands, not a public URL-fetching API. Recheck ownership when onboarding, after domain changes, and during routine pilot support.

Open the project's site in an ordinary browser, navigate between two pages, then open `/pilot` with the team's code. Verify the live panel and stored pageviews. Pageviews refresh every 30 seconds; live events refresh every five seconds. A request status alone is not the installation check: confirm the expected records in the dashboard.

## Access and reports

Project codes expire after 30 days. Sign-in places the code in a seven-day HttpOnly, SameSite=Strict cookie, Secure on HTTPS. No code is stored in a URL or browser local/session storage. Every private stats/live/seals/proof read checks the hash, scope, age, active project and revocation. CLI rotation or revocation invalidates existing cookies immediately. Publicly opted-in legacy projects retain public access; new pilot projects are never listed publicly.

```sh
npm run pilot -- rotate --id example-project  # new code, old code immediately revoked
npm run pilot -- revoke --id example-project # dashboard access only
```

The pilot UI shows pageviews, daily visitor counts, pages, referrers, countries, devices and browsers. Daily visitors are summed across the selected range: returning people can count on multiple days, and shared networks can group people. Device/referrer/page breakdowns count pageviews. Sessions/bounce rate, API, wallet and trust-score views remain in the public prototype demo and are hidden from the pilot. Reports are approximate website analytics, not proof of human users or a funding score.

Stale reports show a refresh error. Changing tenant/range clears unrelated cached results; an authorization failure clears protected data. Collection status shows domain verification and the last stored pageview, not an unsupported “tracker online” claim.

## Privacy and offboarding

Instrument public pages only. Do not send account-page paths, visitor wallet addresses, emails, names, secrets or user identifiers. Collection removes query/fragment strings, normalizes identifier-shaped path segments, restricts campaign labels, masks personal-looking property values and discards raw IP/UA before the database write. This is a limited sanitation profile, not an anonymity or consent exemption. The hosting provider's request/security logs require separate operator review. The prototype's current US deployment is not the planned EU production service.

Before enrolling a project, agree on the pilot duration, operator contact, hosting location, retention and backup policy. Do not promise the grant's production SLA. During the pilot, the operator performs retention: at least weekly, delete this cohort's raw web events and drop counters older than 90 days. Use a scoped query in a transaction and record the completed maintenance; there is no automatic retention job in this branch. Pause new enrollment if this maintenance or support cannot be provided.

For departure:

```sh
npm run pilot -- suspend --id example-project
npm run --silent pilot -- export --id example-project > /private/path/example-report.json
```

Suspension disables new collection and dashboard access, without deleting the data. Ask the team to remove its snippet. Export returns up to 90 days of web aggregates, not credentials or visitor IDs. Share it through an agreed private channel.

If deletion is requested, the operator deletes the project's `events` and `drops` through its site IDs, `api_minute` through tenant ID, domain records and revoked keys. Retain the removed tenant ID as a tombstone (`status='removed'`) so it cannot be enrolled again accidentally. Existing `seal_leaves.leaf` values and their tenant ordering are needed to preserve other tenants' published proofs: remove the deleted project's stored summary text while retaining its hash; the inactive tenant cannot retrieve that proof. Do not rewrite published roots. Previously anchored aggregate commitments remain on Stellar. Backups may retain data until the actual configured expiry; record requests and reapply removals after any restore before reopening collection. Explain that boundary before claiming erasure is complete. Full automated erasure and restore tombstones remain grant work.

## Validation and limits

`npm run check` runs contract, HTTP access, collector, tracker and onboarding tests, types, existing lint/format scopes and frontend build. HTTP fixtures use PGlite and local listeners.

With Docker running, execute the real PostgreSQL check before deployment:

```sh
npm run smoke:pilot:postgres
```

This pulls the official PostgreSQL 17.12 Alpine image if needed and creates its own disposable database on a loopback port. It overrides `DATABASE_URL` for every child process and never targets an existing database. It runs the actual operator CLI and pilot HTTP backend with a non-owner, non-superuser application role, then removes its container and processes. It checks concurrent collection, commit-before-202, failed-write rollback, database pause and restart recovery, private report access, credential rotation/revocation, suspension, JSON export and database-backed Merkle proofs. Idle database disconnections emit a generic log message; the process stays alive and subsequent requests reconnect. Requests during an outage can receive 503; writes are not automatically retried.

CI runs this smoke check on Node 26.13.1. These checks do not establish PostgreSQL RLS, cloud failover or production availability. The smoke test injects a successful domain-proof check for synthetic domains and submits no Stellar transactions. Verify real domain ownership and the deployed tracker-to-dashboard flow on staging before inviting the first project.

The standalone `services/collector/main.ts` still uses its prototype local spool. The Vercel `/e` and local pilot backend use the synchronous database sink. Success after commit does not prevent duplicates when an acknowledgment is lost; there is no client retry identity in this pilot. Future production collection adds that contract and the managed queues.

Keep historical legacy web data and proofs distinguishable at the future Umami cutover. Preserve project/site IDs and installation URLs where feasible; record report-definition changes and provide a deliberate tracker upgrade. Do not extend the legacy session algorithm into a second production analytics engine.
