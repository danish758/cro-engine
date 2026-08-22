import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { UID_COOKIE } from '@/lib/constants';
import { logConversion } from '@/lib/conversion';

// Runs on the Node.js runtime (the default for route handlers), which is
// required for Prisma + SQLite.
export async function POST(request: Request) {
  const userId = (await cookies()).get(UID_COOKIE)?.value;
  if (!userId) {
    // No stable id yet means this request never went through middleware on
    // an experiment route — there's nothing to attribute the conversion to.
    return NextResponse.json({ error: 'missing exp_uid cookie' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { eventName?: string; value?: number } | null;
  if (!body?.eventName || typeof body.eventName !== 'string') {
    return NextResponse.json({ error: 'eventName is required' }, { status: 400 });
  }

  await logConversion(userId, body.eventName, typeof body.value === 'number' ? body.value : undefined);

  return NextResponse.json({ ok: true });
}
