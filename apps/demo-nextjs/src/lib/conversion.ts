import { prisma } from './db';

/**
 * Records a conversion event. A user can convert multiple times for the same
 * event (e.g. clicking "purchase" twice) — that's allowed and expected;
 * conversion *rate* is computed separately as unique converting users /
 * unique exposed users, never raw event count (see stats.ts). This function
 * just appends the row.
 */
export async function logConversion(userId: string, eventName: string, value?: number): Promise<void> {
  await prisma.conversion.create({
    data: { userId, eventName, value: value ?? null },
  });
}
