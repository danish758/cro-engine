import { hashToBucket, type ExperimentConfig } from '@cro-engine/assignment-engine';

/**
 * A short fingerprint of the parts of a config that should invalidate a
 * sticky assignment if they change: the variant list (keys + weights) and
 * the seed. Status is deliberately excluded — flipping status doesn't need
 * to re-randomize anyone, it's checked separately on every request.
 *
 * Bumping `seed` in the config changes this fingerprint, which is exactly
 * how "re-randomize without renaming the experiment" is meant to work: the
 * sticky cookie from the old version no longer matches, so the user gets
 * bucketed fresh under the new seed.
 */
export function configVersion(config: ExperimentConfig): string {
  const fingerprint = JSON.stringify({ variants: config.variants, seed: config.seed ?? 0 });
  return String(hashToBucket(fingerprint));
}
