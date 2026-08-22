import { bucketKey, hashToBucket } from './hash.js';
import { matchesTargeting } from './targeting.js';
import type { AssignmentContext, AssignmentResult, ExperimentConfig } from './types.js';

/**
 * Assigns a user to a variant of an experiment, or excludes them, in a purely
 * deterministic way. No I/O, no `Date.now()`, no randomness beyond the
 * deterministic hash — given the same config and context, this always
 * returns the same result. Callers are responsible for validating `config`
 * ahead of time via `validateConfig()`; this function does not re-validate.
 */
export function assign(config: ExperimentConfig, ctx: AssignmentContext): AssignmentResult {
  if (config.status !== 'running') {
    return { status: 'excluded', reason: 'not-running' };
  }

  if (config.targeting && config.targeting.length > 0) {
    if (!matchesTargeting(config.targeting, ctx.attributes)) {
      return { status: 'excluded', reason: 'targeting-failed' };
    }
  }

  const bucket = hashToBucket(bucketKey(ctx.userId, config.key, config.seed));

  let cumulativeThreshold = 0;
  for (const variant of config.variants) {
    // Bucket space is [0, 9999] (10,000 slots); weights are 0-100, so each
    // weight point corresponds to 100 bucket slots.
    cumulativeThreshold += variant.weight * 100;
    if (bucket < cumulativeThreshold) {
      return { status: 'assigned', variantKey: variant.key, bucket };
    }
  }

  // Weights didn't sum to 100 (or config is otherwise malformed) and the
  // bucket fell outside every variant's range. Fail closed rather than
  // throwing, so a bad config degrades to "nobody gets assigned" instead of
  // crashing the request.
  return { status: 'excluded', reason: 'invalid-config' };
}
