import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDatabase, TEST_DATABASE_URL } from './setup.js';

beforeAll(() => {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  setupTestDatabase();
}, 30_000);

async function seedProjectWithApiKey() {
  const { prisma } = await import('@/lib/db');
  const { generateApiKey } = await import('@/lib/api-key');

  const account = await prisma.account.create({
    data: { email: `dedup-${crypto.randomUUID()}@example.com`, passwordHash: 'x' },
  });
  const project = await prisma.project.create({ data: { name: 'Test Project', accountId: account.id } });
  const { raw, hashed } = generateApiKey();
  await prisma.apiKey.create({ data: { projectId: project.id, hashedKey: hashed } });

  return { projectId: project.id, apiKey: raw };
}

function eventsRequest(apiKey: string, body: unknown): Request {
  return new Request('http://localhost/api/v1/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
}

afterAll(async () => {
  const { prisma } = await import('@/lib/db');
  await prisma.$disconnect();
});

describe('POST /api/v1/events — exposure deduplication', () => {
  it('inserting the same (projectId, userId, experimentKey) twice yields exactly one row', async () => {
    const { POST } = await import('@/app/api/v1/events/route');
    const { prisma } = await import('@/lib/db');
    const { projectId, apiKey } = await seedProjectWithApiKey();

    const payload = { exposures: [{ userId: 'user-1', experimentKey: 'exp-a', variantKey: 'control' }] };
    await POST(eventsRequest(apiKey, payload));
    await POST(eventsRequest(apiKey, payload));

    const rows = await prisma.exposure.findMany({ where: { projectId, userId: 'user-1', experimentKey: 'exp-a' } });
    expect(rows).toHaveLength(1);
  });

  it('rejects a request with an invalid API key', async () => {
    const { POST } = await import('@/app/api/v1/events/route');
    const response = await POST(eventsRequest('sk_not_a_real_key', { exposures: [] }));
    expect(response.status).toBe(401);
  });

  it('two different projects never see each other\'s exposures', async () => {
    const { POST } = await import('@/app/api/v1/events/route');
    const { prisma } = await import('@/lib/db');
    const projectA = await seedProjectWithApiKey();
    const projectB = await seedProjectWithApiKey();

    await POST(eventsRequest(projectA.apiKey, { exposures: [{ userId: 'shared-user', experimentKey: 'exp-x', variantKey: 'control' }] }));
    await POST(eventsRequest(projectB.apiKey, { exposures: [{ userId: 'shared-user', experimentKey: 'exp-x', variantKey: 'variant' }] }));

    const rowsA = await prisma.exposure.findMany({ where: { projectId: projectA.projectId, userId: 'shared-user', experimentKey: 'exp-x' } });
    const rowsB = await prisma.exposure.findMany({ where: { projectId: projectB.projectId, userId: 'shared-user', experimentKey: 'exp-x' } });

    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
    expect(rowsA[0]?.variantKey).toBe('control');
    expect(rowsB[0]?.variantKey).toBe('variant');
  });

  it('conversions are not deduplicated — a user can convert multiple times', async () => {
    const { POST } = await import('@/app/api/v1/events/route');
    const { prisma } = await import('@/lib/db');
    const { projectId, apiKey } = await seedProjectWithApiKey();

    const payload = { conversions: [{ userId: 'user-2', eventName: 'purchase_completed', value: 10 }] };
    await POST(eventsRequest(apiKey, payload));
    await POST(eventsRequest(apiKey, payload));

    const rows = await prisma.conversion.findMany({ where: { projectId, userId: 'user-2', eventName: 'purchase_completed' } });
    expect(rows).toHaveLength(2);
  });
});
