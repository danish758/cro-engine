import { analyzeExperiment, type SignificanceResult, type VariantStats } from '@cro-engine/stats-engine';
import { prisma } from './db';
import type { Experiment as ExperimentRow } from '@prisma/client';
import { toConfig } from './experiment-repo';

/**
 * Builds per-variant visitor/conversion counts for one experiment, scoped to
 * a project. Every variant in the experiment's own config is seeded with
 * zero counts before exposures are folded in — not just variants that
 * already have exposure rows — otherwise a variant with real traffic but a
 * still-empty control would make the whole experiment's analysis
 * unavailable (a real bug caught during v1's own verification pass).
 *
 * Conversion rate is unique converting users / unique exposed users, not raw
 * event count — a user who converts twice still only counts once.
 */
async function getVariantStats(row: ExperimentRow): Promise<VariantStats[]> {
  const config = toConfig(row);

  const byVariant = new Map<string, { visitors: Set<string>; conversions: Set<string> }>();
  for (const variant of config.variants) {
    byVariant.set(variant.key, { visitors: new Set(), conversions: new Set() });
  }

  const exposures = await prisma.exposure.findMany({
    where: { projectId: row.projectId, experimentKey: row.key },
    select: { userId: true, variantKey: true },
  });

  const convertingUserIds = row.conversionEvent
    ? new Set(
        (
          await prisma.conversion.findMany({
            where: { projectId: row.projectId, eventName: row.conversionEvent },
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
    if (convertingUserIds.has(exposure.userId)) bucket.conversions.add(exposure.userId);
  }

  return [...byVariant.entries()].map(([variantKey, { visitors, conversions }]) => ({
    variantKey,
    visitors: visitors.size,
    conversions: conversions.size,
  }));
}

export type ExperimentAnalysis = {
  results: SignificanceResult[];
  statsByVariant: Record<string, VariantStats>;
};

export async function analyzeExperimentRow(row: ExperimentRow): Promise<ExperimentAnalysis | null> {
  const config = toConfig(row);
  // The baseline is whichever variant is listed first in the experiment's
  // own config, not a hardcoded "control" key — admins can name variants
  // anything, unlike v1's two fixed demo experiments.
  const baselineKey = config.variants[0]?.key;
  if (!baselineKey) return null;

  const variantStats = await getVariantStats(row);
  const control = variantStats.find((v) => v.variantKey === baselineKey);
  if (!control) return null;

  const others = variantStats.filter((v) => v.variantKey !== baselineKey);
  const results = analyzeExperiment(control, others);
  const statsByVariant = Object.fromEntries(variantStats.map((v) => [v.variantKey, v]));

  return { results, statsByVariant };
}
