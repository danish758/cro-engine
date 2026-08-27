# DESIGN.md

Design decisions and tradeoffs behind CRO Engine, and what's explicitly out
of scope.

**v1** built a single-tenant Next.js app that bucketed directly against its
own SQLite DB — the first six sections below are unchanged from that phase
and still describe how `@cro-engine/assignment-engine` and
`@cro-engine/stats-engine` work today. **v2** turned that into a real
platform: a multi-tenant control plane (`apps/platform`) other projects
integrate with via a client SDK (`@cro-engine/sdk`), proven out by a second
app (`apps/demo-consumer`) that has no database of its own. The sections
after "Frequentist z-test" cover what changed and why.

## FNV-1a + a finalizer, not a cryptographic hash

`hashToBucket()` (in `packages/assignment-engine/src/hash.ts`) needs to be
fast, dependency-free (no Node `crypto` — must run on the Edge Runtime and in
browsers), and distribute short strings uniformly. It does not need
cryptographic properties (preimage resistance, collision resistance as a
security property) — nobody is defending against an adversary crafting
inputs to force a bucket collision. FNV-1a is ~6 lines of integer arithmetic
and fits that profile exactly.

**A bug found while building this, worth documenting explicitly**: plain
FNV-1a under-mixes the bytes it processes last. Bucket keys look like
`${userId}:${experimentKey}:${seed}`, so two different experiments for the
same user share a common trailing `:${seed}` suffix. That shared suffix,
combined with FNV-1a's weak avalanche on recently-processed bytes, produced
a real, measurable correlation between a user's bucket in one experiment and
their bucket in another (caught by the chi-squared independence test in
`test/hash.test.ts`, which failed before the fix). The fix was a small
MurmurHash3-style finalizer (shift/multiply/shift) applied to the FNV-1a
output before bucketing — see the `avalanche()` comment in `hash.ts` for the
full writeup. This is exactly the kind of subtle bucketing bug that would be
silent and impossible to spot from the API surface alone; it only shows up
under a statistical test.

**Tradeoff accepted**: FNV-1a + finalizer over a "real" hash function
(MurmurHash3, xxHash) as a dependency. The dependency-free constraint (must
run identically in Node, browser, and edge) made a hand-rolled hash the
right call; the finalizer step closes the one gap that mattered for this
use case.

## Hash on `userId + experimentKey`, never `userId` alone

If bucketing hashed `userId` alone, a given user would land in the same
relative position of the bucket space in *every* experiment — e.g. always in
the bottom 5%. If that segment happens to correlate with anything else
(signup cohort, traffic source), every experiment running at once would
silently inherit that correlation, with no way to detect it from the
results themselves. Hashing `userId + experimentKey` together makes each
experiment's bucketing statistically independent of every other one's. See
[`packages/assignment-engine/README.md`](packages/assignment-engine/README.md)
for the full explanation and a worked example.

## Targeting fails closed

If targeting rules are defined but no user attributes were provided,
`matchesTargeting()` returns `false` (excluded), not `true`. The failure
mode of "let them in when unsure" silently pollutes a targeted experiment's
control/treatment populations with users who should never have been
eligible — a correctness bug with no visible error. Excluding by default is
recoverable (undercounting); including by default is not (the data is
already contaminated by the time anyone notices).

## Context attributes: a curated registry, not generic query-param passthrough

Targeting rules need something to evaluate against, so `demo-consumer`'s
middleware gathers a small set of named attributes per request
(`src/lib/request-attributes.ts`) and passes them into every
`assign()`/`croEngine.assign()` call on that route. The tempting simpler
design — spread every query param on the URL into `attributes` generically
— was considered and rejected for two concrete reasons, not just "more
control is nice": query-param values are entirely user-controlled and
spoofable (fine for campaign-style targeting like `src=newsletter`, not
something to trust for anything that needs to be genuinely true), and
sticky assignment only re-evaluates targeting when an assignment is
actually (re)computed, not on every request — a fully dynamic attribute set
would make "why did this behave differently this time" harder to reason
about than a short, named list.

Instead, attributes come from an explicit extractor registry — an array of
small functions, each producing one `[key, value]` pair. Adding a new
context key later (a specific query param, another derived signal) is one
entry in that array; `middleware.ts` itself never changes. The `device`
attribute reuses Next.js's own built-in `userAgent()` parser (`next/server`)
rather than a hand-rolled User-Agent regex — no new dependency, no
reinventing UA parsing.

## Variant forcing: SDK-level, URL-only, deliberately stateless

