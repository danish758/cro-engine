import { NextResponse } from 'next/server';
import { getCurrentAccount } from '@/lib/authz';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { name?: string } | null;
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const project = await prisma.project.create({ data: { name, accountId: account.id } });
  return NextResponse.json({ project });
}
