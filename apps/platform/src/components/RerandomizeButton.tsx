'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function RerandomizeButton({
  projectId,
  experimentKey,
  currentSeed,
}: {
  projectId: string;
  experimentKey: string;
  currentSeed: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!confirm('Re-randomize this experiment? Every user\'s sticky assignment will be recomputed.')) return;
        setBusy(true);
        await fetch(`/api/projects/${projectId}/experiments/${experimentKey}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seed: currentSeed + 1 }),
        });
        router.refresh();
        setBusy(false);
      }}
      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 disabled:opacity-60"
    >
      {busy ? 'Re-randomizing…' : 'Force re-randomize'}
    </button>
  );
}
