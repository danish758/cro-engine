import type { ExperimentConfig } from '@cro-engine/assignment-engine';

/**
 * Static, edge-safe source of truth for experiment configs.
 *
 * Middleware runs on the Vercel Edge Runtime, which cannot load Prisma +
 * SQLite (no Node.js `fs`/native bindings there), and querying a database
 * on every single edge request for config that changes rarely would also
 * just be needless latency. So configs live here as a plain module —
 * zero I/O, bundled directly into the edge function — and are mirrored into
 * the `Experiment` table by `prisma/seed.ts` purely so the data is
 * queryable like a real system's config would be (e.g. from the dashboard).
 * See DESIGN.md for the full rationale.
 *
 * To change an experiment, edit this file AND re-run `npm run db:seed`.
 */

export const CHECKOUT_FLOW_EXPERIMENT_KEY = 'checkout-flow-v2';
export const PRICING_CTA_EXPERIMENT_KEY = 'pricing-cta-copy';

export const experiments: ExperimentConfig[] = [
  {
    key: CHECKOUT_FLOW_EXPERIMENT_KEY,
    status: 'running',
    variants: [
      { key: 'control', weight: 50 }, // stays on /checkout
      { key: 'variant', weight: 50 }, // redirected to /checkout-v2
    ],
  },
  {
    key: PRICING_CTA_EXPERIMENT_KEY,
    status: 'running',
    variants: [
      { key: 'control', weight: 50 }, // "Buy Now"
      { key: 'variant', weight: 50 }, // "Get Started Free"
    ],
  },
];

export function getExperiment(key: string): ExperimentConfig | undefined {
  return experiments.find((e) => e.key === key);
}
