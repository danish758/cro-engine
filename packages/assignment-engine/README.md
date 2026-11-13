# @cro-engine/assignment-engine

Deterministic bucketing, targeting, and variant assignment for server-side A/B
experiments. Pure functions, zero dependencies, no Node-only APIs — runs
identically in Node.js, browsers, and edge runtimes (Vercel Edge, Cloudflare
Workers, etc.).

## What this is (and isn't)

This is a **bucketing and targeting engine**, not a full experimentation
platform. It answers exactly one question: *given an experiment config and a
user, which variant do they see (or are they excluded)?*

It does **not** do:
- experiment storage/config management (bring your own — JSON file, database, feature-flag service)
- exposure/conversion logging
- statistics or significance testing (see [`@cro-engine/stats-engine`](../stats-engine))
- a UI, an API, or a SDK client — this is the assignment logic underneath one

Think of it as the deterministic core you'd find inside GrowthBook, Statsig,
or PostHog Experiments, extracted and reimplemented from scratch.

## Quickstart

```bash
npm install @cro-engine/assignment-engine
```

```typescript
import { assign, validateConfig, type ExperimentConfig } from '@cro-engine/assignment-engine';

const config: ExperimentConfig = {
  key: 'checkout-flow-v2',
  status: 'running',
  variants: [
    { key: 'control', weight: 50 },
    { key: 'variant', weight: 50 },
  ],
  targeting: [{ attribute: 'country', operator: 'eq', value: 'US' }],
};

// Validate once, e.g. at deploy time — not on every request.
const errors = validateConfig(config);
if (errors.length > 0) throw new Error(`Invalid experiment config: ${errors.join(', ')}`);

const result = assign(config, {
  userId: 'user-1234', // stable, long-lived id — e.g. a persistent cookie value
  attributes: { country: 'US' },
});

if (result.status === 'assigned') {
  console.log(`User sees variant: ${result.variantKey}`);
} else {
  console.log(`User excluded: ${result.reason}`);
}
```

## Why FNV-1a

Bucketing needs a hash function that's fast, dependency-free (no Node
`crypto`, since this must run on the Edge Runtime and in browsers), and
uniformly distributes short strings — it does **not** need cryptographic
properties like preimage resistance, since nobody is trying to forge a
bucket assignment as an attack vector. FNV-1a fits exactly that profile: it's
about six lines of pure integer arithmetic and has no external dependency
footprint at all. Plain FNV-1a's avalanche is weak in its most-recently-mixed
bits though — since bucket keys share a common `:${seed}` suffix across
experiments, that weakness measurably correlated a user's bucket across
experiments sharing a seed. `hashToBucket()` runs a small MurmurHash3-style
finalizer (shift/multiply/shift) over the FNV-1a output before bucketing to
fix that; see the comment above `avalanche()` in `src/hash.ts` for the full
explanation and the test that catches a regression. A cryptographic hash (SHA-256) would work correctness-wise
but is needless overhead; a general-purpose non-crypto hash (MurmurHash,
xxHash) would also work but pulls in a dependency for no real benefit over
FNV-1a at this scale.

## Why hash on `userId + experimentKey`, never `userId` alone

The bucketing key (see `bucketKey()` in `src/hash.ts`) combines the user id,
the experiment key, and an optional seed:

```typescript
bucketKey(userId, experimentKey, seed) // => `${userId}:${experimentKey}:${seed ?? 0}`
```

If you hashed on `userId` alone, every experiment would place a given user
into the *same relative position* in the bucket space. Concretely: suppose
`hash('user-42') % 10000 === 500` (the 5th percentile). If bucketing were
based on userId alone, `user-42` would land in the bottom 5% of *every*
experiment's bucket space, forever. Now imagine two unrelated experiments
both happen to be running at once, and being in the "bottom 5%" correlates
with some other trait — a new-vs-returning-user skew in signup timing, say.
That correlation silently leaks into every experiment's results, because the
same subpopulation always gets the same relative treatment. You'd have no
way to tell that from the data — it would just look like noisy or biased
results with no traceable cause.

By hashing `userId + experimentKey` together, `user-42`'s bucket in
`checkout-flow-v2` is statistically independent of their bucket in
`pricing-cta-copy`. Each experiment gets its own effectively-random
partition of the user base. This is verified directly in
[`test/hash.test.ts`](./test/hash.test.ts) with a chi-squared independence
check across two experiment keys for the same set of users.

## Why targeting fails closed

`matchesTargeting()` returns `false` (excluded) when targeting rules are
defined but no `attributes` were supplied at all — it does not default to
"let them in." The alternative (failing open) would silently enroll
untargeted users into a targeted experiment whenever attribute data happens
to be missing (a client that forgot to pass attributes, a race during
context hydration, etc.). That's a correctness bug with no visible error: the
experiment's control/treatment populations get polluted with users who
should never have been eligible, and the corruption is invisible until
someone notices the results don't make sense. Excluding by default is the
safe failure mode — worst case you undercount eligible users, which is
recoverable; you never contaminate the populations you're trying to compare.

## API

- `assign(config, ctx) => AssignmentResult` — the main entry point.
- `hashToBucket(input: string) => number` — FNV-1a hash into `[0, 9999]`.
- `bucketKey(userId, experimentKey, seed?) => string` — builds the string that gets hashed.
- `matchesTargeting(rules, attributes?) => boolean` — evaluates AND'd targeting rules.
- `evaluateRule(rule, actual) => boolean` — evaluates a single rule (`eq`, `neq`, `in`, `notIn`, `gt`, `lt`).

Attribute values can be strings, numbers or booleans. Comparisons are strict, so `true` never matches `"true"` or `1`. `gt`/`lt` only match numbers, and `in`/`notIn` lists hold strings or numbers.
- `validateConfig(config) => string[]` — structural validation; run at config load/deploy time, not per-request.

See [`src/types.ts`](./src/types.ts) for the full type definitions.

## Running tests

```bash
npm install
npm test
```

Tests cover hash stability and distribution (100k synthetic users within
~1% of an expected 50/50 split), cross-experiment independence (chi-squared
test), determinism, seed-based re-randomization, weighted splits, every
targeting operator, fail-closed behavior, and every validation rule.
