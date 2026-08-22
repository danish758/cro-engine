import { describe, expect, it } from 'vitest';
import { assign } from '../src/assign.js';
import type { ExperimentConfig } from '../src/types.js';

const baseConfig: ExperimentConfig = {
  key: 'checkout-flow-v2',
  status: 'running',
  variants: [
    { key: 'control', weight: 50 },
    { key: 'variant', weight: 50 },
  ],
};

describe('assign', () => {
  it('excludes with not-running for draft status', () => {
    const result = assign({ ...baseConfig, status: 'draft' }, { userId: 'user-1' });
    expect(result).toEqual({ status: 'excluded', reason: 'not-running' });
  });

  it('excludes with not-running for stopped status', () => {
    const result = assign({ ...baseConfig, status: 'stopped' }, { userId: 'user-1' });
    expect(result).toEqual({ status: 'excluded', reason: 'not-running' });
  });

  it('excludes with targeting-failed when targeting rules do not match', () => {
    const config: ExperimentConfig = {
      ...baseConfig,
      targeting: [{ attribute: 'country', operator: 'eq', value: 'US' }],
    };
    const result = assign(config, { userId: 'user-1', attributes: { country: 'CA' } });
    expect(result).toEqual({ status: 'excluded', reason: 'targeting-failed' });
  });

  it('assigns a variant when running and no targeting is set', () => {
    const result = assign(baseConfig, { userId: 'user-1' });
    expect(result.status).toBe('assigned');
    if (result.status === 'assigned') {
      expect(['control', 'variant']).toContain(result.variantKey);
    }
  });

  it('assigns a variant when running and targeting passes', () => {
    const config: ExperimentConfig = {
      ...baseConfig,
      targeting: [{ attribute: 'country', operator: 'eq', value: 'US' }],
    };
    const result = assign(config, { userId: 'user-1', attributes: { country: 'US' } });
    expect(result.status).toBe('assigned');
  });

  it('is deterministic — same userId + config returns the identical result every time', () => {
    const first = assign(baseConfig, { userId: 'user-42' });
    const second = assign(baseConfig, { userId: 'user-42' });
    expect(first).toEqual(second);
  });

  it('produces different assignments for different seeds (re-randomization)', () => {
    const results = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const result = assign({ ...baseConfig, seed }, { userId: 'user-1' });
      if (result.status === 'assigned') {
        results.add(`${seed}:${result.bucket}`);
      }
    }
    // Buckets should vary across seeds — not all 20 seeds should produce the
    // exact same bucket for the same user.
    const buckets = new Set(
      [...results].map((entry) => entry.split(':')[1])
    );
    expect(buckets.size).toBeGreaterThan(1);
  });

  it('splits ~80/20 across 10,000 synthetic users for an 80/20 weighted config', () => {
    const config: ExperimentConfig = {
      key: 'weighted-experiment',
      status: 'running',
      variants: [
        { key: 'control', weight: 80 },
        { key: 'variant', weight: 20 },
      ],
    };

    let controlCount = 0;
    let variantCount = 0;
    const total = 10_000;

    for (let i = 0; i < total; i++) {
      const result = assign(config, { userId: `user-${i}` });
      if (result.status === 'assigned') {
        if (result.variantKey === 'control') controlCount++;
        else if (result.variantKey === 'variant') variantCount++;
      }
    }

    expect(controlCount + variantCount).toBe(total);
    const controlRatio = controlCount / total;
    const variantRatio = variantCount / total;
    expect(controlRatio).toBeGreaterThan(0.78);
    expect(controlRatio).toBeLessThan(0.82);
    expect(variantRatio).toBeGreaterThan(0.18);
    expect(variantRatio).toBeLessThan(0.22);
  });

  it('excludes with invalid-config when weights do not sum to 100', () => {
    const config: ExperimentConfig = {
      key: 'broken',
      status: 'running',
      variants: [
        { key: 'control', weight: 10 },
        { key: 'variant', weight: 10 },
      ],
    };
    // Try many users to find one that falls outside the covered [0, 2000) range.
    let foundInvalid = false;
    for (let i = 0; i < 200; i++) {
      const result = assign(config, { userId: `user-${i}` });
      if (result.status === 'excluded' && result.reason === 'invalid-config') {
        foundInvalid = true;
        break;
      }
    }
    expect(foundInvalid).toBe(true);
  });
});
