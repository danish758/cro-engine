import { prisma } from './db';

export const SESSION_COOKIE = 'cro_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function createSession(accountId: string): Promise<{ id: string; expiresAt: Date }> {
  const session = await prisma.session.create({
    data: { accountId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  return { id: session.id, expiresAt: session.expiresAt };
}

/**
 * Resolves a session cookie value to the Account it belongs to. Returns null
 * for a missing, expired, or unknown session id — all treated identically by
 * callers (redirect to login), which is what makes revocation real: deleting
 * the row (destroySession) has the exact same effect as natural expiry.
 */
export async function getAccountBySessionId(
  sessionId: string | undefined
): Promise<{ id: string; email: string } | null> {
  if (!sessionId) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { account: { select: { id: true, email: true } } },
  });

  if (!session || session.expiresAt < new Date()) return null;
  return session.account;
}

export async function destroySession(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}
