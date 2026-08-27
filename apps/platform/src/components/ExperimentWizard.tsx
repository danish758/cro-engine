'use client';

import { validateConfig, type ExperimentConfig, type TargetingOperator } from '@cro-engine/assignment-engine';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type VariantRow = { id: string; key: string; weight: number };
type TargetingRow = { id: string; attribute: string; operator: TargetingOperator; value: string };

export type ExperimentInitialData = {
  key: string;
  name: string;
  description: string;
  conversionEvent: string;
  status: ExperimentConfig['status'];
  variants: VariantRow[];
  targeting: TargetingRow[];
};

function newId(): string {
  return crypto.randomUUID();
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Coerces each targeting row's raw text value per its operator, matching
 * the shape the server's validateTargeting()/evaluateRule() expect —
 * gt/lt need a real number, in/notIn a real array, eq/neq a plain string. */
function coerceTargetingRow(row: TargetingRow): { attribute: string; operator: TargetingOperator; value: string | number | string[] } {
  if (row.operator === 'gt' || row.operator === 'lt') {
    return { attribute: row.attribute, operator: row.operator, value: Number(row.value) };
  }
  if (row.operator === 'in' || row.operator === 'notIn') {
    return {
      attribute: row.attribute,
      operator: row.operator,
      value: row.value.split(',').map((v) => v.trim()).filter(Boolean),
    };
  }
  return { attribute: row.attribute, operator: row.operator, value: row.value };
}

const STEPS = ['Basics', 'Variants', 'Targeting', 'Review'] as const;

export function ExperimentWizard({
  projectId,
  mode,
  initial,
}: {
  projectId: string;
  mode: 'create' | 'edit';
  initial?: ExperimentInitialData;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [serverErrors, setServerErrors] = useState<string[]>([]);

  const [name, setName] = useState(initial?.name ?? '');
  const [key, setKey] = useState(initial?.key ?? '');
  const [keyEdited, setKeyEdited] = useState(mode === 'edit');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [conversionEvent, setConversionEvent] = useState(initial?.conversionEvent ?? '');
  const [status, setStatus] = useState<ExperimentConfig['status']>(initial?.status ?? 'draft');
  const [variants, setVariants] = useState<VariantRow[]>(
    initial?.variants ?? [
      { id: newId(), key: 'control', weight: 50 },
      { id: newId(), key: 'variant', weight: 50 },
    ]
  );
  const [targeting, setTargeting] = useState<TargetingRow[]>(initial?.targeting ?? []);

  function handleNameChange(value: string) {
    setName(value);
    if (!keyEdited) setKey(slugify(value));
  }

  const clientConfig: ExperimentConfig = {
    key: key || 'placeholder',
    status,
    variants: variants.map((v) => ({ key: v.key, weight: v.weight })),
  };
  // Live feedback as the admin types — the same validateConfig() the server
  // re-checks on submit, imported directly since assignment-engine is
  // dependency-free/isomorphic (works in the browser bundle for free).
  const liveErrors = validateConfig(clientConfig);

  async function handleSubmit() {
    setSubmitting(true);
    setServerErrors([]);

    const payload = {
      key,
      name,
      description,
      conversionEvent,
      status,
      variants: variants.map((v) => ({ key: v.key, weight: v.weight })),
      // Always send a real array, even when empty — the PATCH route treats
      // a genuinely missing `targeting` key as "leave it unchanged" (partial
      // update semantics), so sending `undefined` here for "no rules" was
      // indistinguishable from "don't touch existing targeting," meaning
      // removing every rule in the edit wizard could never actually clear
      // them. An empty array and `undefined` are equivalent everywhere
      // targeting actually gets evaluated (assign() checks `.length > 0`),
      // so this only matters for the update's own missing-vs-empty signal.
      targeting: targeting.map(coerceTargetingRow),
    };

    const url = mode === 'create'
      ? `/api/projects/${projectId}/experiments`
      : `/api/projects/${projectId}/experiments/${initial!.key}`;
    const res = await fetch(url, {
      method: mode === 'create' ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setServerErrors(body.errors ?? [body.error ?? 'Something went wrong']);
      setSubmitting(false);
      return;
    }

    router.push(`/projects/${projectId}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-8 flex gap-2">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`flex-1 border-b-2 pb-2 text-center text-xs font-medium ${
              i === step ? 'border-slate-900 text-slate-900' : 'border-slate-200 text-slate-400'
            }`}
          >
            {i + 1}. {label}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Name</label>
            <input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="e.g. Homepage CTA copy"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Key</label>
            <input
              value={key}
              disabled={mode === 'edit'}
              onChange={(e) => {
                setKeyEdited(true);
                setKey(e.target.value);
              }}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono disabled:bg-slate-100"
            />
            <p className="mt-1 text-xs text-slate-500">Used by the SDK to look up this experiment. Lowercase, hyphens only.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              rows={2}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Conversion event (optional)</label>
            <input
              value={conversionEvent}
              onChange={(e) => setConversionEvent(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
              placeholder="e.g. purchase_completed"
            />
            <p className="mt-1 text-xs text-slate-500">
              The event name your app sends via <code>client.trackConversion()</code> for this
              experiment&apos;s goal. Leave blank to only track visitor counts.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ExperimentConfig['status'])}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="draft">draft — not yet live</option>
              <option value="running">running — live traffic is bucketed</option>
              <option value="stopped">stopped — no longer bucketing</option>
            </select>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          {variants.map((variant, i) => (
            <div key={variant.id} className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700">Variant key</label>
                <input
                  value={variant.key}
                  onChange={(e) => {
                    const next = [...variants];
                    next[i] = { ...variant, key: e.target.value };
                    setVariants(next);
                  }}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div className="w-28">
                <label className="block text-sm font-medium text-slate-700">Weight</label>
                <input
                  type="number"
                  value={variant.weight}
                  onChange={(e) => {
                    const next = [...variants];
                    next[i] = { ...variant, weight: Number(e.target.value) };
                    setVariants(next);
                  }}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => setVariants(variants.filter((v) => v.id !== variant.id))}
                disabled={variants.length <= 2}
                className="rounded-md px-2 py-2 text-sm text-rose-600 disabled:opacity-30"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setVariants([...variants, { id: newId(), key: '', weight: 0 }])}
            className="text-sm font-medium text-slate-700 underline"
          >
            + Add variant
          </button>

          {liveErrors.length > 0 && (
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              {liveErrors.map((e) => (
                <div key={e}>{e}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Optional. Rules are AND&apos;d together — everyone is eligible if you skip this step.
          </p>
          {targeting.map((rule, i) => (
            <div key={rule.id} className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-700">Attribute</label>
                <input
                  value={rule.attribute}
                  onChange={(e) => {
                    const next = [...targeting];
                    next[i] = { ...rule, attribute: e.target.value };
                    setTargeting(next);
                  }}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
                  placeholder="e.g. country"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Operator</label>
                <select
                  value={rule.operator}
                  onChange={(e) => {
                    const next = [...targeting];
                    next[i] = { ...rule, operator: e.target.value as TargetingOperator };
                    setTargeting(next);
                  }}
                  className="mt-1 rounded-md border border-slate-300 px-2 py-2 text-sm"
                >
                  {(['eq', 'neq', 'in', 'notIn', 'gt', 'lt'] as const).map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-700">
                  Value{(rule.operator === 'in' || rule.operator === 'notIn') && ' (comma-separated)'}
                </label>
                <input
                  value={rule.value}
                  onChange={(e) => {
                    const next = [...targeting];
                    next[i] = { ...rule, value: e.target.value };
                    setTargeting(next);
                  }}
                  type={rule.operator === 'gt' || rule.operator === 'lt' ? 'number' : 'text'}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => setTargeting(targeting.filter((r) => r.id !== rule.id))}
                className="rounded-md px-2 py-2 text-sm text-rose-600"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setTargeting([...targeting, { id: newId(), attribute: '', operator: 'eq', value: '' }])}
            className="text-sm font-medium text-slate-700 underline"
          >
            + Add targeting rule
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4 text-sm">
          <div>
            <span className="font-medium">{name}</span>{' '}
            <code className="text-slate-500">{key}</code>{' '}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{status}</span>
          </div>
          {description && <p className="text-slate-600">{description}</p>}
          <div>
            <span className="font-medium">Conversion event: </span>
            {conversionEvent || <span className="text-slate-400">none (visitor counts only)</span>}
          </div>
          <div>
            <div className="font-medium">Variants</div>
            <ul className="mt-1 list-disc pl-5">
              {variants.map((v) => (
                <li key={v.id}>
                  {v.key} — {v.weight}%
                </li>
              ))}
            </ul>
          </div>
          {targeting.length > 0 && (
            <div>
              <div className="font-medium">Targeting</div>
              <ul className="mt-1 list-disc pl-5">
                {targeting.map((r) => (
                  <li key={r.id}>
                    {r.attribute} {r.operator} {r.value}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {serverErrors.length > 0 && (
            <div className="rounded-md bg-rose-50 p-3 text-rose-800">
              {serverErrors.map((e) => (
                <div key={e}>{e}</div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-8 flex justify-between">
        <button
          type="button"
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-30"
        >
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            disabled={step === 0 && (!name || !key)}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-30"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || liveErrors.length > 0}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-30"
          >
            {submitting ? 'Saving…' : mode === 'create' ? 'Create experiment' : 'Save changes'}
          </button>
        )}
      </div>
    </div>
  );
}
