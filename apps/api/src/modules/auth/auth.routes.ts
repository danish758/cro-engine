import { Router } from 'express';
import { HttpStatus } from '../../lib/http-status.ts';
import { parseBody } from '../../lib/validate.ts';
import { signupSchema, loginSchema } from './auth.schemas.ts';
import { signup, login, logout } from './auth.service.ts';
import { SESSION_COOKIE, sessionCookieOptions } from './session.ts';
import { requireAuth } from '../../middleware/require-auth.ts';

export const authRouter = Router();

authRouter.post('/signup', async (req, res) => {
  const input = parseBody(signupSchema, req.body);
  const { user, token } = await signup(input);

  res.cookie(SESSION_COOKIE, token, sessionCookieOptions);
  res.status(HttpStatus.CREATED).json({ user });
});

authRouter.post('/login', async (req, res) => {
  const input = parseBody(loginSchema, req.body);
  const { user, token } = await login(input);

  res.cookie(SESSION_COOKIE, token, sessionCookieOptions);
  res.status(HttpStatus.OK).json({ user });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRouter.post('/logout', async (req, res) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];

  if (typeof token === 'string' && token.length > 0) {
    await logout(token);
  }

  res.clearCookie(SESSION_COOKIE, sessionCookieOptions);
  res.status(HttpStatus.NO_CONTENT).end();
});