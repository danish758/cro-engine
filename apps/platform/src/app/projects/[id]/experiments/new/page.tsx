import { notFound } from 'next/navigation';
import { ExperimentWizard } from '@/components/ExperimentWizard';
import { getCurrentAccount, requireOwnedProject } from '@/lib/authz';

export default async function NewExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getCurrentAccount();
  if (!account) return null;

  const project = await requireOwnedProject(account.id, id);
  if (!project) notFound();

  return <ExperimentWizard projectId={id} mode="create" />;
}
