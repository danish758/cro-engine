import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">CRO Engine — Demo</h1>
      <p className="mt-3 text-slate-600">
        A reference implementation of the <code className="rounded bg-slate-200 px-1.5 py-0.5 text-sm">@cro-engine/assignment-engine</code> and{' '}
        <code className="rounded bg-slate-200 px-1.5 py-0.5 text-sm">@cro-engine/stats-engine</code> packages, wired
        into a real Next.js app.
      </p>

      <div className="mt-10 grid gap-4">
        <Link
          href="/checkout"
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
        >
          <div className="font-semibold">/checkout</div>
          <div className="mt-1 text-sm text-slate-600">
            Redirect-type experiment (<code>checkout-flow-v2</code>) — 50% of visitors are
            transparently redirected to <code>/checkout-v2</code> before any page renders.
          </div>
        </Link>

        <Link
          href="/pricing"
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
        >
          <div className="font-semibold">/pricing</div>
          <div className="mt-1 text-sm text-slate-600">
            Content-type experiment (<code>pricing-cta-copy</code>) — the CTA button copy changes
            based on the variant header set in middleware.
          </div>
        </Link>

        <Link
          href="/dashboard"
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
        >
          <div className="font-semibold">/dashboard</div>
          <div className="mt-1 text-sm text-slate-600">
            Live experiment results — visitors, conversions, lift, p-value, and a verdict per
            variant, computed by the stats engine.
          </div>
        </Link>
      </div>
    </main>
  );
}
