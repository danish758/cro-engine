// AppError class and the central error-handling middleware.
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { HttpStatus } from './http-status.ts';

// An error we expect and want to show the client
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Runs when no route matched
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(HttpStatus.NOT_FOUND).json({
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
};

// Runs when any route throws
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // Errors we threw on purpose: show them as they are
  if (err instanceof AppError) {
  res.status(err.status).json({
    error: { code: err.code, message: err.message, details: err.details },
  });
  return;
}

  // A request body that isn't valid JSON
  if (err.type === 'entity.parse.failed') {
    res.status(HttpStatus.BAD_REQUEST).json({
      error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' },
    });
    return;
  }

  // Anything else is a bug: log the details, tell the client nothing specific
  console.error(err);
  res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
  });
};