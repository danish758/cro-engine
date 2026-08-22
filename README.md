# CRO Engine

A server-side A/B testing / experimentation platform built from scratch —
deterministic bucketing, sticky assignment, flicker-free edge redirects,
deduplicated exposure logging, and frequentist significance testing, with no
third-party experimentation SDK anywhere in the stack (no GrowthBook,
PostHog, LaunchDarkly, Optimizely, etc.). Everything from the FNV-1a hash to
the normal-distribution CDF is implemented by hand.

This exists as a portfolio piece demonstrating the actual mechanics behind
server-side experimentation platforms — the parts that are easy to get
subtly wrong (bucket correlation across experiments, exposure logging that
inflates visitor counts, redirect flicker, targeting that fails open instead
of closed) — rather than a wrapper around someone else's SDK.

## Architecture

```
cro-engine/
├── packages/
│   ├── assignment-engine/     Pure, dependency-free bucketing + targeting
│   │   ├── hash.ts            FNV-1a + finalizer → bucket in [0, 9999]
│   │   ├── targeting.ts       Rule evaluation, fails closed
│   │   ├── validate.ts        Config validation (run at deploy time)
│   │   └── assign.ts          The main entry point
│   │
│   └── stats-engine/          Pure, dependency-free significance testing
│       ├── normal.ts          Hand-implemented normal CDF + inverse CDF
│       └── ztest.ts           Two-proportion z-test, CIs, sample size calc
│
└── apps/demo-nextjs/          Next.js reference implementation
    ├── src/middleware.ts      Edge runtime: bucketing, sticky cookies,
    │                          flicker-free redirect, variant headers
    ├── src/lib/
    │   ├── experiments.config.ts   Static config — source of truth for
    │   │                            middleware (edge-safe, zero I/O)
    │   ├── exposure.ts        Deduplicated exposure logging (Node runtime)
    │   ├── conversion.ts      Conversion event logging
    │   └── stats.ts           Queries Prisma, feeds stats-engine
    ├── src/app/
    │   ├── checkout/          Redirect-experiment control page
    │   ├── checkout-v2/       Redirect-experiment variant page
    │   ├── pricing/           Content-experiment page (CTA copy)
    │   ├── dashboard/         Live results, server-rendered
    │   └── api/{expose,convert}/route.ts
    └── prisma/schema.prisma   Experiment / Exposure / Conversion models
```

**Request flow for the redirect experiment** (`checkout-flow-v2`):

```
Browser → GET /checkout
             │
             ▼
     middleware.ts (Edge Runtime)
       1. read/set exp_uid cookie (stable bucketing id)
       2. read sticky cookie for this experiment
          │
          ├─ valid (version matches) ──► reuse stored variant, no re-hash
          │
          └─ missing/stale ──► assign() from @cro-engine/assignment-engine
                                (FNV-1a bucket → variant)
       3. canonical path for variant ≠ current path?
          │
          ├─ yes ──► NextResponse.redirect() ─── BEFORE any render ─── zero flicker
          │
          └─ no  ──► NextResponse.next() with x-exp-checkout-flow-v2 header
                          │
                          ▼
                  Server Component (Node runtime) renders the page,
                  reads the header, calls after(() => logExposure(...))
                  — fires after the response is sent, dedup'd by
                  (userId, experimentKey) in SQLite via Prisma
```

Middleware never touches Prisma/SQLite directly — it can't, since it runs on
the Edge Runtime and SQLite needs Node. See [`DESIGN.md`](DESIGN.md) for why
experiment configs live in a static module instead of being queried from
middleware, and why that's a deliberate tradeoff, not an oversight.

## Packages

- [`@cro-engine/assignment-engine`](packages/assignment-engine) — deterministic bucketing, targeting, variant assignment. [README](packages/assignment-engine/README.md)
- [`@cro-engine/stats-engine`](packages/stats-engine) — two-proportion z-test, confidence intervals, sample size calculator. [README](packages/stats-engine/README.md)

Both are pure, dependency-free, and run identically in Node.js, browsers,
and edge runtimes — no Node-only APIs, no third-party experimentation
dependency of any kind.

## Running locally

Requires Node 18+.

```bash
git clone <this-repo>
cd cro-engine
npm install
```

Set up the demo app's database (SQLite via Prisma):

```bash
cd apps/demo-nextjs
npx prisma generate
npx prisma db push
npm run db:seed
cd ../..
```

Run the dev server:

```bash
npm run dev
```

Visit:
- `http://localhost:3000/checkout` — redirect experiment; reload a few times in incognito/different sessions and you'll land on either the original checkout or the redesigned `/checkout-v2`, chosen before any HTML is sent.
- `http://localhost:3000/pricing` — content experiment; the CTA button reads either "Buy Now" or "Get Started Free" depending on your assigned variant.
- `http://localhost:3000/dashboard` — live experiment results, computed by `@cro-engine/stats-engine` from real exposure/conversion rows in SQLite.

## Running tests

```bash
npm test
```

Runs the full `assignment-engine` and `stats-engine` suites (unit tests,
pure functions, no I/O). To also run the demo app's integration tests
(exposure deduplication against a throwaway SQLite file, and middleware
redirect-decision logic):

```bash
cd apps/demo-nextjs
npm test
```

## Dashboard, in practice

The dashboard is a server-rendered HTML table — no charting library, a
lightweight CSS bar underneath each variant row for a visual read. Example
of what it renders once real traffic has flowed through `/checkout` and
`/pricing` a few dozen times each:

```
checkout-flow-v2                                                  [running]

 Variant   Visitors  Conversions  Conv. rate  Lift vs control  p-value  Verdict
 control     60          11        18.33%           —             —    baseline
 variant     62          13        20.97%         +14.4%        0.7144  Not yet significant —
                                                                          need ~3,568 visitors
                                                                          per variant to detect
                                                                          this effect
 control  ████████████████████████████████████░░░░░░░░  18.33%
 variant  █████████████████████████████████████████░░░  20.97%
```

Visitor and conversion counts are unique users — deduplicated exposures,
unique converting users — never raw event counts (see
[`DESIGN.md`](DESIGN.md) for why that distinction matters).

## Documentation

- [`DESIGN.md`](DESIGN.md) — key design decisions, tradeoffs, a real bug found and fixed while building this (FNV-1a's weak avalanche causing cross-experiment bucket correlation), non-goals, and roadmap.
- [`packages/assignment-engine/README.md`](packages/assignment-engine/README.md)
- [`packages/stats-engine/README.md`](packages/stats-engine/README.md)
