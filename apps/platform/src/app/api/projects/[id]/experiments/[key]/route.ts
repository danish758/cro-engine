import type { ExperimentConfig } from '@cro-engine/assignment-engine';
import { NextResponse } from 'next/server';
import { getCurrentAccount, requireOwnedProject } from '@/lib/authz';
import { prisma } from '@/lib/db';
import { toConfig } from '@/lib/experiment-repo';
import { validateExperimentInput } from '@/lib/experiment-input';

type Params = { params: Promise<{ id: string; key: string }> };

type PatchBody = {
  name?: string;
  description?: string;
  status?: ExperimentConfig['status'];
  variants?: ExperimentConfig['variants'];
  targeting?: ExperimentConfig['targeting'];
  seed?: number;
  conversionEvent?: string;
};

export async function GET(_request: Request, { params }: Params) {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: projectId, key } = await params;
  const project = await requireOwnedProject(account.id, projectId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const row = await prisma.experiment.findUnique({ where: { projectId_key: { projectId, key } } });
  if (!row) return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });

  return NextResponse.json({ experiment: row });
}

export async function PATCH(request: Request, { params }: Params) {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: projectId, key } = await params;
  const project = await requireOwnedProject(account.id, projectId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const existingRow = await prisma.experiment.findUnique({ where: { projectId_key: { projectId, key } } });
  if (!existingRow) return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (!body) return NextResponse.json({ errors: ['request body must be valid JSON'] }, { status: 400 });

  const existingConfig = toConfig(existingRow);
  const mergedConfig: ExperimentConfig = {
    key,
    status: body.status ?? existingConfig.status,
    variants: body.variants ?? existingConfig.variants,
    targeting: body.targeting !== undefined ? body.targeting : existingConfig.targeting,
    seed: body.seed !== undefined ? body.seed : existingConfig.seed,
  };

  const errors = validateExperimentInput(mergedConfig);
  if (errors.length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  const row = await prisma.experiment.update({
    where: { projectId_key: { projectId, key } },
    data: {
      name: body.name?.trim() || existingRow.name,
      description: body.description !== undefined ? body.description.trim() || null : existingRow.description,
      conversionEvent:
        body.conversionEvent !== undefined ? body.conversionEvent.trim() || null : existingRow.conversionEvent,
      status: mergedConfig.status,
      variantsJson: JSON.stringify(mergedConfig.variants),
      targetingJson: mergedConfig.targeting ? JSON.stringify(mergedConfig.targeting) : null,
      seed: mergedConfig.seed ?? null,
    },
  });

  return NextResponse.json({ experiment: row });
}

export async function DELETE(_request: Request, { params }: Params) {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: projectId, key } = await params;
  const project = await requireOwnedProject(account.id, projectId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  // No cascade — Exposure/Conversion rows for this key are historical fact
  // and are left intact (they have no FK relation to Experiment, just
  // matching string columns; see schema.prisma).
  const result = await prisma.experiment.deleteMany({ where: { projectId, key } });
  if (result.count === 0) return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
