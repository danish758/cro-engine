import type { RequestHandler } from 'express';
import { pool } from '../db.ts';
import { AppError } from '../lib/errors.ts';
import { HttpStatus } from '../lib/http-status.ts';
import { SESSION_COOKIE, hashToken } from '../modules/auth/session.ts';

export const requireAuth: RequestHandler = async (req, res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];

  if (typeof token !== 'string' || token.length === 0) {
    throw new AppError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Not logged in');
  }

  const { rows } = await pool.query(
    `SELECT users.id, users.email, users.name
     FROM users
     JOIN sessions ON users.id = sessions.user_id
     WHERE sessions.token_hash = $1 AND sessions.expires_at > now()`,
    [hashToken(token)],
  );

  const user = rows[0];
  if (!user) {
    throw new AppError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Not logged in');
  }

  req.user = user;
  next();
};