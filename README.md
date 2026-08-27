# CRO Engine

The engine behind [CRO Engine](https://github.com/danish758/platform), a
server-side A/B testing platform built from scratch — deterministic
bucketing, sticky assignment, frequentist significance testing, and a
client SDK, so the platform is something other projects can genuinely
integrate with, not just a self-contained demo. No third-party
experimentation SDK anywhere in this stack (no GrowthBook, PostHog,
LaunchDarkly, Optimizely, etc.) — everything from the FNV-1a hash to the
normal-distribution CDF is implemented by hand.

This repo is the three published packages. The platform (the control
plane other projects sign up for) and an example integration app live in
their own repos — see below.

## Packages

- **[`@cro-engine/assignment-engine`](packages/assignment-engine)** — deterministic bucketing, targeting, variant assignment. Framework-agnostic, zero dependencies, runs identically in Node, browsers, and edge runtimes. [README](packages/assignment-engine/README.md)
- **[`@cro-engine/stats-engine`](packages/stats-engine)** — two-proportion z-test, confidence intervals, sample size calculator. [README](packages/stats-engine/README.md)
- **[`@cro-engine/sdk`](packages/sdk)** — the client library: fetches a project's experiment config, evaluates bucketing **locally** (no per-request network call), batches exposure/conversion events, and supports forcing a variant for QA. [README](packages/sdk/README.md)

```bash
npm install @cro-engine/sdk
```

## Part of the CRO Engine project

- **[platform](https://github.com/danish758/platform)** — the multi-tenant control plane: sign up, create a project, create experiments through a wizard, get an API key. This is what `@cro-engine/sdk` talks to.
- **[acme-storefront](https://github.com/danish758/acme-storefront)** — a reference integration: a small Next.js storefront with zero database of its own, proving `@cro-engine/sdk` works for a genuinely separate project, not just this monorepo.
- **[`DESIGN.md`](DESIGN.md)** (this repo) — the packages' design decisions: why FNV-1a, why hash on `userId + experimentKey`, why targeting fails closed, why a frequentist z-test, the context-attribute/variant-forcing design in the SDK, and two real bugs found and fixed while building this.

## Running locally

```bash
git clone https://github.com/danish758/cro-engine.git
cd cro-engine
npm install
npm test
```

No infrastructure needed — all three packages are pure/dependency-light and
their test suites mock or avoid I/O entirely (58 tests, no database, no
network).

## Running tests

```bash
npm test
```

Runs all three packages' suites. Individually:

```bash
cd packages/assignment-engine && npm test   # 30 tests
cd packages/stats-engine && npm test        # 13 tests
cd packages/sdk && npm test                 # 15 tests
```
