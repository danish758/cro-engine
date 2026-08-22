export { assign } from './assign.js';
export { hashToBucket, bucketKey } from './hash.js';
export { matchesTargeting, evaluateRule } from './targeting.js';
export { validateConfig } from './validate.js';
export type {
  VariantWeight,
  TargetingOperator,
  TargetingRule,
  ExperimentStatus,
  ExperimentConfig,
  AssignmentContext,
  ExclusionReason,
  AssignmentResult,
} from './types.js';
