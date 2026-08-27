import { validateConfig, type ExperimentConfig } from '@cro-engine/assignment-engine';
import { validateTargeting } from './targeting-validation';

/**
 * The full validation pass the admin CRUD routes run before writing an
 * experiment: validateConfig() from @cro-engine/assignment-engine (key,
 * variants, weights) plus validateTargeting() (operator/value shape, which
 * validateConfig() deliberately does not cover — see targeting-validation.ts).
 * Pulled out as its own pure function, rather than inlined in the route
 * handlers, specifically so it's testable without a Next.js request context
 * (the routes themselves depend on cookies() via getCurrentAccount(), which
 * only works inside a real request lifecycle — this doesn't).
 */
export function validateExperimentInput(config: ExperimentConfig): string[] {
  return [...validateConfig(config), ...validateTargeting(config.targeting ?? [])];
}
