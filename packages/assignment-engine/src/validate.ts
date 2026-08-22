import type { ExperimentConfig } from './types.js';

/**
 * Validates an experiment config's structural correctness. Intended to run
 * once at config load / deploy time (e.g. in a CI check or an admin API
 * before saving), NOT on every request — `assign()` assumes it has already
 * been called and does not re-validate for performance reasons.
 *
 * Returns an array of human-readable error strings. An empty array means the
 * config is valid.
 */
export function validateConfig(config: ExperimentConfig): string[] {
  const errors: string[] = [];

  if (!config.key || config.key.trim().length === 0) {
    errors.push('key must be a non-empty string');
  }

  if (config.variants.length < 2) {
    errors.push('must have at least 2 variants');
  }

  const seenKeys = new Set<string>();
  const duplicateKeys = new Set<string>();
  for (const variant of config.variants) {
    if (seenKeys.has(variant.key)) {
      duplicateKeys.add(variant.key);
    }
    seenKeys.add(variant.key);
  }
  if (duplicateKeys.size > 0) {
    errors.push(`duplicate variant keys: ${[...duplicateKeys].join(', ')}`);
  }

  for (const variant of config.variants) {
    if (variant.weight < 0 || variant.weight > 100) {
      errors.push(`variant "${variant.key}" has weight ${variant.weight}, must be between 0 and 100`);
    }
  }

  const totalWeight = config.variants.reduce((sum, v) => sum + v.weight, 0);
  if (totalWeight !== 100) {
    errors.push(`variant weights must sum to 100, got ${totalWeight}`);
  }

  return errors;
}
