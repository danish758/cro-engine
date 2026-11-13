import { describe, expect, it } from 'vitest';
import { evaluateRule, matchesTargeting } from '../src/targeting.js';
import type { TargetingRule } from '../src/types.js';

describe('evaluateRule', () => {
  it('eq/neq: work with boolean values', () => {
    const isPro: TargetingRule = { attribute: 'is_pro', operator: 'eq', value: true };
    expect(evaluateRule(isPro, true)).toBe(true);
    expect(evaluateRule(isPro, false)).toBe(false);

    const notPro: TargetingRule = { attribute: 'is_pro', operator: 'neq', value: true };
    expect(evaluateRule(notPro, false)).toBe(true);
    expect(evaluateRule(notPro, true)).toBe(false);
  });

  it('eq: never treats a boolean as equal to its string or number form', () => {
    const rule: TargetingRule = { attribute: 'is_pro', operator: 'eq', value: true };
    expect(evaluateRule(rule, 'true')).toBe(false);
    expect(evaluateRule(rule, 1)).toBe(false);
  });

  it('in: matches numbers in the list', () => {
    const rule: TargetingRule = { attribute: 'tier', operator: 'in', value: [1, 2] };
    expect(evaluateRule(rule, 2)).toBe(true);
    expect(evaluateRule(rule, 3)).toBe(false);
  });

  it('gt/lt: never match booleans', () => {
    const gt: TargetingRule = { attribute: 'visits', operator: 'gt', value: 0 };
    expect(evaluateRule(gt, true)).toBe(false);
  });

  it('eq: matches equal values, rejects unequal', () => {
    const rule: TargetingRule = { attribute: 'country', operator: 'eq', value: 'US' };
    expect(evaluateRule(rule, 'US')).toBe(true);
    expect(evaluateRule(rule, 'CA')).toBe(false);
  });

  it('neq: matches unequal values, rejects equal', () => {
    const rule: TargetingRule = { attribute: 'country', operator: 'neq', value: 'US' };
    expect(evaluateRule(rule, 'CA')).toBe(true);
    expect(evaluateRule(rule, 'US')).toBe(false);
  });

  it('in: matches values present in the list, rejects absent ones', () => {
    const rule: TargetingRule = { attribute: 'plan', operator: 'in', value: ['pro', 'enterprise'] };
    expect(evaluateRule(rule, 'pro')).toBe(true);
    expect(evaluateRule(rule, 'free')).toBe(false);
  });

  it('notIn: matches values absent from the list, rejects present ones', () => {
    const rule: TargetingRule = { attribute: 'plan', operator: 'notIn', value: ['pro', 'enterprise'] };
    expect(evaluateRule(rule, 'free')).toBe(true);
    expect(evaluateRule(rule, 'pro')).toBe(false);
  });

  it('gt: matches values greater than the threshold, rejects lesser/equal', () => {
    const rule: TargetingRule = { attribute: 'age', operator: 'gt', value: 18 };
    expect(evaluateRule(rule, 21)).toBe(true);
    expect(evaluateRule(rule, 18)).toBe(false);
    expect(evaluateRule(rule, 10)).toBe(false);
  });

  it('lt: matches values less than the threshold, rejects greater/equal', () => {
    const rule: TargetingRule = { attribute: 'age', operator: 'lt', value: 18 };
    expect(evaluateRule(rule, 10)).toBe(true);
    expect(evaluateRule(rule, 18)).toBe(false);
    expect(evaluateRule(rule, 21)).toBe(false);
  });
});

describe('matchesTargeting', () => {
  it('returns true for empty/no rules regardless of attributes', () => {
    expect(matchesTargeting([], undefined)).toBe(true);
    expect(matchesTargeting([], { country: 'US' })).toBe(true);
  });

  it('fails closed: rules exist but no attributes were provided', () => {
    const rules: TargetingRule[] = [{ attribute: 'country', operator: 'eq', value: 'US' }];
    expect(matchesTargeting(rules, undefined)).toBe(false);
  });

  it('ANDs multiple rules — all must pass for a match', () => {
    const rules: TargetingRule[] = [
      { attribute: 'country', operator: 'eq', value: 'US' },
      { attribute: 'plan', operator: 'in', value: ['pro', 'enterprise'] },
    ];
    expect(matchesTargeting(rules, { country: 'US', plan: 'pro' })).toBe(true);
    expect(matchesTargeting(rules, { country: 'US', plan: 'free' })).toBe(false);
    expect(matchesTargeting(rules, { country: 'CA', plan: 'pro' })).toBe(false);
  });
});

describe('matchesTargeting with boolean attributes', () => {
  it('ANDs boolean rules with other rules', () => {
    const rules: TargetingRule[] = [
      { attribute: 'is_pro', operator: 'eq', value: true },
      { attribute: 'country', operator: 'eq', value: 'PK' },
    ];
    expect(matchesTargeting(rules, { is_pro: true, country: 'PK' })).toBe(true);
    expect(matchesTargeting(rules, { is_pro: false, country: 'PK' })).toBe(false);
  });
});
