import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dbPath = fileURLToPath(new URL('./exposure-dedup-test.db', import.meta.url));
const appRoot = fileURLToPath(new URL('..', import.meta.url));

beforeAll(() => {
  if (existsSync(dbPath)) unlinkSync(dbPath);
  process.env.DATABASE_URL = `file:${dbPath}`;
  // Pushes the schema to a throwaway SQLite file dedicated to this test run
  // — never touches the dev database.
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: appRoot,
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    stdio: 'pipe',
  });
}, 30_000);

afterAll(async () => {
  const { prisma } = await import('@/lib/db');
  await prisma.$disconnect();
  if (existsSync(dbPath)) unlinkSync(dbPath);
});

describe('logExposure deduplication', () => {
  it('inserting the same (userId, experimentKey) twice yields exactly one row', async () => {
    const { logExposure } = await import('@/lib/exposure');
    const { prisma } = await import('@/lib/db');

    await logExposure('user-dedup-1', 'checkout-flow-v2', 'control');
    await logExposure('user-dedup-1', 'checkout-flow-v2', 'control');

    const rows = await prisma.exposure.findMany({
      where: { userId: 'user-dedup-1', experimentKey: 'checkout-flow-v2' },
    });
    expect(rows).toHaveLength(1);
  });

  it('does not overwrite the originally-logged variant on a duplicate call', async () => {
    const { logExposure } = await import('@/lib/exposure');
    const { prisma } = await import('@/lib/db');

    await logExposure('user-dedup-2', 'pricing-cta-copy', 'control');
    // Simulates a bug/race that would try to log a different variant for the
    // same user+experiment — the dedup check must win, keeping the first
    // logged assignment authoritative.
    await logExposure('user-dedup-2', 'pricing-cta-copy', 'variant');

    const rows = await prisma.exposure.findMany({
      where: { userId: 'user-dedup-2', experimentKey: 'pricing-cta-copy' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.variantKey).toBe('control');
  });

  it('different users each get their own exposure row for the same experiment', async () => {
    const { logExposure } = await import('@/lib/exposure');
    const { prisma } = await import('@/lib/db');

    await logExposure('user-dedup-3', 'checkout-flow-v2', 'variant');
    await logExposure('user-dedup-4', 'checkout-flow-v2', 'variant');

    const rows = await prisma.exposure.findMany({
      where: { experimentKey: 'checkout-flow-v2', userId: { in: ['user-dedup-3', 'user-dedup-4'] } },
    });
    expect(rows).toHaveLength(2);
  });
});
