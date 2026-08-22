import { cookies, headers } from 'next/headers';
import { after } from 'next/server';
import { TrackButton } from '@/components/TrackButton';
import { UID_COOKIE, VARIANT_HEADER_PREFIX } from '@/lib/constants';
import { CHECKOUT_FLOW_EXPERIMENT_KEY } from '@/lib/experiments.config';
import { logExposure } from '@/lib/exposure';

export default async function CheckoutV2Page() {
  const userId = (await cookies()).get(UID_COOKIE)?.value;
  const variantKey = (await headers()).get(VARIANT_HEADER_PREFIX + CHECKOUT_FLOW_EXPERIMENT_KEY);

  if (userId && variantKey) {
    after(() => logExposure(userId, CHECKOUT_FLOW_EXPERIMENT_KEY, variantKey));
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      {variantKey && (
        <div className="mb-6 rounded-md bg-indigo-600 px-3 py-1.5 text-center text-xs font-medium text-white">
          checkout-flow-v2 → variant (redesigned checkout)
        </div>
      )}

      <h1 className="text-2xl font-bold text-indigo-950">Fast Checkout ⚡</h1>
      <p className="mt-2 text-indigo-700">Redesigned single-tap checkout — fewer steps, bigger button.</p>

      <div className="mt-8 rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-6 shadow-sm">
        <div className="text-sm font-medium text-indigo-500">You're buying</div>
        <div className="mt-1 text-lg font-bold text-indigo-950">CRO Engine Pro License</div>
        <div className="mt-4 text-3xl font-extrabold text-indigo-950">$49.00</div>
      </div>

      <TrackButton
        eventName="purchase_completed"
        value={49}
        className="mt-6 w-full rounded-2xl bg-indigo-600 px-4 py-4 text-lg font-bold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-500 disabled:opacity-60"
      >
        Buy Now — 1 Tap
      </TrackButton>
    </main>
  );
}
