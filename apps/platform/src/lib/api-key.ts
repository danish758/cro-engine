import { createHash, randomBytes } from 'node:crypto';
import { prisma } from './db';

/**
 * API keys are already high-entropy random tokens (unlike user passwords),
 * so a plain fast hash (sha256) is the right tool here, not scrypt — scrypt
 * is deliberately slow to defend against guessing a low-entropy secret;
 * there's nothing to guess in a 192-bit random token, so the extra cost
 * would only slow down every single request authenticating against the
 * public API for no security benefit.
 */
function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Generates a new API key. The raw value is returned once, for the caller
 * to show the user immediately — only its hash is ever persisted, so it's
 * unrecoverable if lost (same UX as GitHub/Stripe tokens).
 */
export function generateApiKey(): { raw: string; hashed: string } {
  const raw = `sk_${randomBytes(24).toString('hex')}`;
  return { raw, hashed: hashApiKey(raw) };
}

export async function getProjectIdForApiKey(rawKey: string): Promise<string | null> {
  const hashed = hashApiKey(rawKey);
  const apiKey = await prisma.apiKey.findUnique({ where: { hashedKey: hashed } });
  if (!apiKey || apiKey.revokedAt) return null;
  return apiKey.projectId;
}

/**
 * Resolves the projectId for a /api/v1/* request from its
 * `Authorization: Bearer <key>` header. Returns null for anything that
 * doesn't authenticate — callers should respond 401.
 */
export async function requireApiKeyProject(request: Request): Promise<string | null> {
  const auth = request.headers.get('authorization');
  const rawKey = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
  if (!rawKey) return null;
  return getProjectIdForApiKey(rawKey);
}

export { hashApiKey };