QA needs a way to see a specific variant without waiting on real bucketing
— including previewing a `draft` or `stopped` experiment, or one a
targeting rule would otherwise exclude them from. This lives mostly in
`@cro-engine/sdk`, not hand-rolled per consuming app: `CroEngineClient.
assign()` accepts an optional `{ forceVariant }`, and short-circuits to it
directly — skipping status *and* targeting entirely — when it names a real
variant on that experiment. An unrecognized `forceVariant` (typo, a variant
that was since removed) silently falls back to normal assignment rather
than excluding, so a stale QA link degrades gracefully instead of looking
like a broken experiment. The forced result is tagged with a `bucket: -1`
sentinel (real buckets are always `0`–`9999`) so a caller can tell a forced
assignment apart from a computed one without a separate boolean threaded
through the whole call chain.

Reading *how* an operator specifies the override is app-specific, same
reasoning as `ROUTE_EXPERIMENTS`: `demo-consumer`'s middleware reads a
`cro_force_<experimentKey>=<variantKey>` query param and passes it straight
through. Deliberately **no cookie** — forcing lasts exactly as long as the
param is on the URL, nothing persists. This was a specific, deliberate
choice over a more "sticky" cookie-backed override: it means a forced view
never contaminates a later, unrelated visit, and it already works correctly
through the redirect-type experiment for free, since `middleware.ts`'s
redirect preserves the full query string on the `/checkout` → `/checkout-v2`
hop.

Forced views must never count as real traffic — they're skipped from
`trackExposure()` entirely, encoded as a `|forced` suffix on the variant
header (`variantKey|forced`) rather than a parallel header per experiment,
so pages can tell the two apart with one string split instead of reading an
extra header per experiment.

## Sticky assignment via a version-tagged cookie, not a DB round trip

A user's assignment for an experiment is cached in a cookie
(`exp_sticky_<experimentKey>`) as `${variantKey}:${configVersion}`, where
`configVersion` is a short hash of the experiment's variant list + seed
(`packages/../experiment-version.ts` in the demo app). On each request:

- If the cookie's version matches the live config's version, the stored
  variant is trusted as-is — the user is **not** re-randomized, even though
  `assign()` would be cheap enough to just call again. This is what makes
  bumping `seed` in the config work as "re-randomize without renaming the
  experiment": the version fingerprint changes, so old sticky cookies stop
  matching and those users get bucketed fresh under the new seed.
- Experiment `status` is still re-checked on every request regardless of the
  sticky cookie — an experiment that was stopped since the cookie was set no
  longer resolves to a variant, even for a user who has a "valid" sticky
  cookie for it.

This keeps middleware from ever needing a database round trip to make a
bucketing decision — see the next section for why that constraint exists at
all.

## v1's static config file is gone — the SDK reads a live API instead

v1's `experiments.config.ts` existed because Next.js middleware ran on the
**Edge Runtime**, which couldn't load Prisma + SQLite. In v2, that
constraint is solved a level up: `apps/demo-consumer`'s middleware no longer
touches a database *at all*, live or static — it calls
`@cro-engine/sdk`'s `assign()`, which fetches config from the platform's
public API and caches it locally (see the SDK section below). The consuming
app never needs its own database, static or otherwise; the platform's
Postgres is the one and only source of truth, and any project using the SDK
sees changes made through the platform's admin UI on their very next
request once the SDK's cache expires (default 30s TTL, configurable).

