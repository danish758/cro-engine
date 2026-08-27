# DESIGN.md

Design decisions and tradeoffs behind the `@cro-engine/*` packages — the
engine and SDK. Platform-specific decisions (multi-tenancy, auth,
deployment scope) live in the [platform repo's own
DESIGN.md](https://github.com/danish758/platform/blob/main/DESIGN.md).

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

Targeting rules need something to evaluate against. The recommended
integration pattern (see `acme-storefront`, the reference app, for a working
example) is a small extractor registry in the *consuming app* — an array of
functions each producing one `[key, value]` pair, gathered once per request
and passed into `client.assign(key, { userId, attributes })`. The tempting
simpler design — spread every query param on the URL into `attributes`
generically — was considered and rejected for two concrete reasons, not
just "more control is nice": query-param values are entirely user-controlled
and spoofable (fine for campaign-style targeting like `src=newsletter`, not
something to trust for anything that needs to be genuinely true), and sticky
assignment (see below) only re-evaluates targeting when an assignment is
actually (re)computed, not on every request — a fully dynamic attribute set
would make "why did this behave differently this time" harder to reason
about than a short, named list.

This lives in the consuming app, not the SDK itself, deliberately — a
Next.js app reads query params and `User-Agent` differently than an Express
app or a mobile client would, so the SDK stays a thin, environment-agnostic
`assign(key, ctx)` and lets each integration decide what `ctx.attributes`
should contain.

## Variant forcing: SDK-level, URL-only, deliberately stateless

QA needs a way to see a specific variant without waiting on real bucketing
— including previewing a `draft` or `stopped` experiment, or one a
targeting rule would otherwise exclude them from. This lives in the SDK,
not hand-rolled per consuming app: `CroEngineClient.assign()` accepts an
optional `{ forceVariant }`, and short-circuits to it directly — skipping
status *and* targeting entirely — when it names a real variant on that
experiment. An unrecognized `forceVariant` (typo, a variant that was since
removed) silently falls back to normal assignment rather than excluding, so
a stale QA link degrades gracefully instead of looking like a broken
experiment. The forced result is tagged with a `bucket: -1` sentinel (real
buckets are always `0`–`9999`) so a caller can tell a forced assignment
apart from a computed one without a separate boolean threaded through the
whole call chain.

Reading *how* an operator specifies the override is left to the consuming
app, same reasoning as context attributes above — `acme-storefront`'s
middleware reads a `cro_force_<experimentKey>=<variantKey>` query param and
passes it straight through. Deliberately **no cookie** in that reference
implementation — forcing lasts exactly as long as the param is on the URL,
nothing persists, which means a forced view never contaminates a later,
unrelated visit. It works correctly through a redirect-type experiment for
free, as long as the redirect response preserves the original query string.

Forced views must never count as real traffic — the recommended pattern is
to skip `trackExposure()` entirely for a forced result (check the `bucket
=== -1` sentinel, or thread the distinction through however suits the app).

## Sticky assignment: a version-tagged cookie, computed by the consuming app

`assign()` is a pure function of `(config, userId)` — calling it fresh on
every request would already give the correct, deterministic result. Sticky
assignment (caching a user's variant in a cookie so a config-version change
can be detected and invalidated on purpose) is a recommended integration
pattern, not something the SDK does for you, since it's fundamentally about
*this specific app's* cookie handling.

The pattern used in `acme-storefront`: cache `${variantKey}:${configVersion}`
in a cookie named after the experiment key, where `configVersion` is a short
hash of the experiment's variant list + seed
(`hashToBucket(JSON.stringify({variants, seed}))` — see
`assignment-engine`'s `hashToBucket` export). If the cookie's version
matches the live config's version, trust the stored variant as-is. Bumping
an experiment's `seed` changes the fingerprint, so old sticky cookies stop
matching and those users get bucketed fresh — this is what "re-randomize
without renaming the experiment" is built on. Status is still worth
re-checking on every request regardless of a valid sticky cookie, so a
stopped experiment stops resolving even for users who already have one.

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

**A real bug found while building this, live in the platform's dashboard**:
`minimumSampleSize()` shifts the baseline rate by the relative MDE to get a
comparison rate (`p2 = p1 * (1 + mde)`) without clamping it — so a high
baseline combined with a large observed lift (e.g. `p1 = 1.0`, `mde = 1.0` →
`p2 = 2.0`, not a valid probability) corrupts the variance term and can
surface as a **negative** sample size. This showed up for real, not in a
unit test first — a single-visitor experiment with a 100% baseline
conversion rate rendered "need ~-15 visitors per variant" on the dashboard.
Fixed by clamping `p2` to `[0, 1]` (it's a probability) and returning
`Infinity` explicitly when the clamp collapses `p1` and `p2` to the same
value (no finite sample size can detect a zero-width effect) — see the
comment above `minimumSampleSize()` in `ztest.ts`.

## Control plane, not data plane

The platform never computes anyone's bucket. It stores experiment config
and receives events — that's it. The actual assignment decision happens
inside `@cro-engine/sdk`, running in the *consuming app's* own process,
calling the same `assign()` from `@cro-engine/assignment-engine` this whole
project is built around. This mirrors how GrowthBook, Statsig, and
LaunchDarkly are actually architected: their servers don't decide your
variant, your SDK does, using a config payload their API handed you. See the
[platform repo's DESIGN.md](https://github.com/danish758/platform/blob/main/DESIGN.md)
for the full control-plane side of this split (multi-tenancy, auth,
exposure deduplication).

## Out of scope (packages/SDK-level)

- **Multi-framework integration helpers.** `@cro-engine/sdk` is
  framework-agnostic (fetch-only, no Next.js-specific APIs in its own
  code), but the only reference integration is Next.js
  (`acme-storefront`) — no dedicated React/Vue/Express helpers.
- **Bayesian statistics, CUPED, sequential testing, multi-armed bandits.**
  All real techniques used in mature experimentation platforms; none
  implemented here.
- **Revenue/continuous-metric statistical analysis.** `stats-engine`
  handles binary conversion-rate significance only — no t-test or
  non-parametric equivalent for a captured `value` field.

Platform-level non-goals (auth scope, deployment, billing, team accounts)
are documented in the platform repo's own DESIGN.md.

## Roadmap (packages/SDK-level)

- Wilson score confidence intervals instead of Wald, especially for
  low-traffic experiments.
- Bayesian analysis mode (posterior win probability) as an alternative to
  the frequentist z-test.
- CUPED (variance reduction using pre-experiment covariates) for faster
  significance on noisy metrics.
- Sequential testing / always-valid p-values, to make continuous monitoring
  statistically sound instead of just a fixed-horizon test.
- Multi-armed bandit allocation as an alternative to fixed-weight
  assignment.
- Revenue/continuous-metric significance testing (t-test or a
  non-parametric equivalent) using a captured `value` field.
- Official React/Vue/Express integration helpers around the core SDK.
