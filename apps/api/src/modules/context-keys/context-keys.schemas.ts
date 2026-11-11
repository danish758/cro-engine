import { z } from 'zod';

export const createContextKeySchema = z.object({
  key: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, 'must start with a lowercase letter and use only lowercase letters, numbers and underscores'),
  type: z.enum(['string', 'number', 'boolean']),
});