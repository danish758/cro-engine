import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { UID_COOKIE } from '@/lib/constants';
import { croEngine } from '@/lib/cro-engine';

/**
 * A small same-origin proxy, not a passthrough — the browser never talks to
 * the platform directly. If it did, the SDK's API key would have to live in
 * client-side JS, visible to anyone, letting them post arbitrary fake events
 * under this project's identity. Client code hits this route (same-origin,
 * no key involved); this route (server-side, holds the real key via
 * croEngine) forwards to the platform.
 */
export async function POST(request: Request) {
  const userId = (await cookies()).get(UID_COOKIE)?.value;
  if (!userId) {
    return NextResponse.json({ error: 'missing exp_uid cookie' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { eventName?: string; value?: number } | null;
  if (!body?.eventName || typeof body.eventName !== 'string') {
    return NextResponse.json({ error: 'eventName is required' }, { status: 400 });
  }

  croEngine.trackConversion(userId, body.eventName, typeof body.value === 'number' ? body.value : undefined);
  await croEngine.flush();

  return NextResponse.json({ ok: true });
}
