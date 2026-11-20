import { rateLimit } from 'express-rate-limit';
import { AppError } from '../lib/errors.ts';
import { HttpStatus } from '../lib/http-status.ts';

// 10 attempts per 15 minutes per IP, for signup and login.
// Counts live in memory: fine for one API instance; several instances
// would each keep their own count (a shared store like Redis fixes that).
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new AppError(HttpStatus.TOO_MANY_REQUESTS, 'TOO_MANY_REQUESTS', 'Too many attempts, try again later'));
  },
});
