import { notFound } from 'next/navigation';
import { DeleteExperimentButton } from '@/components/DeleteExperimentButton';
import { ExperimentWizard, type ExperimentInitialData } from '@/components/ExperimentWizard';
import { RerandomizeButton } from '@/components/RerandomizeButton';
import { getCurrentAccount, requireOwnedProject } from '@/lib/authz';
import { toConfig } from '@/lib/experiment-repo';
import { prisma } from '@/lib/db';

function targetingValueToString(value: string | number | string[]): string {
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

export default async function EditExperimentPage({
  params,
}: {
  params: Promise<{ id: string; key: string }>;
}) {
  const { id, key } = await params;
  const account = await getCurrentAccount();
  if (!account) return null;

  const project = await requireOwnedProject(account.id, id);
  if (!project) notFound();

  const row = await prisma.experiment.findUnique({ where: { projectId_key: { projectId: id, key } } });
  if (!row) notFound();

  const config = toConfig(row);
  const initial: ExperimentInitialData = {
    key: row.key,
    name: row.name,
    description: row.description ?? '',
    conversionEvent: row.conversionEvent ?? '',
    status: config.status,
    variants: config.variants.map((v) => ({ id: crypto.randomUUID(), key: v.key, weight: v.weight })),
    targeting: (config.targeting ?? []).map((r) => ({
      id: crypto.randomUUID(),
      attribute: r.attribute,
      operator: r.operator,
      value: targetingValueToString(r.value),
    })),
  };

  return (
    <div>
      <div className="mx-auto flex max-w-2xl items-center justify-between px-6 pt-8">
        <div className="flex gap-2">
          <RerandomizeButton projectId={id} experimentKey={key} currentSeed={config.seed ?? 0} />
          <DeleteExperimentButton projectId={id} experimentKey={key} />
        </div>
      </div>
      <ExperimentWizard projectId={id} mode="edit" initial={initial} />
    </div>
  );
}
