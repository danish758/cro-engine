import { analyzeExperiment, type SignificanceResult, type VariantStats } from '@cro-engine/stats-engine';
import { prisma } from './db';
import {
  CHECKOUT_FLOW_EXPERIMENT_KEY,
  PRICING_CTA_EXPERIMENT_KEY,
  getExperiment,
} from './experiments.config';

// Which conversion event each experiment cares about — the demo app's two
// experiments each have exactly one "did the user do the thing" action.
const CONVERSION_EVENT_BY_EXPERIMENT: Record<string, string> = {
  [CHECKOUT_FLOW_EXPERIMENT_KEY]: 'purchase_completed',
  [PRICING_CTA_EXPERIMENT_KEY]: 'cta_clicked',
};

/**
 * Builds per-variant visitor/conversion counts for an experiment.
 *
 * Conversion rate is unique converting users / unique exposed users, not raw
 * event count — a user who converts twice still only counts once. We fetch
 * exposures and conversions separately and join them in application code
 * (rather than a single SQL query spanning two tables) since this is a
 * small-scale demo; a production system at real scale would push this down
 * into SQL (or a warehouse) instead.
 *
 * Every variant in the experiment's config is seeded with zero counts before
 * exposures are folded in — not just the variants that already happen to
 * have exposure rows. Without this, a fresh experiment (or one where only
 * some variants have been exposed to real traffic so far, e.g. dev testing)
 * would be missing a 'control' entry entirely, which previously made
 * analyzeExperimentByKey() below bail out to null and the dashboard report
 * "no exposures logged" even when other variants clearly had data.
 */
async function getVariantStats(experimentKey: string): Promise<VariantStats[]> {
  const eventName = CONVERSION_EVENT_BY_EXPERIMENT[experimentKey];
  const config = getExperiment(experimentKey);

  const byVariant = new Map<string, { visitors: Set<string>; conversions: Set<string> }>();
  for (const variant of config?.variants ?? []) {
    byVariant.set(variant.key, { visitors: new Set(), conversions: new Set() });
  }

  const exposures = await prisma.exposure.findMany({
    where: { experimentKey },
    select: { userId: true, variantKey: true },
  });

  const convertingUserIds = eventName
    ? new Set(
        (
          await prisma.conversion.findMany({
            where: { eventName },
            select: { userId: true },
            distinct: ['userId'],
          })
        ).map((c) => c.userId)
      )
    : new Set<string>();

  for (const exposure of exposures) {
    if (!byVariant.has(exposure.variantKey)) {
      byVariant.set(exposure.variantKey, { visitors: new Set(), conversions: new Set() });
    }
    const bucket = byVariant.get(exposure.variantKey)!;
    bucket.visitors.add(exposure.userId);
    if (convertingUserIds.has(exposure.userId)) {
      bucket.conversions.add(exposure.userId);
    }
  }

  return [...byVariant.entries()].map(([variantKey, { visitors, conversions }]) => ({
    variantKey,
    visitors: visitors.size,
    conversions: conversions.size,
  }));
}

export type ExperimentAnalysis = {
  experimentKey: string;
  results: SignificanceResult[];
  statsByVariant: Record<string, VariantStats>;
};

/**
 * Runs the stats engine for an experiment, given its variant stats. Assumes
 * a variant with key 'control' exists — both demo experiments define one.
 * Returns null only if `experimentKey` isn't a known experiment at all (not
 * merely one with zero traffic so far — see getVariantStats above).
 *
 * Returns raw visitor/conversion counts alongside the significance results
 * (keyed by variant) since SignificanceResult only carries the derived rate
 * — the dashboard needs the actual counts to display, not just the rate.
 */
export async function analyzeExperimentByKey(experimentKey: string): Promise<ExperimentAnalysis | null> {
  const variantStats = await getVariantStats(experimentKey);
  const control = variantStats.find((v) => v.variantKey === 'control');
  if (!control) return null;

  const others = variantStats.filter((v) => v.variantKey !== 'control');
  const results = analyzeExperiment(control, others);

  const statsByVariant = Object.fromEntries(variantStats.map((v) => [v.variantKey, v]));

  return { experimentKey, results, statsByVariant };
}
