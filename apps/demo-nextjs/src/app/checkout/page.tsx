import { cookies, headers } from 'next/headers';
import { after } from 'next/server';
import { TrackButton } from '@/components/TrackButton';
import { UID_COOKIE, VARIANT_HEADER_PREFIX } from '@/lib/constants';
import { CHECKOUT_FLOW_EXPERIMENT_KEY } from '@/lib/experiments.config';
import { logExposure } from '@/lib/exposure';

export default async function CheckoutPage() {
  const userId = (await cookies()).get(UID_COOKIE)?.value;
  const variantKey = (await headers()).get(VARIANT_HEADER_PREFIX + CHECKOUT_FLOW_EXPERIMENT_KEY);

  if (userId && variantKey) {
    // Fires after the response is sent — never blocks this page render.
    after(() => logExposure(userId, CHECKOUT_FLOW_EXPERIMENT_KEY, variantKey));
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      {variantKey && (
        <div className="mb-6 rounded-md bg-slate-900 px-3 py-1.5 text-center text-xs font-medium text-white">
          checkout-flow-v2 → control (this is the original checkout)
        </div>
      )}

      <h1 className="text-2xl font-bold">Checkout</h1>
      <p className="mt-2 text-slate-600">Standard one-page checkout.</p>

      <div className="mt-8 space-y-3 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <Row label="Item" value="CRO Engine Pro License" />
        <Row label="Quantity" value="1" />
        <Row label="Total" value="$49.00" />
      </div>

      <TrackButton
        eventName="purchase_completed"
        value={49}
        className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
      >
        Complete Purchase
      </TrackButton>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
