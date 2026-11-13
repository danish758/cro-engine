import type { z } from 'zod';
import { AppError } from './errors.ts';
import { HttpStatus } from './http-status.ts';

export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body);

  if (!result.success) {
    throw new AppError(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_ERROR',
      'Invalid request body',
      result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  return result.data;
}

export function parseQuery<S extends z.ZodType>(schema: S, query: unknown): z.infer<S> {
  const result = schema.safeParse(query);

  if (!result.success) {
    throw new AppError(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_ERROR',
      'Invalid query parameters',
      result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  return result.data;
}