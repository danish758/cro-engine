import Link from 'next/link';
import { CreateProjectForm } from '@/components/CreateProjectForm';
import { LogoutButton } from '@/components/LogoutButton';
import { getCurrentAccount } from '@/lib/authz';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const account = await getCurrentAccount();
  // Middleware already gates this route; account is non-null in practice.
  // Guarded here too rather than asserting, in case a session expired
  // between the middleware check and this render.
  if (!account) return null;

  const projects = await prisma.project.findMany({
    where: { accountId: account.id },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { experiments: true, apiKeys: true } } },
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your projects</h1>
          <p className="mt-1 text-sm text-slate-600">{account.email}</p>
        </div>
        <LogoutButton />
      </div>

      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
        <CreateProjectForm />
      </div>

      <div className="mt-8 space-y-3">
        {projects.length === 0 && <p className="text-sm text-slate-500">No projects yet.</p>}
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="block rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
          >
            <div className="font-semibold">{project.name}</div>
            <div className="mt-1 text-sm text-slate-600">
              {project._count.experiments} experiment{project._count.experiments === 1 ? '' : 's'} ·{' '}
              {project._count.apiKeys} API key{project._count.apiKeys === 1 ? '' : 's'}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
