import type { RequestHandler } from 'express';
import { pool } from '../db.ts';
import { AppError } from '../lib/errors.ts';
import { HttpStatus } from '../lib/http-status.ts';

const invalidKey = () => new AppError(HttpStatus.UNAUTHORIZED, 'INVALID_API_KEY', 'Missing or invalid API key');

export const requireApiKey: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    throw invalidKey();
  }

  const key = header.slice('Bearer '.length).trim();

  const { rows: [found] } = await pool.query(
    'SELECT environment_id FROM api_keys WHERE key = $1 AND revoked_at IS NULL',
    [key],
  );

  if (!found) {
    throw invalidKey();
  }

  req.environmentId = found.environment_id;
  next();
};