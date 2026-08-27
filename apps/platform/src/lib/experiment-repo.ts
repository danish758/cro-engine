import type { Experiment as ExperimentRow } from '@prisma/client';
import type { ExperimentConfig } from '@cro-engine/assignment-engine';
import { prisma } from './db';

/**
 * Maps a Prisma Experiment row to the assignment-engine's ExperimentConfig
 * shape, parsing the JSON columns and stripping admin-only display metadata
 * (name/description aren't part of ExperimentConfig — they're not needed by
 * anything that evaluates bucketing, only by the dashboard/admin UI).
 * Centralized here so the JSON parse/shape logic exists in exactly one
 * place, used by the public config API, the admin CRUD routes, and stats.
 */
export function toConfig(row: ExperimentRow): ExperimentConfig {
  return {
    key: row.key,
    status: row.status as ExperimentConfig['status'],
    variants: JSON.parse(row.variantsJson),
    targeting: row.targetingJson ? JSON.parse(row.targetingJson) : undefined,
    seed: row.seed ?? undefined,
  };
}

export async function listConfigsForProject(projectId: string): Promise<ExperimentConfig[]> {
  const rows = await prisma.experiment.findMany({ where: { projectId } });
  return rows.map(toConfig);
}

export async function getExperimentRow(projectId: string, key: string): Promise<ExperimentRow | null> {
  return prisma.experiment.findUnique({ where: { projectId_key: { projectId, key } } });
}
