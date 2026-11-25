# Engineering documentation

Stellarcope uses **Umami internally**, behind its own admission layer. Ingress is stateless, web events and metrics flow through managed queues, and workers write to PostgreSQL with exactly-once effects.

## Documents

| Document | Contents |
|---|---|
| [Technical architecture](technical-architecture.md) | The target system: data flows, tenant isolation, privacy, security, the 99.99% availability design, infrastructure, integration and handover |
| [Architecture diagrams](diagrams/) | Fourteen diagram pages: system overview, web and access sequences, API and onchain flows, state machines, data models, infrastructure, failover, privacy and handover. They are shown as PNGs, with the editable [draw.io source](diagrams/stellarcope-architecture.drawio). |
| [Roadmap](roadmap.md) | What exists today and what each milestone delivers |
| [Technology decisions](decisions.md) | The selected stack, the evidence behind each choice, delivery semantics and coding practices |
| [Early web pilot](pilot.md) | Assisted onboarding, private project access, the legacy web collector and local setup; production integrations remain deferred |
| [Ingress service](ingress.md) | Running the ingress service: commands, routes, configuration, limits, logging and known limitations |
| [Service images](../infra/images/README.md) | Reproducible image definitions and upstream coupling |
| [Initial advisory review](security/initial-advisory-review/README.md) | Dependency and image findings at the recorded revision; the active definitions and lockfiles were patched afterwards |

## Background

- [Stack lab](../experiments/stack/README.md) and [findings](../experiments/stack/FINDINGS.md): package compatibility, schemas, real Umami reporting, signed identities, queue admission and histograms.
- [Reliability lab](../experiments/reliability/README.md) and [findings](../experiments/reliability/FINDINGS.md): retries and duplicates, database and process failures, persistence limits, transactions and row-level security.
- [Original architecture proposal](architecture-proposal.md) and [stack research](stack-research.md): earlier analysis; the technology decisions supersede them wherever they differ.

The experiments are isolated fixtures. They are not production handlers, and they do not prove the availability targets. Never import their token-issuance, message-consumption or failure-control endpoints into application services.

## Development

Run `npm ci` and `npm run check` with the maintained Node version. New services and packages use strict indexed and optional checking, typed linting and formatting. Branch and commit conventions are in [CONTRIBUTING.md](../CONTRIBUTING.md).

Documentation lives in `engineering/`. The `src/docs/` directory holds the separately rendered product documentation.
