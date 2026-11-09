import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions } from 'express';
import type pg from 'pg';

export const SESSION_COOKIE = 'session';
const SESSION_DAYS = 7;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

type Queryable = pg.Pool | pg.PoolClient;

export async function createSession(db: Queryable, userId: number): Promise<string> {
  const token = randomBytes(32).toString('hex');

  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + make_interval(days => $3))`,
    [hashToken(token), userId, SESSION_DAYS],
  );

  return token;
}

export const sessionCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  path: '/',
};