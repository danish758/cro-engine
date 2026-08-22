import { cookies, headers } from 'next/headers';
import { after } from 'next/server';
import { TrackButton } from '@/components/TrackButton';
import { UID_COOKIE, VARIANT_HEADER_PREFIX } from '@/lib/constants';
import { PRICING_CTA_EXPERIMENT_KEY } from '@/lib/experiments.config';
import { logExposure } from '@/lib/exposure';

const CTA_COPY_BY_VARIANT: Record<string, string> = {
  control: 'Buy Now',
  variant: 'Get Started Free',
};

export default async function PricingPage() {
  const userId = (await cookies()).get(UID_COOKIE)?.value;
  const variantKey = (await headers()).get(VARIANT_HEADER_PREFIX + PRICING_CTA_EXPERIMENT_KEY);

  if (userId && variantKey) {
    after(() => logExposure(userId, PRICING_CTA_EXPERIMENT_KEY, variantKey));
  }

  const ctaCopy = (variantKey && CTA_COPY_BY_VARIANT[variantKey]) || 'Buy Now';

  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center">
      {variantKey && (
        <div className="mb-6 inline-block rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white">
          pricing-cta-copy → {variantKey}
        </div>
      )}

      <h1 className="text-3xl font-bold">CRO Engine Pro</h1>
      <p className="mt-2 text-slate-600">Everything you need to run server-side experiments.</p>

      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-4xl font-extrabold">$49</div>
        <div className="text-sm text-slate-500">one-time</div>

        <TrackButton
          eventName="cta_clicked"
          className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          {ctaCopy}
        </TrackButton>
      </div>
    </main>
  );
}
