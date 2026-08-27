# CRO Engine

A server-side A/B testing platform built from scratch — deterministic
bucketing, sticky assignment, flicker-free edge redirects, deduplicated
exposure logging, frequentist significance testing, and now a real
multi-tenant control plane with a client SDK, so it's something *other*
projects can actually integrate with, not just a self-contained demo. No
third-party experimentation SDK anywhere in the stack (no GrowthBook,
PostHog, LaunchDarkly, Optimizely, etc.) — everything from the FNV-1a hash
to the normal-distribution CDF to the multi-tenant auth is implemented by
hand.

This exists as a portfolio piece demonstrating the actual mechanics behind
server-side experimentation platforms, including the control/data-plane
split that makes a *hosted* platform viable — the SDK evaluates bucketing
locally in the consuming app's own process, not via a round trip on every
page load.

## Architecture

```
Someone else's project (apps/demo-consumer is a stand-in for this)
  │
  │  npm install @cro-engine/sdk
  │
  ├─ middleware.ts (Edge Runtime — no DB dependency of its own)
  │    croEngine.assign('checkout-flow-v2', { userId })
  │       │
  │       ├─ cache warm? ──────────────► assign() locally via
  │       │                              @cro-engine/assignment-engine
  │       │                              (zero network call)
  │       │
  │       └─ cache cold/stale ─► GET /api/v1/config (Bearer <project API key>)
  │                              then assign() locally, same as above
  │
  └─ after the response is sent:
       croEngine.trackExposure(...) / trackConversion(...) → queued
       croEngine.flush() → POST /api/v1/events (batched, fire-and-forget)
                                    │
                                    ▼
                     ┌──────────────────────────────────┐
                     │   apps/platform (control plane)   │
                     │                                    │
                     │  Postgres: Account / Project /     │
                     │  ApiKey / Experiment / Exposure /   │
                     │  Conversion — every experiment-data │
                     │  table carries a projectId          │
                     │                                    │
                     │  Dashboard (session auth):          │
                     │    signup/login, create Project,    │
                     │    create/revoke ApiKey, the         │
                     │    multistep experiment wizard,      │
                     │    project-scoped stats dashboard    │
                     │                                    │
                     │  Public API (API-key auth):          │
                     │    GET  /api/v1/config               │
                     │    POST /api/v1/events                │
                     │                                    │
                     │  middleware.ts — Node.js runtime,    │
                     │  ONLY a session-auth gate. Platform  │
                     │  never computes anyone's bucket.     │
                     └──────────────────────────────────┘
```

**The core idea**: the platform is a control plane, not a data plane. It
stores experiment config and receives events; it never decides anyone's
variant. That decision happens inside the consuming app, via the SDK,
using the same `assign()` this whole project started with — the SDK doesn't
reimplement bucketing, it just adds config-fetching and caching around the
existing pure function.

## Packages

- [`@cro-engine/assignment-engine`](packages/assignment-engine) — deterministic bucketing, targeting, variant assignment. Framework-agnostic, zero dependencies. [README](packages/assignment-engine/README.md)
- [`@cro-engine/stats-engine`](packages/stats-engine) — two-proportion z-test, confidence intervals, sample size calculator. [README](packages/stats-engine/README.md)
- [`@cro-engine/sdk`](packages/sdk) — the client SDK: fetches config from the platform, evaluates bucketing locally, batches exposure/conversion events. [README](packages/sdk/README.md)

All three are pure/dependency-minimal and run identically in Node.js,
browsers, and edge runtimes.

## Apps

- [`apps/platform`](apps/platform) — the control plane: multi-tenant Postgres, account signup/login, project + API key management, the experiment CRUD wizard, and the public `/api/v1/*` endpoints the SDK talks to.
- [`apps/demo-consumer`](apps/demo-consumer) — a stand-in for "someone else's project." Installs `@cro-engine/sdk`, has **no database of its own**, and runs the same `/checkout` (redirect experiment) and `/pricing` (content experiment) demo pages v1 had — now bucketed entirely through the SDK against a real platform project.

## Running locally

Requires Node 18+ and Docker (for local Postgres).

```bash
git clone <this-repo>
cd cro-engine
npm install
```

Start Postgres and set up the platform's database:

```bash
docker compose up -d postgres
cd apps/platform
cp .env.example .env   # defaults already point at the compose Postgres
npx prisma generate
npx prisma db push
cd ../..
```

Run the platform:

```bash
cd apps/platform
npm run dev   # http://localhost:3000
```

Sign up, create a project, create an API key, and create at least the two
demo experiments through the wizard — `checkout-flow-v2` (two variants,
`control` / `variant`, 50/50) and `pricing-cta-copy` (same split) — since
`apps/demo-consumer`'s pages are wired to those two keys specifically.

Then, in a second terminal, set up and run the consumer app:

```bash
cd apps/demo-consumer
cp .env.example .env
# edit .env: paste the API key you created above into CRO_ENGINE_API_KEY
npm install
npm run dev   # http://localhost:3001
```

Visit:
- `http://localhost:3001/checkout` — redirect experiment; bucketed by the SDK before any HTML is sent.
- `http://localhost:3001/pricing` — content experiment; CTA copy changes by variant.
- `http://localhost:3000/projects/<id>/dashboard` — live results, computed by `@cro-engine/stats-engine` from real exposure/conversion rows the SDK sent over the platform's public API.

## Running tests

```bash
npm test
```

Runs the three pure packages' suites (`assignment-engine`, `stats-engine`,
`sdk` — no infrastructure needed). The two apps' own tests need their
respective setups:

```bash
cd apps/platform && npm test        # needs Postgres running (docker compose up -d postgres)
cd apps/demo-consumer && npm test   # no infrastructure needed (mocks the SDK)
```

## Documentation

- [`DESIGN.md`](DESIGN.md) — key design decisions, tradeoffs, real bugs found and fixed while building this, non-goals, and roadmap.
- [`packages/assignment-engine/README.md`](packages/assignment-engine/README.md)
- [`packages/stats-engine/README.md`](packages/stats-engine/README.md)
- [`packages/sdk/README.md`](packages/sdk/README.md)
