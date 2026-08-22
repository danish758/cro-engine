# DESIGN.md

Design decisions and tradeoffs behind CRO Engine, and what's explicitly out
of scope for v1.

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

## Experiment configs live in a static module, not a database read from middleware

The redirect experiment (`checkout-flow-v2`) needs its decision made in
`middleware.ts`, before any page renders — that's what makes the redirect
flicker-free. Next.js middleware runs on the **Edge Runtime**, which cannot
load Prisma + SQLite (no Node.js `fs` / native bindings there). Querying a
database on every edge request for config that changes rarely would also
just be pure added latency even where it's technically possible.

So `src/lib/experiments.config.ts` in the demo app is a plain, static
TypeScript module — zero I/O, bundled directly into the edge function — and
is the single source of truth middleware reads. It's mirrored into the
`Experiment` table via `prisma/seed.ts` purely so the data is queryable like
a real system's config would be (e.g. from the dashboard, or a future admin
API), not because middleware ever reads that table. To change an
experiment, you edit the config file and re-run the seed script — there's no
live admin UI in v1 (see non-goals below).

## Exposure deduplication: check-then-insert, with a unique index as backstop

Logging an exposure on every request that touches an experiment would
massively inflate visitor counts relative to real unique exposures — a user
reloading `/pricing` ten times would count as ten "visitors," silently
deflating the conversion rate denominator and corrupting every stat derived
from it. `logExposure()` (`apps/demo-nextjs/src/lib/exposure.ts`) checks for
an existing `(userId, experimentKey)` row before inserting and skips if one
exists. The `@@unique([userId, experimentKey])` index on the `Exposure`
model is a defense-in-depth backstop for the race where two concurrent
requests from a brand-new user both pass the check before either has
inserted — the losing `create` call in that race hits the unique constraint,
which is caught and treated as "someone else already logged this," exactly
the outcome wanted.

Exposure logging itself happens via Next.js's `after()` inside the page
Server Component that actually renders (which knows the confirmed variant
via a middleware-set header), not from middleware directly — again because
middleware can't reach Prisma/SQLite on the Edge Runtime. `after()` fires
once the response has already been sent, so it never adds latency to the
page.

## Conversion rate: unique converting users / unique exposed users

A user can convert multiple times (click "purchase" twice, click a CTA
repeatedly) — that's allowed and doesn't get deduplicated at the event
level. But conversion *rate* is always computed as `distinct(userId) with a
conversion` / `distinct(userId) exposed`, never raw event count, or a single
enthusiastic user would visibly skew a variant's apparent rate. See
`apps/demo-nextjs/src/lib/stats.ts`.

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

## Out of scope for v1

- **Visual experiment editor / admin UI.** Experiments are defined in a
  static config file + seed script. No CRUD UI for creating or editing
  experiments.
- **Authentication.** The `/dashboard` route has no auth — fine for a local
  portfolio project, not fine for anything with real user data.
- **Multi-framework support.** Next.js only; `assignment-engine` and
  `stats-engine` are framework-agnostic by design, but no SDKs for other
  frameworks are built.
- **Bayesian statistics, CUPED, sequential testing, multi-armed bandits.**
  All real techniques used in mature experimentation platforms; none
  implemented here.
- **Revenue/continuous-metric statistical analysis.** The `Conversion` model
  captures an optional `value` field (e.g. order value), but no statistical
  test for continuous metrics (t-test, Mann-Whitney, etc.) is implemented —
  only binary conversion-rate significance testing.

## Roadmap

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
- A minimal admin UI for creating/editing experiment configs, backed by the
  same `Experiment` table that already exists.
