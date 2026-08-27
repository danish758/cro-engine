import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { createSession, SESSION_COOKIE } from '@/lib/session';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const account = await prisma.account.findUnique({ where: { email } });
  // Same error for "no such account" and "wrong password" — don't leak
  // which one it was.
  if (!account || !(await verifyPassword(password, account.passwordHash))) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const session = await createSession(account.id);
  (await cookies()).set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: 'lax',
    expires: session.expiresAt,
  });

  return NextResponse.json({ ok: true });
}
