import { cookies, headers } from 'next/headers';
import { after } from 'next/server';
import { TrackButton } from '@/components/TrackButton';
import { UID_COOKIE, VARIANT_HEADER_PREFIX } from '@/lib/constants';
import { croEngine } from '@/lib/cro-engine';
import { PRICING_CTA_COLOR_EXPERIMENT_KEY, PRICING_CTA_EXPERIMENT_KEY } from '@/lib/experiments.config';
import { parseVariantHeader } from '@/lib/variant-header';

const CTA_COPY_BY_VARIANT: Record<string, string> = {
  control: 'Buy Now',
  variant: 'Get Started Free',
};

// Keys must match the cta-color experiment's actual variant keys on the
// platform exactly, spaces included ("variant 1" / "variant 2", not
// "variant1"/"variant2") — a mismatch here silently falls through to the
// default color for that variant, with no error anywhere.
const CTA_COLOR_BY_VARIANT: Record<string, string> = {
  control: 'bg-slate-900',
  'variant 1': 'bg-green-600',
  'variant 2': 'bg-blue-600',
};

export default async function PricingPage() {
  const userId = (await cookies()).get(UID_COOKIE)?.value;
  const headerList = await headers();
  const { variantKey, isForced: copyIsForced } = parseVariantHeader(
    headerList.get(VARIANT_HEADER_PREFIX + PRICING_CTA_EXPERIMENT_KEY)
  );
  const { variantKey: ctaColorVariant, isForced: colorIsForced } = parseVariantHeader(
    headerList.get(VARIANT_HEADER_PREFIX + PRICING_CTA_COLOR_EXPERIMENT_KEY)
  );

  // Forced (QA/testing) variants render normally but are never tracked —
  // that traffic must not count as a real visitor on the dashboard.
  if (userId && variantKey && !copyIsForced) {
    croEngine.trackExposure(userId, PRICING_CTA_EXPERIMENT_KEY, variantKey);
  }
  if (userId && ctaColorVariant && !colorIsForced) {
    croEngine.trackExposure(userId, PRICING_CTA_COLOR_EXPERIMENT_KEY, ctaColorVariant);
  }
  if (userId && ((variantKey && !copyIsForced) || (ctaColorVariant && !colorIsForced))) {
    after(() => croEngine.flush());
  }

  const ctaCopy = (variantKey && CTA_COPY_BY_VARIANT[variantKey]) || 'Buy Now';
  const ctaColor = (ctaColorVariant && CTA_COLOR_BY_VARIANT[ctaColorVariant]) || 'bg-slate-900';

  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center">
      {(variantKey || ctaColorVariant) && (
        <div className="mb-6 flex flex-wrap justify-center gap-2">
          {variantKey && (
            <span className="inline-block rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white">
              pricing-cta-copy → {variantKey}
              {copyIsForced && <span className="text-amber-300"> · forced</span>}
            </span>
          )}
          {ctaColorVariant && (
            <span className="inline-block rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white">
              cta-color → {ctaColorVariant}
              {colorIsForced && <span className="text-amber-300"> · forced</span>}
            </span>
          )}
        </div>
      )}

      <h1 className="text-3xl font-bold">CRO Engine Pro</h1>
      <p className="mt-2 text-slate-600">Everything you need to run server-side experiments.</p>

      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-4xl font-extrabold">$49</div>
        <div className="text-sm text-slate-500">one-time</div>

        <TrackButton
          eventName="cta_clicked"
          className={`mt-6 w-full rounded-lg ${ctaColor} px-4 py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-60`}
        >
          {ctaCopy}
        </TrackButton>
      </div>
    </main>
  );
}
