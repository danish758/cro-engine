import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { UID_COOKIE } from '@/lib/constants';
import { getExperiment } from '@/lib/experiments.config';
import { logExposure } from '@/lib/exposure';

// Runs on the Node.js runtime (Prisma + SQLite requires it — this is why
// middleware, which runs on the Edge Runtime, never calls this logic
// directly and instead the page Server Components call logExposure() via
// after(); this route exists as the documented HTTP entry point for
// exposure logging and is what a client-rendered variant would call).
export async function POST(request: Request) {
  const userId = (await cookies()).get(UID_COOKIE)?.value;
  if (!userId) {
    return NextResponse.json({ error: 'missing exp_uid cookie' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as
    | { experimentKey?: string; variantKey?: string }
    | null;
  if (!body?.experimentKey || !body?.variantKey) {
    return NextResponse.json({ error: 'experimentKey and variantKey are required' }, { status: 400 });
  }

  const config = getExperiment(body.experimentKey);
  const isKnownVariant = config?.variants.some((v) => v.key === body.variantKey);
  if (!config || !isKnownVariant) {
    return NextResponse.json({ error: 'unknown experimentKey or variantKey' }, { status: 400 });
  }

  await logExposure(userId, body.experimentKey, body.variantKey);

  return NextResponse.json({ ok: true });
}
