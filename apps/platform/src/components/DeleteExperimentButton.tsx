'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DeleteExperimentButton({ projectId, experimentKey }: { projectId: string; experimentKey: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!confirm(`Delete "${experimentKey}"? Historical exposure/conversion data is kept, but this config is gone.`)) return;
        setBusy(true);
        await fetch(`/api/projects/${projectId}/experiments/${experimentKey}`, { method: 'DELETE' });
        router.push(`/projects/${projectId}`);
        router.refresh();
      }}
      className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60"
    >
      {busy ? 'Deleting…' : 'Delete experiment'}
    </button>
  );
}
