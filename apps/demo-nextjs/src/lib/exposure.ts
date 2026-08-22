import { prisma } from './db';

/**
 * Logs an experiment exposure, deduplicated per (userId, experimentKey).
 *
 * Naively inserting an exposure row on every request that touches an
 * experiment would massively inflate the visitor count relative to real
 * unique exposures — e.g. a user who reloads /pricing ten times would count
 * as ten "visitors" instead of one, silently deflating the apparent
 * conversion rate (conversions / visitors) and corrupting every stat
 * computed from it. So we check for an existing row first and skip the
 * insert if one is already there.
 *
 * The (userId, experimentKey) unique index in the Prisma schema is a
 * defense-in-depth backstop for the race where two concurrent requests from
 * a brand-new user both pass the `findUnique` check before either has
 * inserted — the second `create` in that race fails on the unique
 * constraint, which we swallow (it means someone else's request already
 * logged this exposure, which is exactly the outcome we want).
 */
export async function logExposure(
  userId: string,
  experimentKey: string,
  variantKey: string
): Promise<void> {
  const existing = await prisma.exposure.findUnique({
    where: { userId_experimentKey: { userId, experimentKey } },
  });
  if (existing) return;

  try {
    await prisma.exposure.create({
      data: { userId, experimentKey, variantKey },
    });
  } catch (err: unknown) {
    const isUniqueConstraintError =
      typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
    if (!isUniqueConstraintError) throw err;
  }
}
