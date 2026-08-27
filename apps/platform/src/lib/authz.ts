import { cookies } from 'next/headers';
import { prisma } from './db';
import { getAccountBySessionId, SESSION_COOKIE } from './session';

/**
 * Resolves the logged-in account from the session cookie. Routes/pages under
 * /projects and /api/projects are already gated by middleware — this
 * re-checks rather than trusting a forwarded header, so account identity for
 * an authorization-sensitive lookup never depends on trusting client-passed
 * state, only on this server-side cookie lookup.
 */
export async function getCurrentAccount(): Promise<{ id: string; email: string } | null> {
  const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
  return getAccountBySessionId(sessionId);
}

/**
 * The multi-tenancy ownership check: a project id alone is not enough to act
 * on it, it must also belong to the requesting account. Every project-scoped
 * route should route through this rather than a bare `findUnique(id)`.
 */
export async function requireOwnedProject(accountId: string, projectId: string) {
  return prisma.project.findFirst({ where: { id: projectId, accountId } });
}
