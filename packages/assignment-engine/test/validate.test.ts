import { describe, expect, it } from 'vitest';
import { validateConfig } from '../src/validate.js';
import type { ExperimentConfig } from '../src/types.js';

const validConfig: ExperimentConfig = {
  key: 'checkout-flow-v2',
  status: 'running',
  variants: [
    { key: 'control', weight: 50 },
    { key: 'variant', weight: 50 },
  ],
};

describe('validateConfig', () => {
  it('passes with zero errors for a valid config', () => {
    expect(validateConfig(validConfig)).toEqual([]);
  });

  it('reports weights that do not sum to 100', () => {
    const config: ExperimentConfig = {
      ...validConfig,
      variants: [
        { key: 'control', weight: 50 },
        { key: 'variant', weight: 40 },
      ],
    };
    const errors = validateConfig(config);
    expect(errors.some((e) => e.includes('sum to 100'))).toBe(true);
  });

  it('reports duplicate variant keys', () => {
    const config: ExperimentConfig = {
      ...validConfig,
      variants: [
        { key: 'control', weight: 50 },
        { key: 'control', weight: 50 },
      ],
    };
    const errors = validateConfig(config);
    expect(errors.some((e) => e.includes('duplicate'))).toBe(true);
  });

  it('reports fewer than 2 variants', () => {
    const config: ExperimentConfig = {
      ...validConfig,
      variants: [{ key: 'control', weight: 100 }],
    };
    const errors = validateConfig(config);
    expect(errors.some((e) => e.includes('at least 2 variants'))).toBe(true);
  });

  it('reports an empty key', () => {
    const config: ExperimentConfig = { ...validConfig, key: '' };
    const errors = validateConfig(config);
    expect(errors.some((e) => e.includes('non-empty'))).toBe(true);
  });

  it('reports an out-of-range weight', () => {
    const config: ExperimentConfig = {
      ...validConfig,
      variants: [
        { key: 'control', weight: 150 },
        { key: 'variant', weight: -50 },
      ],
    };
    const errors = validateConfig(config);
    expect(errors.some((e) => e.includes('control') && e.includes('between 0 and 100'))).toBe(true);
    expect(errors.some((e) => e.includes('variant') && e.includes('between 0 and 100'))).toBe(true);
  });
});
