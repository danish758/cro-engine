import { describe, expect, it } from 'vitest';
import type { ExperimentConfig } from '@cro-engine/assignment-engine';
import { validateExperimentInput } from '@/lib/experiment-input';

const validConfig: ExperimentConfig = {
  key: 'homepage-cta',
  status: 'draft',
  variants: [
    { key: 'control', weight: 50 },
    { key: 'variant', weight: 50 },
  ],
};

describe('validateExperimentInput', () => {
  it('passes for a valid config with no targeting', () => {
    expect(validateExperimentInput(validConfig)).toEqual([]);
  });

  it('surfaces validateConfig()\'s errors (weights not summing to 100)', () => {
    const config: ExperimentConfig = {
      ...validConfig,
      variants: [
        { key: 'control', weight: 50 },
        { key: 'variant', weight: 40 },
      ],
    };
    const errors = validateExperimentInput(config);
    expect(errors.some((e) => e.includes('sum to 100'))).toBe(true);
  });

  it('accepts well-formed targeting rules of every operator', () => {
    const config: ExperimentConfig = {
      ...validConfig,
      targeting: [
        { attribute: 'country', operator: 'eq', value: 'US' },
        { attribute: 'plan', operator: 'in', value: ['pro', 'enterprise'] },
        { attribute: 'age', operator: 'gt', value: 18 },
      ],
    };
    expect(validateExperimentInput(config)).toEqual([]);
  });

  it('catches a gt/lt rule with a non-numeric value — a bug that would otherwise silently exclude everyone', () => {
    const config: ExperimentConfig = {
      ...validConfig,
      // Simulates a form bug sending a raw string instead of a coerced
      // number for a numeric operator.
      targeting: [{ attribute: 'age', operator: 'gt', value: '18' as unknown as number }],
    };
    const errors = validateExperimentInput(config);
    expect(errors.some((e) => e.includes('age') && e.includes('numeric'))).toBe(true);
  });

  it('catches an in/notIn rule with a plain string instead of an array', () => {
    const config: ExperimentConfig = {
      ...validConfig,
      targeting: [{ attribute: 'plan', operator: 'in', value: 'pro' as unknown as string[] }],
    };
    const errors = validateExperimentInput(config);
    expect(errors.some((e) => e.includes('plan') && e.includes('list'))).toBe(true);
  });

  it('catches an unknown targeting operator', () => {
    const config: ExperimentConfig = {
      ...validConfig,
      targeting: [{ attribute: 'country', operator: 'contains' as never, value: 'US' }],
    };
    const errors = validateExperimentInput(config);
    expect(errors.some((e) => e.includes('unknown targeting operator'))).toBe(true);
  });

  it('combines both validators\' errors when both the config and targeting are invalid', () => {
    const config: ExperimentConfig = {
      key: '',
      status: 'draft',
      variants: [{ key: 'only-one', weight: 100 }],
      targeting: [{ attribute: '', operator: 'eq', value: '' }],
    };
    const errors = validateExperimentInput(config);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});
