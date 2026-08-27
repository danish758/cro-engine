import type { ExperimentConfig } from '@cro-engine/assignment-engine';
import { NextResponse } from 'next/server';
import { getCurrentAccount, requireOwnedProject } from '@/lib/authz';
import { prisma } from '@/lib/db';
import { validateExperimentInput } from '@/lib/experiment-input';

const KEY_RE = /^[a-z0-9][a-z0-9-]*$/;

type CreateBody = {
  key?: string;
  name?: string;
  description?: string;
  conversionEvent?: string;
  status?: ExperimentConfig['status'];
  variants?: ExperimentConfig['variants'];
  targeting?: ExperimentConfig['targeting'];
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: projectId } = await params;
  const project = await requireOwnedProject(account.id, projectId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const body = (await request.json().catch(() => null)) as CreateBody | null;
  if (!body?.key || !KEY_RE.test(body.key)) {
    return NextResponse.json(
      { errors: ['key must be lowercase letters, numbers, and hyphens only'] },
      { status: 400 }
    );
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ errors: ['name is required'] }, { status: 400 });
  }

  const config: ExperimentConfig = {
    key: body.key,
    status: body.status ?? 'draft',
    variants: body.variants ?? [],
    targeting: body.targeting,
  };

  const errors = validateExperimentInput(config);
  if (errors.length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  const existing = await prisma.experiment.findUnique({
    where: { projectId_key: { projectId, key: config.key } },
  });
  if (existing) {
    return NextResponse.json({ errors: [`an experiment with key "${config.key}" already exists`] }, { status: 409 });
  }

  try {
    const row = await prisma.experiment.create({
      data: {
        projectId,
        key: config.key,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        conversionEvent: body.conversionEvent?.trim() || null,
        status: config.status,
        variantsJson: JSON.stringify(config.variants),
        targetingJson: config.targeting ? JSON.stringify(config.targeting) : null,
      },
    });
    return NextResponse.json({ experiment: row });
  } catch (err: unknown) {
    const isUniqueConstraintError = typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
    if (isUniqueConstraintError) {
      return NextResponse.json({ errors: [`an experiment with key "${config.key}" already exists`] }, { status: 409 });
    }
    throw err;
  }
}
