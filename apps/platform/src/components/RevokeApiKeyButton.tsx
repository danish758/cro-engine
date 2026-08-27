'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function RevokeApiKeyButton({ projectId, keyId }: { projectId: string; keyId: string }) {
  const router = useRouter();
  const [revoking, setRevoking] = useState(false);

  return (
    <button
      type="button"
      disabled={revoking}
      onClick={async () => {
        setRevoking(true);
        await fetch(`/api/projects/${projectId}/api-keys/${keyId}`, { method: 'DELETE' });
        router.refresh();
      }}
      className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-60"
    >
      {revoking ? 'Revoking…' : 'Revoke'}
    </button>
  );
}
