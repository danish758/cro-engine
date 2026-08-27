import { NextResponse } from 'next/server';
import { generateApiKey } from '@/lib/api-key';
import { getCurrentAccount, requireOwnedProject } from '@/lib/authz';
import { prisma } from '@/lib/db';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: projectId } = await params;
  const project = await requireOwnedProject(account.id, projectId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { label?: string };
  const { raw, hashed } = generateApiKey();

  await prisma.apiKey.create({
    data: { projectId, hashedKey: hashed, label: body.label || null },
  });

  // The raw key is returned exactly once, here — it is never retrievable
  // again (only its hash is persisted).
  return NextResponse.json({ key: raw });
}
