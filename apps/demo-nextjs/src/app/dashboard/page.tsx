import { minimumSampleSize, type SignificanceResult, type VariantStats } from '@cro-engine/stats-engine';
import { prisma } from '@/lib/db';
import { analyzeExperimentByKey } from '@/lib/stats';

export const dynamic = 'force-dynamic';

function verdictFor(result: SignificanceResult, control: SignificanceResult): { label: string; tone: 'win' | 'loss' | 'pending' } {
  if (result.pValue !== null && result.isSignificant) {
    if ((result.relativeLift ?? 0) > 0) return { label: 'Significant win', tone: 'win' };
    return { label: 'Significant loss', tone: 'loss' };
  }

  const mde = result.relativeLift && result.relativeLift !== 0 ? Math.abs(result.relativeLift) : 0.1;
  if (control.conversionRate > 0) {
    const neededPerVariant = minimumSampleSize(control.conversionRate, mde);
    return {
      label: `Not yet significant — need ~${neededPerVariant.toLocaleString()} visitors per variant to detect this effect`,
      tone: 'pending',
    };
  }

  return { label: 'Not yet significant — need more data', tone: 'pending' };
}

const VERDICT_STYLES: Record<'win' | 'loss' | 'pending', string> = {
  win: 'bg-emerald-100 text-emerald-800',
  loss: 'bg-rose-100 text-rose-800',
  pending: 'bg-slate-100 text-slate-700',
};

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

export default async function DashboardPage() {
  const experiments = await prisma.experiment.findMany({ orderBy: { key: 'asc' } });

  const analyses = await Promise.all(experiments.map((e) => analyzeExperimentByKey(e.key)));

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-2xl font-bold">Experiment Dashboard</h1>
      <p className="mt-1 text-sm text-slate-600">
        Visitor and conversion counts are unique users (deduplicated exposures, unique converting
        users) — not raw event counts.
      </p>

      <div className="mt-10 space-y-10">
        {experiments.map((experiment, i) => {
          const analysis = analyses[i];
          return (
            <ExperimentCard
              key={experiment.id}
              status={experiment.status}
              experimentKey={experiment.key}
              results={analysis?.results ?? null}
              statsByVariant={analysis?.statsByVariant ?? {}}
            />
          );
        })}
      </div>
    </main>
  );
}

function ExperimentCard({
  experimentKey,
  status,
  results,
  statsByVariant,
}: {
  experimentKey: string;
  status: string;
  results: SignificanceResult[] | null;
  statsByVariant: Record<string, VariantStats>;
}) {
  const control = results?.find((r) => r.pValue === null) ?? null;
  const maxRate = results ? Math.max(...results.map((r) => r.conversionRate), 0.0001) : 0.0001;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{experimentKey}</h2>
        <StatusBadge status={status} />
      </div>

      {!results || results.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No exposures logged yet.</p>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-4 font-medium">Variant</th>
                  <th className="py-2 pr-4 font-medium">Visitors</th>
                  <th className="py-2 pr-4 font-medium">Conversions</th>
                  <th className="py-2 pr-4 font-medium">Conv. rate</th>
                  <th className="py-2 pr-4 font-medium">Lift vs control</th>
                  <th className="py-2 pr-4 font-medium">p-value</th>
                  <th className="py-2 font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.variantKey} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-4 font-medium">
                      {r.variantKey}
                      {r.pValue === null && <span className="ml-1.5 text-xs text-slate-400">(control)</span>}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">{statsByVariant[r.variantKey]?.visitors ?? 0}</td>
                    <td className="py-3 pr-4 tabular-nums">{statsByVariant[r.variantKey]?.conversions ?? 0}</td>
                    <td className="py-3 pr-4 tabular-nums">{pct(r.conversionRate)}</td>
                    <td className="py-3 pr-4 tabular-nums">
                      {r.relativeLift === null ? '—' : `${r.relativeLift >= 0 ? '+' : ''}${(r.relativeLift * 100).toFixed(1)}%`}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">{r.pValue === null ? '—' : r.pValue.toFixed(4)}</td>
                    <td className="py-3">
                      {r.pValue === null || !control ? (
                        <span className="text-xs text-slate-400">baseline</span>
                      ) : (
                        <VerdictBadge result={r} control={control} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 space-y-2">
            {results.map((r) => (
              <BarRow key={r.variantKey} label={r.variantKey} rate={r.conversionRate} max={maxRate} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function VerdictBadge({ result, control }: { result: SignificanceResult; control: SignificanceResult }) {
  const verdict = verdictFor(result, control);
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${VERDICT_STYLES[verdict.tone]}`}>
      {verdict.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    running: 'bg-emerald-100 text-emerald-800',
    stopped: 'bg-slate-200 text-slate-700',
    draft: 'bg-amber-100 text-amber-800',
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${styles[status] ?? 'bg-slate-100 text-slate-700'}`}>
      {status}
    </span>
  );
}

function BarRow({ label, rate, max }: { label: string; rate: number; max: number }) {
  const widthPct = Math.max(2, (rate / max) * 100);
  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="w-20 shrink-0 text-slate-500">{label}</div>
      <div className="h-3 flex-1 rounded-full bg-slate-100">
        <div className="h-3 rounded-full bg-slate-900" style={{ width: `${widthPct}%` }} />
      </div>
      <div className="w-16 shrink-0 text-right tabular-nums text-slate-600">{pct(rate)}</div>
    </div>
  );
}
