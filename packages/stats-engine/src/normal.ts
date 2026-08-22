/**
 * Standard normal distribution helpers, implemented by hand (no external
 * stats library) since this package must stay dependency-free.
 */

/**
 * Approximates the standard normal cumulative distribution function, P(Z <= z).
 *
 * Uses the Zelen & Severo (1964) rational approximation (equivalent to
 * Abramowitz & Stegun 26.2.17), which has a maximum absolute error of about
 * 7.5e-8 — far more precision than needed for p-values reported to 3-4
 * significant figures, and cheap to compute (no loops, no iteration).
 */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let prob =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) prob = 1 - prob;
  return prob;
}

// Coefficients for Peter Acklam's rational approximation of the inverse
// standard normal CDF (probit function), accurate to ~1.15e-9.
const A0 = -3.969683028665376e1;
const A1 = 2.209460984245205e2;
const A2 = -2.759285104469687e2;
const A3 = 1.383577518672690e2;
const A4 = -3.066479806614716e1;
const A5 = 2.506628277459239e0;

const B0 = -5.447609879822406e1;
const B1 = 1.615858368580409e2;
const B2 = -1.556989798598866e2;
const B3 = 6.680131188771972e1;
const B4 = -1.328068155288572e1;

const C0 = -7.784894002430293e-3;
const C1 = -3.223964580411365e-1;
const C2 = -2.400758277161838e0;
const C3 = -2.549732539343734e0;
const C4 = 4.374664141464968e0;
const C5 = 2.938163982698783e0;

const D0 = 7.784695709041462e-3;
const D1 = 3.224671290700398e-1;
const D2 = 2.445134137142996e0;
const D3 = 3.754408661907416e0;

const P_LOW = 0.02425;
const P_HIGH = 1 - P_LOW;

/**
 * Approximates the inverse standard normal CDF (the probit function): given
 * a probability p in (0, 1), returns z such that normalCdf(z) === p.
 *
 * Needed to convert a significance level (e.g. 0.05) or power (e.g. 0.8)
 * into the corresponding z-score for the sample size formula, without
 * hardcoding a lookup table that only covers "usual" values.
 */
export function inverseNormalCdf(p: number): number {
  if (p <= 0 || p >= 1) {
    throw new RangeError('inverseNormalCdf: p must be in the open interval (0, 1)');
  }

  if (p < P_LOW) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((C0 * q + C1) * q + C2) * q + C3) * q + C4) * q + C5) /
      ((((D0 * q + D1) * q + D2) * q + D3) * q + 1)
    );
  }

  if (p <= P_HIGH) {
    const q = p - 0.5;
    const r = q * q;
    return (
      ((((((A0 * r + A1) * r + A2) * r + A3) * r + A4) * r + A5) * q) /
      (((((B0 * r + B1) * r + B2) * r + B3) * r + B4) * r + 1)
    );
  }

  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(
    (((((C0 * q + C1) * q + C2) * q + C3) * q + C4) * q + C5) /
    ((((D0 * q + D1) * q + D2) * q + D3) * q + 1)
  );
}
