import argon2 from 'argon2';
import { pool, withTransaction } from '../../db.ts';
import { AppError } from '../../lib/errors.ts';
import { HttpStatus } from '../../lib/http-status.ts';
import { createSession } from './session.ts';
import type { LoginInput, SignupInput } from './auth.schemas.ts';
import { randomBytes } from 'node:crypto';
import { hashToken } from './session.ts';
import { isUniqueViolation } from '../../lib/db-errors.ts';

export async function signup(input: SignupInput) {
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

  try {
    return await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, email`,
        [input.name, input.email, passwordHash],
      );
      const user = rows[0];
      const token = await createSession(client, user.id);
      return { user, token };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(HttpStatus.CONFLICT, 'EMAIL_TAKEN', 'An account with this email already exists');
    }
    throw error;
  }
}

// A hash of a random value, made once at startup. Used only to spend
// the same time when the email doesn't exist.
const DUMMY_HASH = await argon2.hash(randomBytes(16).toString('hex'), { type: argon2.argon2id });

export async function login(input: LoginInput) {
  const { rows } = await pool.query(
    'SELECT id, name, email, password_hash FROM users WHERE email = $1',
    [input.email],
  );
  const user = rows[0];

  // Always run verify, even with no user, so both paths take similar time
  const passwordOk = await argon2.verify(user?.password_hash ?? DUMMY_HASH, input.password);

  if (!user || !passwordOk) {
    throw new AppError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Wrong email or password');
  }

  const token = await createSession(pool, user.id);
  return { user: { id: user.id, name: user.name, email: user.email }, token };
}

export async function logout(token: string) {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}