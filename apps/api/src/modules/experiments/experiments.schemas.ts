import { z } from 'zod';

const id = z.coerce.number().int().positive();

export const listExperimentsQuerySchema = z.object({
  environmentId: id.optional(),
  folderId: id.optional(),
});

export const createExperimentSchema = z.object({
  key: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be lowercase letters and numbers separated by single hyphens'),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).nullable().optional(),
  environmentId: id,
  folderId: id.nullable().optional(),
});

const variantInputSchema = z.object({
  key: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be lowercase letters and numbers separated by single hyphens'),
  name: z.string().trim().min(1).max(100),
  isControl: z.boolean(),
  weight: z.number().int().min(0).max(100),
});

export const replaceVariantsSchema = z
  .object({
    variants: z.array(variantInputSchema).min(2).max(10),
  })
  .superRefine(({ variants }, ctx) => {
    const controls = variants.filter((variant) => variant.isControl).length;
    if (controls !== 1) {
      ctx.addIssue({ code: 'custom', path: ['variants'], message: 'must have exactly one control' });
    }

    const total = variants.reduce((sum, variant) => sum + variant.weight, 0);
    if (total !== 100) {
      ctx.addIssue({ code: 'custom', path: ['variants'], message: `weights must sum to 100 (got ${total})` });
    }

    const keys = variants.map((variant) => variant.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: 'custom', path: ['variants'], message: 'variant keys must be unique' });
    }
  });

  const scalar = z.union([z.string().min(1).max(200), z.number(), z.boolean()]);

const targetingRuleSchema = z
  .object({
    attribute: z.string().regex(/^[a-z][a-z0-9_]*$/, 'must be a valid context key'),
    operator: z.enum(['eq', 'neq', 'in', 'notIn', 'gt', 'lt']),
    value: z.union([scalar, z.array(z.union([z.string().min(1).max(200), z.number()])).min(1).max(50)]),
  })
  .superRefine((rule, ctx) => {
    const isList = Array.isArray(rule.value);
    const needsList = rule.operator === 'in' || rule.operator === 'notIn';

    if (needsList && !isList) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: `"${rule.operator}" needs a list of values` });
    }
    if (!needsList && isList) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: `"${rule.operator}" needs a single value` });
    }
    if ((rule.operator === 'gt' || rule.operator === 'lt') && typeof rule.value !== 'number') {
      ctx.addIssue({ code: 'custom', path: ['value'], message: `"${rule.operator}" needs a number` });
    }
  });

export const replaceTargetingSchema = z.object({
  targeting: z.array(targetingRuleSchema).max(20),
});

export const updateExperimentSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    folderId: id.nullable().optional(),
  })
  .refine(
    (input) => input.name !== undefined || input.description !== undefined || input.folderId !== undefined,
    { message: 'send at least one of name, description, folderId' },
  );

  export const changeStatusSchema = z.object({
  status: z.enum(['running', 'stopped']),
});

export const duplicateExperimentSchema = z.object({
  key: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be lowercase letters and numbers separated by single hyphens'),
  name: z.string().trim().min(1).max(100).optional(),
  environmentId: id.optional(),
});