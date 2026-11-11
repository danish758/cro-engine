export type VariantWeight = {
  key: string; // e.g. 'control' | 'variant-a'
  weight: number; // 0-100, all variants in an experiment must sum to 100
};

export type TargetingOperator = 'eq' | 'neq' | 'in' | 'notIn' | 'gt' | 'lt';

/** A single attribute value a user can have. */
export type AttributeValue = string | number | boolean;

export type TargetingRule = {
  attribute: string;
  operator: TargetingOperator;
  // Single value for eq/neq/gt/lt (gt/lt: numbers only), list for in/notIn.
  // Lists hold strings or numbers; a list of booleans would be pointless.
  value: AttributeValue | (string | number)[];
};

export type ExperimentStatus = 'draft' | 'running' | 'stopped';

export type ExperimentConfig = {
  key: string; // unique, stable — used directly in the bucketing hash
  status: ExperimentStatus;
  variants: VariantWeight[];
  targeting?: TargetingRule[]; // AND'd together; omitted/empty = everyone eligible
  seed?: number; // bump to force re-randomization without renaming the experiment
};

export type AssignmentContext = {
  userId: string; // stable per-user id, e.g. long-lived cookie value
  attributes?: Record<string, AttributeValue>;
};

export type ExclusionReason = 'not-running' | 'targeting-failed' | 'invalid-config';

export type AssignmentResult =
  | { status: 'assigned'; variantKey: string; bucket: number }
  | { status: 'excluded'; reason: ExclusionReason };
