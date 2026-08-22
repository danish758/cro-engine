import { PrismaClient } from '@prisma/client';
import { experiments } from '../src/lib/experiments.config.js';

const prisma = new PrismaClient();

/**
 * Mirrors the static experiment configs (src/lib/experiments.config.ts —
 * the source of truth middleware reads) into the Experiment table, so the
 * data is queryable like a real system's config would be. Upserts by `key`
 * so this script is idempotent — safe to re-run after editing the config.
 */
async function main() {
  for (const config of experiments) {
    await prisma.experiment.upsert({
      where: { key: config.key },
      create: {
        key: config.key,
        status: config.status,
        variantsJson: JSON.stringify(config.variants),
        targetingJson: config.targeting ? JSON.stringify(config.targeting) : null,
        seed: config.seed ?? null,
      },
      update: {
        status: config.status,
        variantsJson: JSON.stringify(config.variants),
        targetingJson: config.targeting ? JSON.stringify(config.targeting) : null,
        seed: config.seed ?? null,
      },
    });
    console.log(`Seeded experiment: ${config.key}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
