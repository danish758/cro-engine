# @cro-engine/stats-engine

Statistical significance testing for conversion-rate (binary) A/B
experiments. Pure functions, zero dependencies — the normal distribution
math (CDF, inverse CDF) is implemented by hand rather than imported from a
stats library, so this stays trivially portable (Node, browser, edge).

## The z-test, in plain English

Say you ran an experiment: 1,000 people saw the control, 100 bought
something (10% conversion). 1,000 people saw the variant, 130 bought
something (13% conversion). Is that 3-point difference a real effect, or
could it just as easily have happened by chance with two coins that are
actually equally fair?

A **two-proportion z-test** answers that. It assumes, as a starting
hypothesis, that both groups actually have the *same* true conversion rate
(the "null hypothesis") — and asks: if that were true, how surprising would
it be to see a gap this large or larger, purely from random sampling noise?

Mechanically:
1. Pool both groups' conversions to estimate what that "same true rate"
   would have to be: `pooled = (conversions_c + conversions_v) / (visitors_c + visitors_v)`.
2. Compute the standard error of the *difference* between two proportions
   under that pooled rate: `SE = sqrt(pooled * (1 - pooled) * (1/n_c + 1/n_v))`.
3. Convert the observed gap into a z-score: `z = (rate_v - rate_c) / SE` — "how
   many standard errors apart are these two rates?"
4. Convert that z-score into a p-value via the standard normal CDF: the
   probability of seeing a gap this extreme (in either direction — this is a
   two-tailed test) if the null hypothesis were actually true.

If that p-value is below 0.05, we call the result **statistically
significant** — the observed gap would be unlikely enough under "no real
difference" that we reject that hypothesis and conclude the variant is
probably genuinely different (better or worse) than control.

This package also reports a 95% confidence interval per variant (a Wald
interval — see the caveat below) and a relative lift (`(variant - control) /
control`) so a "significant" result comes with a sense of magnitude, not just
a binary yes/no.

## Frequentist, not Bayesian

This is a **frequentist** significance test: p-values, a fixed 0.05
threshold, and confidence intervals with the usual frequentist
interpretation (if you repeated the experiment many times, 95% of such
intervals would contain the true rate — it is *not* "95% probability the
true rate is in this interval").

A Bayesian approach (reporting "probability variant B is better than
control" directly, incorporating priors, allowing continuous monitoring
without inflating false-positive rates) is a well-known alternative used by
some experimentation platforms. It is **not implemented here** — it's listed
as a roadmap item in the root [`DESIGN.md`](../../DESIGN.md). The frequentist
z-test was chosen for v1 because it's the industry-standard baseline (what
most teams expect from an A/B test report) and is simpler to implement
correctly from scratch without an external stats library.

## Known limitation: the Wald confidence interval

`analyzeExperiment()` reports each variant's 95% CI using the **Wald
interval**: `p_hat ± 1.96 * sqrt(p_hat * (1 - p_hat) / n)`. It's simple and
fast, but it's a known-poor approximation when `n` is small or `p_hat` is
close to 0 or 1 — it can even produce bounds that fall outside `[0, 1]`
(which this implementation clamps). For low-traffic experiments or very
low/high conversion rates, treat the reported interval as approximate. A
more robust choice (Wilson score interval) is a candidate future
improvement.

## API

```typescript
import { analyzeExperiment, minimumSampleSize } from '@cro-engine/stats-engine';

const results = analyzeExperiment(
  { variantKey: 'control', visitors: 1000, conversions: 100 },
  [{ variantKey: 'variant', visitors: 1000, conversions: 130 }]
);
// => [
//   { variantKey: 'control', conversionRate: 0.1, relativeLift: null, pValue: null, isSignificant: false, ... },
//   { variantKey: 'variant', conversionRate: 0.13, relativeLift: 0.3, pValue: 0.0355, isSignificant: true, ... },
// ]

const n = minimumSampleSize(0.1, 0.1); // baseline 10%, detect a 10% relative lift
// => visitors needed *per variant* to reliably detect that effect at 80% power
```

- `analyzeExperiment(control, variants) => SignificanceResult[]` — control result first, then one result per variant, each compared against control via a two-proportion z-test.
- `minimumSampleSize(baselineRate, minimumDetectableEffect, power = 0.8) => number` — sample size per variant, using a fixed 0.05 significance level. `minimumDetectableEffect` is **relative** (0.1 = detect a 10% relative lift over baseline), matching how most CRO tools express MDE.
- `normalCdf(z) => number` / `inverseNormalCdf(p) => number` — the underlying normal-distribution primitives, exported in case you need them directly.

See [`src/types.ts`](./src/types.ts) for full type definitions.

## Running tests

```bash
npm install
npm test
```

Tests include hand-verified z-test scenarios checked against manually
computed values, edge cases (zero visitors, zero conversions, identical
rates), and sanity checks on `minimumSampleSize` (smaller MDE and lower
baseline rate each require more samples).
