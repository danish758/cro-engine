'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function CreateApiKeyForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/projects/${projectId}/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Failed to create API key');
      setSubmitting(false);
      return;
    }

    const body = (await res.json()) as { key: string };
    setCreatedKey(body.key);
    setLabel('');
    setSubmitting(false);
    router.refresh();
  }

  if (createdKey) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
        <p className="text-sm font-medium text-amber-900">
          Copy this key now — it won&apos;t be shown again.
        </p>
        <code className="mt-2 block break-all rounded bg-white px-3 py-2 text-sm">{createdKey}</code>
        <button
          type="button"
          onClick={() => setCreatedKey(null)}
          className="mt-3 text-sm font-medium text-amber-900 underline"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3">
      <div className="flex-1">
        <label className="block text-sm font-medium text-slate-700">Label (optional)</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. production"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {submitting ? 'Creating…' : 'New API key'}
      </button>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </form>
  );
}
