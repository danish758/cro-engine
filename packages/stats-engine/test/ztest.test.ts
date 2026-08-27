import { describe, expect, it } from 'vitest';
import { analyzeExperiment, minimumSampleSize } from '../src/ztest.js';
import type { VariantStats } from '../src/types.js';

describe('analyzeExperiment', () => {
  it('matches a known hand-calculated z-test scenario', () => {
    // control: 1000 visitors, 100 conversions -> 10% rate
    // variant:  1000 visitors, 130 conversions -> 13% rate
    // pooled p = 230/2000 = 0.115
    // SE = sqrt(0.115*0.885*(1/1000+1/1000)) = sqrt(0.101775 * 0.002) = sqrt(0.00020355) ≈ 0.014267
    // z = (0.13 - 0.10) / 0.014267 ≈ 2.1029
    // two-tailed p ≈ 0.0355 (verified against a standard z-table / calculator)
    const control: VariantStats = { variantKey: 'control', visitors: 1000, conversions: 100 };
    const variant: VariantStats = { variantKey: 'variant', visitors: 1000, conversions: 130 };

    const [controlResult, variantResult] = analyzeExperiment(control, [variant]);

    expect(controlResult?.conversionRate).toBeCloseTo(0.1, 5);
    expect(variantResult?.conversionRate).toBeCloseTo(0.13, 5);
    expect(variantResult?.relativeLift).toBeCloseTo(0.3, 5);
    expect(variantResult?.pValue).toBeCloseTo(0.0355, 2);
    expect(variantResult?.isSignificant).toBe(true);
  });

  it('matches a known non-significant scenario', () => {
    // control: 500 visitors, 50 conversions -> 10%
    // variant: 500 visitors, 55 conversions -> 11%
    // pooled p = 105/1000 = 0.105
    // SE = sqrt(0.105*0.895*(1/500+1/500)) = sqrt(0.093975*0.004) = sqrt(0.0003759) ≈ 0.019388
    // z = (0.11-0.10)/0.019388 ≈ 0.5158 -> p ≈ 0.606 (not significant)
    const control: VariantStats = { variantKey: 'control', visitors: 500, conversions: 50 };
    const variant: VariantStats = { variantKey: 'variant', visitors: 500, conversions: 55 };

    const [, variantResult] = analyzeExperiment(control, [variant]);

    expect(variantResult?.pValue).toBeGreaterThan(0.5);
    expect(variantResult?.pValue).toBeLessThan(0.7);
    expect(variantResult?.isSignificant).toBe(false);
  });

  it('control result has null lift and null p-value', () => {
    const control: VariantStats = { variantKey: 'control', visitors: 1000, conversions: 100 };
    const variant: VariantStats = { variantKey: 'variant', visitors: 1000, conversions: 130 };
    const [controlResult] = analyzeExperiment(control, [variant]);

    expect(controlResult?.relativeLift).toBeNull();
    expect(controlResult?.pValue).toBeNull();
    expect(controlResult?.isSignificant).toBe(false);
  });

  it('handles zero visitors without throwing, returns non-significant', () => {
    const control: VariantStats = { variantKey: 'control', visitors: 0, conversions: 0 };
    const variant: VariantStats = { variantKey: 'variant', visitors: 0, conversions: 0 };

    expect(() => analyzeExperiment(control, [variant])).not.toThrow();
    const [controlResult, variantResult] = analyzeExperiment(control, [variant]);
    expect(controlResult?.conversionRate).toBe(0);
    expect(variantResult?.conversionRate).toBe(0);
    expect(variantResult?.isSignificant).toBe(false);
    expect(variantResult?.pValue).toBe(1);
  });

  it('handles zero conversions (nonzero visitors) without throwing', () => {
    const control: VariantStats = { variantKey: 'control', visitors: 1000, conversions: 0 };
    const variant: VariantStats = { variantKey: 'variant', visitors: 1000, conversions: 0 };

    expect(() => analyzeExperiment(control, [variant])).not.toThrow();
    const [, variantResult] = analyzeExperiment(control, [variant]);
    expect(variantResult?.conversionRate).toBe(0);
    expect(variantResult?.isSignificant).toBe(false);
  });

  it('identical rates produce a p-value near 1 and are not significant', () => {
    const control: VariantStats = { variantKey: 'control', visitors: 2000, conversions: 200 };
    const variant: VariantStats = { variantKey: 'variant', visitors: 2000, conversions: 200 };

    const [, variantResult] = analyzeExperiment(control, [variant]);
    expect(variantResult?.pValue).toBeCloseTo(1, 5);
    expect(variantResult?.isSignificant).toBe(false);
    expect(variantResult?.relativeLift).toBeCloseTo(0, 10);
  });

  it('confidence interval bounds stay within [0, 1] and bracket the rate', () => {
    const control: VariantStats = { variantKey: 'control', visitors: 50, conversions: 48 };
    const [controlResult] = analyzeExperiment(control, []);
    expect(controlResult?.confidenceIntervalLower).toBeGreaterThanOrEqual(0);
    expect(controlResult?.confidenceIntervalUpper).toBeLessThanOrEqual(1);
    expect(controlResult?.confidenceIntervalLower).toBeLessThanOrEqual(controlResult!.conversionRate);
    expect(controlResult?.confidenceIntervalUpper).toBeGreaterThanOrEqual(controlResult!.conversionRate);
  });
});

describe('minimumSampleSize', () => {
  it('requires a larger sample size for a smaller minimum detectable effect', () => {
    const nLargeMde = minimumSampleSize(0.1, 0.2);
    const nSmallMde = minimumSampleSize(0.1, 0.05);
    expect(nSmallMde).toBeGreaterThan(nLargeMde);
  });

  it('requires a larger sample size for a lower baseline rate (holding relative MDE fixed)', () => {
    const nLowBaseline = minimumSampleSize(0.02, 0.1);
    const nHighBaseline = minimumSampleSize(0.2, 0.1);
    expect(nLowBaseline).toBeGreaterThan(nHighBaseline);
  });

  it('requires a larger sample size for higher power', () => {
    const nLowPower = minimumSampleSize(0.1, 0.1, 0.8);
    const nHighPower = minimumSampleSize(0.1, 0.1, 0.95);
    expect(nHighPower).toBeGreaterThan(nLowPower);
  });

  it('returns a positive integer', () => {
    const n = minimumSampleSize(0.1, 0.1);
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThan(0);
  });

  it('never returns a negative or NaN result when baseline + MDE would push the shifted rate above 100%', () => {
    // baseline 100%, MDE 100% -> naive p2 = 1 * (1 + 1) = 2, an invalid
    // probability. This exact shape appeared live in the platform dashboard
    // (a single-visitor experiment with a 100% baseline rate).
    const n = minimumSampleSize(1, 1);
    expect(Number.isNaN(n)).toBe(false);
    expect(n).toBeGreaterThan(0);
  });

  it('returns Infinity when the baseline is already at the ceiling with no detectable gap', () => {
    const n = minimumSampleSize(1, 1);
    expect(n).toBe(Infinity);
  });
});
