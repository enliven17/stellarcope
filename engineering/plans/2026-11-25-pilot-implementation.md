# Web pilot implementation plan

> **For agentic workers:** Use superpowers:executing-plans task by task with test-first changes and a final independent review.

**Goal:** Make the existing Stellarcope prototype usable by a small, manually onboarded cohort on public websites.

**Architecture:** Keep the current tracker, PostgreSQL schema, collector and React dashboard. Reuse hashed `api_keys` for tenant-scoped pilot read codes exchanged for HttpOnly cookies. The deployed collector commits directly to PostgreSQL before acknowledging collection. Preserve the public self-measurement demo and existing proof URLs while enforcing visibility on private tenants.

**Tech stack:** Existing TypeScript/Node, React/Vite, node-postgres, PGlite tests. No new runtime dependencies.

**Spec:** The approved pilot proposal in this chat, captured below.

## Approved scope

- Three to five manually enrolled projects, one public website each; a domain-verification tag and pinned script are the tenant integration.
- Private project dashboard showing pageviews, daily visitor counts, trends, pages, referrers, countries, browsers and devices.
- Hide misleading session/bounce metrics and unfinished API, wallet and trust views in the pilot; preserve the existing public demo.
- Fix tracker integrity, observable collection failure, acknowledgment after storage, project isolation and input sanitation.
- Manual enrollment, verification, access rotation/revocation and a documented operator/offboarding procedure.
- Defer SEP-10 self-service, production RLS, queues, Umami integration, API/onchain collection, automatic Wallets Kit capture and HA infrastructure.

## Global constraints

- Branch: `feat/pilot-implementation` (explicit user request).
- Use the current checkout on that branch; no additional worktree requested.
- No deployment, live database changes, real enrollment or external outreach.
- Do not modify published tracker JavaScript bytes. Correct stale integrity metadata; publish changed tracker code under a new version.
- Keep credentials out of URLs, browser storage, logs and committed files. Cookies are HttpOnly and SameSite, Secure on HTTPS; every private read revalidates the stored hash, scope and active tenant.
- Private responses use no-store. Public aggregates must never include private tenants.
- New code lives beside the legacy implementation; the disabled production ingress stays disabled.
- Preserve the existing visual language and components.

## Review focus

1. Changing a tenant query, forged/expired/revoked credentials, and direct proof/live URLs must not bypass project isolation.
2. Concurrent collection requests and storage errors must not mix records or acknowledge failed commits.
3. Paths, encoded identifiers, campaign fields and logs must not preserve submitted secrets or personal-looking data.
4. A stale fetch or failed refresh must not show another project's cached data or silently look current.
5. Tracker bytes, integrity metadata, generated snippets and actual execution must agree; failed analytics must not break the host page.

### Task 1: Private pilot access

**Files:** new `services/api/access.ts`, `services/api/pilot.ts`, `services/api/pilot.test.ts`, `api/pilot.ts`; existing tenant read entry points.

**Interfaces:** `authorizeTenant(sql, req, tenant)` resolves an active public tenant or a matching private read credential; `pilotSession(sql, origin)` returns the login/session/logout HTTP handler.

- [x] Write and run failing real-query/HTTP tests for private A/B isolation, cookie and bearer access, revocation, inactive projects, public compatibility, no-store, same-origin login/logout and all tenant read endpoints.
- [x] Implement code exchange and authorization using the existing key table, without a human identity system.
- [x] Gate stats/live/seals/proof before querying data; keep public projects filtered.
- [x] Verify focused tests and types. Expected: all access scenarios pass without live credentials.

### Task 2: Collection and tracker reliability

**Files:** collector/serverless plumbing, shared privacy helpers, tracker source/build metadata and behavioral tests.

**Interfaces:** an awaited collector sink; database-backed collector; a sanitized legacy payload; new immutable tracker build.

- [x] Add failing tests for commit-before-response, concurrent requests, failed persistence, invalid/oversized input and sanitation.
- [x] Await the sink and return generic failures; remove the serverless global pending batch and post-response persistence.
- [x] Add behavioral tracker tests for initial/SPA pageviews, network failure containment and integrity checks.
- [x] Correct 1.0.0 metadata without changing its JavaScript; publish updated code as 1.0.1.
- [x] Verify focused tests and build. Expected: committed collection receives 202; failed storage receives 503; tracker artifacts pass integrity and behavior checks.

### Task 3: Assisted onboarding and web dashboard

**Files:** new operator helper/CLI/tests and `src/pages/Pilot.tsx`; dashboard/API hooks/navigation; README, rendered docs and `engineering/pilot.md`.

**Interfaces:** manual enroll/verify/rotate/revoke/suspend commands; `/pilot` code sign-in; existing stats/live APIs with cookie access.

- [x] Add failing tests for onboarding transactions, verification, private-by-default creation and rotation/revocation.
- [x] Implement the operator flow using the existing schema; print credentials only once to the invoking operator.
- [x] Add the private web-only dashboard and reuse existing components, with installation status, accurate labels and refresh/error handling.
- [x] Document local backend use, environment, onboarding, validation, retention and offboarding; explain prototype limits and future cutover.
- [x] Verify full tests, types, lint, formatting, frontend build and browser smoke with local fixtures. Expected: usable login, data, empty/error, mobile and logout states; no production calls.

### Task 4: Independent review and final verification

- [x] Review the complete branch for access leaks, failure handling and pilot scope.
- [x] Address material findings with regression tests.
- [x] Run the full check with a compatible runtime; verify branch and diff.
- [x] Report implementation, verification and remaining deployment/operator steps. Leave deployment and merging to the user.

## Verification record

- Baseline: 56 tests passed before changes.
- Final gate: `npm run check` passed on the official Node 24.22.3 runtime, including 72 tests, types, lint, formatting and frontend build. The existing large frontend chunk warning remains.
- Independent review: private API gates, storage/connection failure recovery, encoded-path and credential sanitation, ownership redirect handling, polling deadlines, whole-dashboard access invalidation and export instructions reviewed and corrected. Operator target checks and top-page percentages were corrected as well.
- Browser: local in-memory fixture verified invalid-code handling, private sign-in, mobile layout, access denial clearing protected views, unavailable-data state and a real cross-origin 1.0.1 script sending a stored pageview.
- Environment limit: Docker CLI is present but its daemon is stopped; real PostgreSQL/cloud deployment validation was not performed. No live database, deployment or customer enrollment was changed.
- Implementation uses the approved branch in the existing checkout and no new runtime dependencies. Pilot codes last 30 days; browser cookies last seven days; Vite uses the local backend by default.
