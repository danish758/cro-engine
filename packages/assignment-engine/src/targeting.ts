import type { AttributeValue, TargetingOperator, TargetingRule } from './types.js';

/**
 * Evaluates a single targeting rule against an actual attribute value.
 * Uses a switch with an exhaustiveness check so that adding a new
 * TargetingOperator without adding a matching case here fails at compile time.
 */
export function evaluateRule(rule: TargetingRule, actual: unknown): boolean {
  const operator: TargetingOperator = rule.operator;

  switch (operator) {
    case 'eq':
      return actual === rule.value;
    case 'neq':
      return actual !== rule.value;
    case 'in':
      return Array.isArray(rule.value) && (rule.value as unknown[]).includes(actual);
    case 'notIn':
      return Array.isArray(rule.value) && !(rule.value as unknown[]).includes(actual);
    case 'gt':
      return typeof actual === 'number' && typeof rule.value === 'number' && actual > rule.value;
    case 'lt':
      return typeof actual === 'number' && typeof rule.value === 'number' && actual < rule.value;
    default: {
      const _exhaustive: never = operator;
      return _exhaustive;
    }
  }
}

/**
 * Evaluates a set of targeting rules (AND'd together) against a user's
 * attributes.
 *
 * Fails closed: if rules are defined but no attributes were provided at all,
 * the result is `false` (excluded) rather than `true`. The alternative —
 * treating "no attributes" as "rules don't apply, let them in" — would
 * silently include untargeted users in a targeted experiment. That's a
 * correctness bug: it pollutes the treatment/control populations with users
 * who were never supposed to be eligible, and it fails silently (no error,
 * just wrong data) which makes it especially dangerous for experiment
 * validity. Excluding by default is the safe failure mode.
 */
export function matchesTargeting(
  rules: TargetingRule[],
  attributes?: Record<string, AttributeValue>
): boolean {
  if (rules.length === 0) return true;
  if (!attributes) return false;

  return rules.every((rule) => evaluateRule(rule, attributes[rule.attribute]));
}