`apps/platform`'s own `middleware.ts`, by contrast, runs on the **Node.js
runtime** — stable since Next.js 15.5 (`export const config = { runtime:
'nodejs' }`, see the [15.5 release notes](https://nextjs.org/blog/next-15-5#nodejs-middleware-stable)).
This is a better fit for the platform than Edge ever would have been: the
platform already depends on Postgres for everything else, so there was no
constraint pushing it toward Edge in the first place, and Node middleware
lets its session-auth gate query the DB directly instead of needing its own
Edge-vs-Node workaround. Platform middleware does exactly one thing now —
verify the session cookie — since experiment-bucketing logic doesn't live
in the platform at all anymore (see "Control plane, not data plane" below).

## Exposure deduplication: check-then-insert, with a unique index as backstop

Logging an exposure on every request that touches an experiment would
massively inflate visitor counts relative to real unique exposures — a user
reloading `/pricing` ten times would count as ten "visitors," silently
deflating the conversion rate denominator and corrupting every stat derived
from it. The events route (`apps/platform/src/app/api/v1/events/route.ts`)
checks for an existing `(projectId, userId, experimentKey)` row before
inserting and skips if one exists. The `@@unique([projectId, userId,
experimentKey])` index on the `Exposure` model is a defense-in-depth
backstop for the race where two concurrent requests from a brand-new user
both pass the check before either has inserted — the losing `create` call
in that race hits the unique constraint, which is caught and treated as
"someone else already logged this," exactly the outcome wanted.

On the consuming-app side, exposure tracking is queued
(`croEngine.trackExposure(...)`) and sent via `croEngine.flush()` inside
Next.js's `after()`, so it never adds latency to the page — the same
"fire after the response is sent" property v1 had, just going over HTTP to
the platform instead of a direct DB write.

## Conversion rate: unique converting users / unique exposed users

A user can convert multiple times (click "purchase" twice, click a CTA
repeatedly) — that's allowed and doesn't get deduplicated at the event
level. But conversion *rate* is always computed as `distinct(userId) with a
conversion` / `distinct(userId) exposed`, never raw event count, or a single
enthusiastic user would visibly skew a variant's apparent rate. See
`apps/platform/src/lib/stats.ts`.

Since experiments are now created dynamically per project rather than
hardcoded, there's no way to infer *which* conversion event belongs to
*which* experiment automatically the way v1's hardcoded two-experiment
mapping could. Each `Experiment` row carries an optional `conversionEvent`
field, set in the wizard's Basics step — the dashboard shows visitor counts
only (no significance test) when it's unset. Similarly, v1 always compared
against a variant literally named `"control"`; since admins can now name
variants anything, the baseline for lift/significance is whichever variant
is listed *first* in the experiment's own config (`stats.ts`), not a
hardcoded key.

## Frequentist z-test, not Bayesian

`@cro-engine/stats-engine` implements a two-proportion z-test — the
industry-standard baseline most teams expect from an A/B report — with
p-values, a fixed 0.05 significance threshold, and Wald confidence
intervals. It does not implement Bayesian inference (posterior probability
of "B beats A," priors, or the ability to peek at results continuously
without inflating false-positive rate the way repeated frequentist testing
does). Bayesian analysis is a real, well-known alternative some
experimentation platforms use instead — it's a roadmap item, not built here,
because the frequentist z-test is simpler to implement correctly from
scratch without an external stats library and is the more universally
expected default.

The confidence intervals use the **Wald interval**
(`p_hat ± 1.96 * sqrt(p_hat*(1-p_hat)/n)`), which is a known-poor
approximation at small `n` or rates near 0/1. A Wilson score interval would
be more robust and is a candidate improvement — see roadmap.

**A second real bug found while building this, live in the platform
dashboard**: `minimumSampleSize()` shifts the baseline rate by the relative
MDE to get a comparison rate (`p2 = p1 * (1 + mde)`) without clamping it —
so a high baseline combined with a large observed lift (e.g. `p1 = 1.0`,
`mde = 1.0` → `p2 = 2.0`, not a valid probability) corrupts the variance
term and can surface as a **negative** sample size. This showed up for
real, not in a unit test first — a single-visitor experiment with a 100%
baseline conversion rate rendered "need ~-15 visitors per variant" on the
dashboard. Fixed by clamping `p2` to `[0, 1]` (it's a probability) and
returning `Infinity` explicitly when the clamp collapses `p1` and `p2` to
the same value (no finite sample size can detect a zero-width effect) —
see the comment above `minimumSampleSize()` in `ztest.ts`.

## Control plane, not data plane

The platform (`apps/platform`) never computes anyone's bucket. It stores
experiment config (`Experiment` rows) and receives events (`Exposure`/
`Conversion` rows via `/api/v1/events`) — that's it. The actual assignment
decision happens inside `@cro-engine/sdk`, running in the *consuming* app's
own process, calling the same `assign()` from `@cro-engine/assignment-engine`
this whole project is built around. This mirrors how GrowthBook, Statsig,
and LaunchDarkly are actually architected: their servers don't decide your
variant, your SDK does, using a config payload their API handed you.

This split is what makes the platform genuinely usable by an unrelated
project rather than just self-consistent: a consuming app never depends on
the platform being reachable to render a page (a cached, possibly-stale
config is enough), and the platform never becomes a per-request bottleneck
for traffic it doesn't own. See [`packages/sdk/README.md`](packages/sdk/README.md)
for the caching/lazy-refresh design in detail.

## Multi-tenancy: every experiment-data table carries a `projectId`

`Account` (a login) owns zero or more `Project`s; each `Project` owns its
own `ApiKey`s and `Experiment`s. `Exposure` and `Conversion` rows carry
`projectId` directly (not derived through a join) so every query that reads
or writes experiment data is naturally scoped, and uniqueness constraints
that were global in v1 (one `Experiment.key` per whole app) are now scoped
per-project (`@@unique([projectId, key])`) — two different projects can both
have a `checkout-flow-v2` experiment without colliding.

Authorization follows the same shape: `requireOwnedProject(accountId,
projectId)` (`apps/platform/src/lib/authz.ts`) is a `findFirst` filtered by
*both* the project id and the requesting account's id, used by every
project-scoped route — a project id alone is never enough to act on it,
it must also belong to whoever's asking. The SDK-facing API uses a
completely different mechanism (API keys, not sessions) for the same
reason a browser session shouldn't be how machine-to-machine calls
authenticate — see below.

## Auth: scrypt for passwords, DB-backed sessions, hashed API keys

Three different credentials, three different tradeoffs:

- **Account passwords** are hashed with Node's built-in `crypto.scrypt`
  (`apps/platform/src/lib/password.ts`), not bcrypt or argon2. It's an
  OWASP-endorsed KDF and needs no added dependency — bcrypt requires a
  package, argon2 usually needs a native binding that's awkward in
  serverless. This is deliberately the one place in the project that leans
  on a standard primitive rather than "build it yourself": password hashing
  is a well-known place to introduce a real vulnerability if done casually,
  and the portfolio value here is in the experimentation mechanics, not in
  reinventing a KDF.
- **Sessions are DB-backed** (`Session` rows), not stateless signed tokens.
  The cookie holds only an opaque random id; middleware looks it up in
  Postgres. This makes logout/revocation real — delete the row — instead of
  "valid until it happens to expire," which a signed-token approach can't
  offer without also maintaining a revocation list (at which point you've
  built the DB-backed version anyway, just less directly).
- **API keys are hashed at rest** (`sha256`, not `scrypt` —
  `apps/platform/src/lib/api-key.ts`) and shown once at creation, same UX as
  GitHub/Stripe tokens. `scrypt`'s deliberate slowness defends against
  guessing a low-entropy secret; there's nothing to guess in a 192-bit
  random token, so the extra cost would only slow down every single SDK
  request for no security benefit.

## Out of scope

v1's "no admin UI" and "no authentication" non-goals are done as of v2 — an
account signup/login flow, a project-scoped multistep experiment wizard
(create/edit/delete), and API key management now exist. What's still out of
scope:

- **Real deployment.** Everything runs locally (Docker Postgres, `npm run
  dev`) by design for this pass — no hosted Postgres, no production secrets
  management, no domain. See the roadmap.
- **Billing, rate limiting, or abuse protection on the public API.** A real
  hosted multi-tenant service would need per-key rate limits at minimum;
  `/api/v1/*` currently has none.
- **Team accounts.** One `Account` per login, one login per `Project`
  (via ownership) — no inviting teammates to a project, no roles/permissions
  beyond "you own it or you don't."
- **A generic per-experiment page renderer.** `apps/demo-consumer`'s
  `/checkout` and `/pricing` pages are still hardcoded React components
  bound to two fixed experiment keys. Admins can create *other* experiments
  through the platform UI — they're fully live, bucketed, and visible on the
  dashboard — they just won't have a page consuming them unless one is
  written, same as any real feature-flag platform where not every flag has
  UI wired to it yet.
- **Multi-framework SDKs.** `@cro-engine/sdk` is framework-agnostic
  (fetch-only, no Next.js-specific APIs in its own code), but only
  `apps/demo-consumer` (Next.js) actually uses it — no dedicated
  React/Vue/Express integration helpers.
- **Bayesian statistics, CUPED, sequential testing, multi-armed bandits.**
  All real techniques used in mature experimentation platforms; none
  implemented here.
- **Revenue/continuous-metric statistical analysis.** The `Conversion` model
  captures an optional `value` field (e.g. order value), but no statistical
  test for continuous metrics (t-test, Mann-Whitney, etc.) is implemented —
  only binary conversion-rate significance testing.

## Roadmap

- Deploy the platform for real (hosted Postgres — Supabase was the
  candidate discussed and rejected Firebase for, specifically to keep SQL
  and self-hostability rather than a proprietary NoSQL store; see the
  multi-tenancy section above for why the relational model matters here).
- Rate limiting per API key on `/api/v1/*`.
- Team accounts / inviting collaborators to a project.
- Wilson score confidence intervals instead of Wald, especially for
  low-traffic experiments.
- Bayesian analysis mode (posterior win probability) as an alternative to
  the frequentist z-test.
- CUPED (variance reduction using pre-experiment covariates) for faster
  significance on noisy metrics.
- Sequential testing / always-valid p-values, to make continuous monitoring
  statistically sound instead of just a fixed-horizon test.
- Multi-armed bandit allocation as an alternative to fixed-weight
  assignment, for experiments optimizing for outcome during the test itself
  rather than purely for a clean post-hoc read.
- Revenue/continuous-metric significance testing (t-test or a
  non-parametric equivalent) using the `value` field already captured on
  conversions.
