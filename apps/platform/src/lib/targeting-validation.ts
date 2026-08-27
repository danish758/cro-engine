import type { TargetingRule } from '@cro-engine/assignment-engine';

const KNOWN_OPERATORS = new Set(['eq', 'neq', 'in', 'notIn', 'gt', 'lt']);

/**
 * validateConfig() from @cro-engine/assignment-engine deliberately does not
 * validate targeting shape (confirmed by reading its source) — a malformed
 * rule doesn't error there, it just silently excludes everyone at
 * evaluation time per the engine's fail-closed design. That's correct
 * behavior for the engine, but wrong for an admin API accepting arbitrary
 * input: a typo should come back as a 400, not a silently-broken experiment.
 * This is the shape check the admin CRUD routes run in addition to
 * validateConfig().
 *
 * Matches the coercion rules the wizard's UI applies per operator: gt/lt
 * need a real number, in/notIn need a real non-empty array, eq/neq are
 * scoped to strings (the demo consumer app's attributes are all strings; see
 * DESIGN.md for why numeric eq/neq isn't offered by the admin form).
 */
export function validateTargeting(rules: TargetingRule[]): string[] {
  const errors: string[] = [];

  for (const rule of rules) {
    if (!rule.attribute || rule.attribute.trim().length === 0) {
      errors.push('every targeting rule needs a non-empty attribute name');
      continue;
    }
    if (!KNOWN_OPERATORS.has(rule.operator)) {
      errors.push(`unknown targeting operator "${rule.operator}"`);
      continue;
    }
    if (rule.operator === 'gt' || rule.operator === 'lt') {
      if (typeof rule.value !== 'number' || !Number.isFinite(rule.value)) {
        errors.push(`"${rule.attribute}" (${rule.operator}) needs a numeric value`);
      }
    } else if (rule.operator === 'in' || rule.operator === 'notIn') {
      if (!Array.isArray(rule.value) || rule.value.length === 0) {
        errors.push(`"${rule.attribute}" (${rule.operator}) needs a non-empty list of values`);
      }
    } else if (typeof rule.value !== 'string' || rule.value.trim().length === 0) {
      errors.push(`"${rule.attribute}" (${rule.operator}) needs a non-empty string value`);
    }
  }

  return errors;
}
