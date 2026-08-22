import { inverseNormalCdf, normalCdf } from './normal.js';
import type { SignificanceResult, VariantStats } from './types.js';

const Z_95 = 1.959963984540054; // inverseNormalCdf(0.975), hardcoded since it's used on every call

function conversionRate(stats: VariantStats): number {
  if (stats.visitors === 0) return 0;
  return stats.conversions / stats.visitors;
}

/**
 * 95% Wald confidence interval for a single proportion: p_hat ± z * SE.
 *
 * The Wald interval is simple and fast but is a known-poor approximation
 * when n is small or p_hat is near 0 or 1 (it can even produce bounds
 * outside [0, 1] in those cases, which we clamp). For this project's scope
 * (typical CRO sample sizes, rates well away from the extremes) it's an
 * acceptable tradeoff; a more robust choice for small samples would be the
 * Wilson score interval, noted as a future improvement in the package README.
 */
function waldInterval(stats: VariantStats): { lower: number; upper: number } {
  if (stats.visitors === 0) return { lower: 0, upper: 0 };
  const p = conversionRate(stats);
  const se = Math.sqrt((p * (1 - p)) / stats.visitors);
  return {
    lower: Math.max(0, p - Z_95 * se),
    upper: Math.min(1, p + Z_95 * se),
  };
}

/**
 * Two-proportion z-test comparing each variant against the control.
 *
 * For each non-control variant:
 *   - pooled proportion p = (x_control + x_variant) / (n_control + n_variant)
 *   - standard error (under H0: rates are equal) = sqrt(p*(1-p)*(1/n_c + 1/n_v))
 *   - z = (p_variant - p_control) / SE
 *   - two-tailed p-value = 2 * (1 - normalCdf(|z|))
 *
 * Handles zero-visitor / zero-conversion variants without throwing: a
 * variant with zero visitors has an undefined rate, so it's reported as a
 * 0% rate with no significance (p-value null-safe fallback of 1, not
 * significant) rather than producing NaN/Infinity.
 */
export function analyzeExperiment(
  control: VariantStats,
  variants: VariantStats[]
): SignificanceResult[] {
  const controlRate = conversionRate(control);
  const controlInterval = waldInterval(control);

  const controlResult: SignificanceResult = {
    variantKey: control.variantKey,
    conversionRate: controlRate,
    relativeLift: null,
    pValue: null,
    isSignificant: false,
    confidenceIntervalLower: controlInterval.lower,
    confidenceIntervalUpper: controlInterval.upper,
  };

  const variantResults = variants.map((variant): SignificanceResult => {
    const variantRate = conversionRate(variant);
    const interval = waldInterval(variant);

    const relativeLift = controlRate === 0 ? null : (variantRate - controlRate) / controlRate;

    let pValue: number | null;
    if (control.visitors === 0 || variant.visitors === 0) {
      // No data (or one-sided data) to compare — cannot claim significance.
      pValue = 1;
    } else {
      const pooled =
        (control.conversions + variant.conversions) / (control.visitors + variant.visitors);
      const se = Math.sqrt(pooled * (1 - pooled) * (1 / control.visitors + 1 / variant.visitors));

      if (se === 0) {
        // Pooled proportion is exactly 0 or 1 (e.g. identical rates with no
        // variance at all) — no meaningful z-score, treat as not significant.
        pValue = 1;
      } else {
        const z = (variantRate - controlRate) / se;
        pValue = 2 * (1 - normalCdf(Math.abs(z)));
      }
    }

    return {
      variantKey: variant.variantKey,
      conversionRate: variantRate,
      relativeLift,
      pValue,
      isSignificant: pValue !== null && pValue < 0.05,
      confidenceIntervalLower: interval.lower,
      confidenceIntervalUpper: interval.upper,
    };
  });

  return [controlResult, ...variantResults];
}

/**
 * Minimum sample size (per variant) for a two-proportion z-test.
 *
 * Standard formula:
 *   n = (z_(alpha/2) + z_beta)^2 * (p1*(1-p1) + p2*(1-p2)) / (p1 - p2)^2
 *
 * where p1 is the baseline conversion rate and p2 is the baseline rate
 * shifted by the minimum detectable effect (MDE), treated here as a
 * *relative* lift (e.g. mde = 0.10 means "detect a 10% relative increase
 * over baseline", so p2 = p1 * 1.10) — this matches how MDE is commonly
 * expressed in CRO tooling (GrowthBook, Optimizely, VWO all default to
 * relative MDE).
 *
 * Assumptions: two-sided test, equal sample size in both arms, normal
 * approximation to the binomial (valid for the sample sizes this formula
 * tends to produce for typical conversion rates).
 */
export function minimumSampleSize(
  baselineRate: number,
  minimumDetectableEffect: number,
  power = 0.8
): number {
  const significance = 0.05;
  const p1 = baselineRate;
  const p2 = baselineRate * (1 + minimumDetectableEffect);

  const zAlpha = inverseNormalCdf(1 - significance / 2);
  const zBeta = inverseNormalCdf(power);

  const numerator = Math.pow(zAlpha + zBeta, 2) * (p1 * (1 - p1) + p2 * (1 - p2));
  const denominator = Math.pow(p2 - p1, 2);

  return Math.ceil(numerator / denominator);
}
