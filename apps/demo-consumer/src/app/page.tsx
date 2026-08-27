import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Demo Consumer App</h1>
      <p className="mt-3 text-slate-600">
        A stand-in for &ldquo;someone else&apos;s project&rdquo; — this app has no database of its
        own. It installs{' '}
        <code className="rounded bg-slate-200 px-1.5 py-0.5 text-sm">@cro-engine/sdk</code> and
        talks to the CRO Engine platform over its public API using a project API key.
      </p>

      <div className="mt-10 grid gap-4">
        <Link
          href="/checkout"
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
        >
          <div className="font-semibold">/checkout</div>
          <div className="mt-1 text-sm text-slate-600">
            Redirect-type experiment (<code>checkout-flow-v2</code>) — bucketed locally by the SDK,
            zero network call to the platform on the common path.
          </div>
        </Link>

        <Link
          href="/pricing"
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
        >
          <div className="font-semibold">/pricing</div>
          <div className="mt-1 text-sm text-slate-600">
            Content-type experiment (<code>pricing-cta-copy</code>) — the CTA copy changes based on
            the assigned variant.
          </div>
        </Link>
      </div>
    </main>
  );
}
