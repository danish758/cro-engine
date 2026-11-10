import { z } from 'zod';

export const environmentNameSchema = z.object({
  name: z.string().trim().min(1).max(50),
});