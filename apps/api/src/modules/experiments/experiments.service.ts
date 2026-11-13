import { pool } from '../../db.ts';
import { AppError } from '../../lib/errors.ts';
import { HttpStatus } from '../../lib/http-status.ts';
import { withTransaction } from '../../db.ts';
import { writeAuditLog } from '../../lib/audit.ts';
import { constraintName, isForeignKeyViolation, isUniqueViolation } from '../../lib/db-errors.ts';


export async function listExperiments(
  projectId: number,
  filters: { environmentId?: number; folderId?: number },
) {
  const { rows } = await pool.query(
    `SELECT id, key, name, status, environment_id, folder_id, created_at
     FROM experiments
     WHERE project_id = $1 AND archived_at IS NULL
       AND ($2::bigint IS NULL OR environment_id = $2)
       AND ($3::bigint IS NULL OR folder_id = $3)
     ORDER BY created_at DESC`,
    [projectId, filters.environmentId ?? null, filters.folderId ?? null],
  );
  return rows;
}

export async function getExperiment(projectId: number, experimentId: number) {
  const { rows: [experiment] } = await pool.query(
    `SELECT id, key, name, description, status, environment_id, folder_id,
            targeting, seed, archived_at, created_at, updated_at
     FROM experiments
     WHERE id = $1 AND project_id = $2`,
    [experimentId, projectId],
  );

  if (!experiment) {
    throw new AppError(HttpStatus.NOT_FOUND, 'EXPERIMENT_NOT_FOUND', 'Experiment not found');
  }

  const { rows: variants } = await pool.query(
    `SELECT id, key, name, is_control, weight, position
     FROM variants
     WHERE experiment_id = $1
     ORDER BY position`,
    [experimentId],
  );

  return { ...experiment, variants };
}

export async function createExperiment(
  user: { id: number; email: string },
  projectId: number,
  input: {
    key: string;
    name: string;
    description?: string | null;
    environmentId: number;
    folderId?: number | null;
  },
) {
  try {
    return await withTransaction(async (client) => {
      const { rows: [experiment] } = await client.query(
        `INSERT INTO experiments (project_id, environment_id, folder_id, key, name, description)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, key, name, description, status, environment_id, folder_id, created_at`,
        [projectId, input.environmentId, input.folderId ?? null, input.key, input.name, input.description ?? null],
      );

      const { rows: variants } = await client.query(
        `INSERT INTO variants (experiment_id, key, name, is_control, weight, position)
         VALUES ($1, 'control', 'Control', true, 50, 1),
                ($1, 'variant-b', 'Variant B', false, 50, 2)
         RETURNING id, key, name, is_control, weight, position`,
        [experiment.id],
      );

      await writeAuditLog(client, {
        projectId,
        user,
        action: 'create',
        entityType: 'experiment',
        entityId: experiment.id,
        after: { ...experiment, variants },
      });

      return { ...experiment, variants };
    });
  } catch (error) {
    if (isUniqueViolation(error) && constraintName(error) === 'experiments_environment_id_key_key') {
      throw new AppError(HttpStatus.CONFLICT, 'EXPERIMENT_KEY_EXISTS', 'An experiment with this key already exists in this environment');
    }
    if (isForeignKeyViolation(error)) {
      const field = constraintName(error) === 'experiments_folder_id_project_id_fkey' ? 'folderId' : 'environmentId';
      throw new AppError(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Invalid request body', [
        { field, message: 'not found in this project' },
      ]);
    }
    throw error;
  }
}

export async function replaceVariants(
  user: { id: number; email: string },
  projectId: number,
  experimentId: number,
  variants: { key: string; name: string; isControl: boolean; weight: number }[],
) {
  return withTransaction(async (client) => {
    // 1. Find and lock the experiment
    const { rows: [experiment] } = await client.query(
      'SELECT id, status, archived_at FROM experiments WHERE id = $1 AND project_id = $2 FOR UPDATE',
      [experimentId, projectId],
    );

    if (!experiment) {
      throw new AppError(HttpStatus.NOT_FOUND, 'EXPERIMENT_NOT_FOUND', 'Experiment not found');
    }
    if (experiment.status !== 'draft' || experiment.archived_at) {
      throw new AppError(HttpStatus.CONFLICT, 'EXPERIMENT_LOCKED', 'Variants can only be changed while the experiment is a draft');
    }

    // 2. Current variants, for the audit log
    const { rows: before } = await client.query(
      'SELECT key, name, is_control, weight, position FROM variants WHERE experiment_id = $1 ORDER BY position',
      [experimentId],
    );

    // 3. Remove them
    await client.query('DELETE FROM variants WHERE experiment_id = $1', [experimentId]);

    // 4. Insert the new list, numbered by array order
    const rows = variants.map((variant, index) => ({
      key: variant.key,
      name: variant.name,
      is_control: variant.isControl,
      weight: variant.weight,
      position: index + 1,
    }));

    const { rows: inserted } = await client.query(
      `INSERT INTO variants (experiment_id, key, name, is_control, weight, position)
       SELECT $1, v.key, v.name, v.is_control, v.weight, v.position
       FROM jsonb_to_recordset($2::jsonb)
         AS v(key text, name text, is_control boolean, weight int, position int)
       RETURNING id, key, name, is_control, weight, position`,
      [experimentId, JSON.stringify(rows)],
    );

    await client.query('UPDATE experiments SET updated_at = now() WHERE id = $1', [experimentId]);

    await writeAuditLog(client, {
      projectId,
      user,
      action: 'update',
      entityType: 'experiment',
      entityId: experimentId,
      before: { variants: before },
      after: { variants: rows },
    });

    return inserted.sort((a, b) => a.position - b.position);
  });
}

type TargetingRule = {
  attribute: string;
  operator: 'eq' | 'neq' | 'in' | 'notIn' | 'gt' | 'lt';
  value: string | number | boolean | (string | number)[];
};

function checkRuleTypes(rules: TargetingRule[], keyTypes: Map<string, string>) {
  const issues: { field: string; message: string }[] = [];

  rules.forEach((rule, index) => {
    const type = keyTypes.get(rule.attribute);

    if (!type) {
      issues.push({ field: `targeting.${index}.attribute`, message: `"${rule.attribute}" is not a context key in this project` });
      return;
    }

    const values = Array.isArray(rule.value) ? rule.value : [rule.value];
    if (values.some((value) => typeof value !== type)) {
      issues.push({ field: `targeting.${index}.value`, message: `"${rule.attribute}" is a ${type} key` });
    }

    if (type === 'boolean' && rule.operator !== 'eq' && rule.operator !== 'neq') {
      issues.push({ field: `targeting.${index}.operator`, message: 'boolean keys only support eq and neq' });
    }
  });

  if (issues.length > 0) {
    throw new AppError(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Invalid targeting', issues);
  }
}

export async function replaceTargeting(
  user: { id: number; email: string },
  projectId: number,
  experimentId: number,
  targeting: TargetingRule[],
) {
  return withTransaction(async (client) => {
    // 1. Find and lock the experiment
    const { rows: [experiment] } = await client.query(
      `SELECT status, archived_at, targeting
       FROM experiments
       WHERE id = $1 AND project_id = $2
       FOR UPDATE`,
      [experimentId, projectId],
    );

    if (!experiment) {
      throw new AppError(HttpStatus.NOT_FOUND, 'EXPERIMENT_NOT_FOUND', 'Experiment not found');
    }
    if (experiment.status !== 'draft' || experiment.archived_at) {
      throw new AppError(HttpStatus.CONFLICT, 'EXPERIMENT_LOCKED', 'Targeting can only be changed while the experiment is a draft');
    }

    // 2. The context keys the rules use
    const attributes = [...new Set(targeting.map((rule) => rule.attribute))];
    const { rows: keys } = await client.query(
      `SELECT key, type
       FROM context_keys
       WHERE project_id = $1 AND key = ANY($2::text[])`,
      [projectId, attributes],
    );
    checkRuleTypes(targeting, new Map(keys.map((row) => [row.key, row.type])));

    // 3. Save
    const { rows: [updated] } = await client.query(
      `UPDATE experiments
       SET targeting = $2::jsonb, updated_at = now()
       WHERE id = $1
       RETURNING targeting`,
      [experimentId, JSON.stringify(targeting)],
    );

    await writeAuditLog(client, {
      projectId,
      user,
      action: 'update',
      entityType: 'experiment',
      entityId: experimentId,
      before: { targeting: experiment.targeting },
      after: { targeting },
    });

    return updated.targeting;
  });
}

export async function updateExperiment(
  user: { id: number; email: string },
  projectId: number,
  experimentId: number,
  input: { name?: string; description?: string | null; folderId?: number | null },
) {
  try {
    return await withTransaction(async (client) => {
      // 1. Read the current values, locked
      const { rows: [current] } = await client.query(
        `SELECT name, description, folder_id
         FROM experiments
         WHERE id = $1 AND project_id = $2
         FOR UPDATE`,
        [experimentId, projectId],
      );

      if (!current) {
        throw new AppError(HttpStatus.NOT_FOUND, 'EXPERIMENT_NOT_FOUND', 'Experiment not found');
      }

      // 2. Merge: a sent value wins, otherwise keep the current one
      const next = {
        name: input.name !== undefined ? input.name : current.name,
        description: input.description !== undefined ? input.description : current.description,
        folder_id: input.folderId !== undefined ? input.folderId : current.folder_id,
      };

      // 3. Update all three
      const { rows: [experiment] } = await client.query(
        `UPDATE experiments
         SET name = $2, description = $3, folder_id = $4, updated_at = now()
         WHERE id = $1
         RETURNING id, key, name, description, status, environment_id, folder_id, updated_at`,
        [experimentId, next.name, next.description, next.folder_id],
      );

      // 4. Log only the fields that actually changed
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const field of ['name', 'description', 'folder_id'] as const) {
        if (current[field] !== next[field]) {
          before[field] = current[field];
          after[field] = next[field];
        }
      }

      if (Object.keys(after).length > 0) {
        await writeAuditLog(client, {
          projectId,
          user,
          action: 'update',
          entityType: 'experiment',
          entityId: experimentId,
          before,
          after,
        });
      }

      return experiment;
    });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new AppError(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Invalid request body', [
        { field: 'folderId', message: 'not found in this project' },
      ]);
    }
    throw error;
  }
}

const allowedTransitions: Record<string, string[]> = {
  draft: ['running'],
  running: ['stopped'],
  stopped: ['running'],
};

export async function changeStatus(
  user: { id: number; email: string },
  projectId: number,
  experimentId: number,
  status: 'running' | 'stopped',
) {
  return withTransaction(async (client) => {
    // 1. Find and lock
    const { rows: [current] } = await client.query(
      'SELECT status, archived_at FROM experiments WHERE id = $1 AND project_id = $2 FOR UPDATE',
      [experimentId, projectId],
    );

    if (!current) {
      throw new AppError(HttpStatus.NOT_FOUND, 'EXPERIMENT_NOT_FOUND', 'Experiment not found');
    }
    if (current.archived_at) {
      throw new AppError(HttpStatus.CONFLICT, 'EXPERIMENT_ARCHIVED', 'Archived experiments can’t change status');
    }
    if (!allowedTransitions[current.status]?.includes(status)) {
      throw new AppError(
        HttpStatus.CONFLICT,
        'INVALID_STATUS_CHANGE',
        `Can’t change status from ${current.status} to ${status}`,
      );
    }

    // 2. Ready check before going live
    if (status === 'running') {
      const { rows: [check] } = await client.query(
        `SELECT count(*)::int                           AS total,
                count(*) FILTER (WHERE is_control)::int AS controls,
                coalesce(sum(weight), 0)::int           AS weight_sum
         FROM variants
         WHERE experiment_id = $1`,
        [experimentId],
      );

      if (check.total < 2 || check.controls !== 1 || check.weight_sum !== 100) {
        throw new AppError(
          HttpStatus.CONFLICT,
          'EXPERIMENT_NOT_READY',
          'Needs at least 2 variants, exactly one control, and weights summing to 100',
        );
      }
    }

    // 3. Change it
    const { rows: [experiment] } = await client.query(
      `UPDATE experiments SET status = $2, updated_at = now()
       WHERE id = $1
       RETURNING id, key, name, status, updated_at`,
      [experimentId, status],
    );

    await writeAuditLog(client, {
      projectId,
      user,
      action: 'update',
      entityType: 'experiment',
      entityId: experimentId,
      before: { status: current.status },
      after: { status },
    });

    return experiment;
  });
}

export async function archiveExperiment(
  user: { id: number; email: string },
  projectId: number,
  experimentId: number,
) {
  return withTransaction(async (client) => {
    const { rows: [current] } = await client.query(
      'SELECT status, archived_at FROM experiments WHERE id = $1 AND project_id = $2 FOR UPDATE',
      [experimentId, projectId],
    );

    if (!current) {
      throw new AppError(HttpStatus.NOT_FOUND, 'EXPERIMENT_NOT_FOUND', 'Experiment not found');
    }
    if (current.archived_at) {
      throw new AppError(HttpStatus.CONFLICT, 'EXPERIMENT_ARCHIVED', 'This experiment is already archived');
    }
    if (current.status === 'running') {
      throw new AppError(HttpStatus.CONFLICT, 'EXPERIMENT_RUNNING', 'Stop the experiment before archiving it');
    }

    const { rows: [experiment] } = await client.query(
      `UPDATE experiments SET archived_at = now(), updated_at = now()
       WHERE id = $1
       RETURNING id, key, name, status, archived_at`,
      [experimentId],
    );

    await writeAuditLog(client, {
      projectId,
      user,
      action: 'update',
      entityType: 'experiment',
      entityId: experimentId,
      before: { archived_at: null },
      after: { archived_at: experiment.archived_at },
    });

    return experiment;
  });
}

export async function duplicateExperiment(
  user: { id: number; email: string },
  projectId: number,
  experimentId: number,
  input: { key: string; name?: string; environmentId?: number },
) {
  try {
    return await withTransaction(async (client) => {
      // 1. Copy the experiment
      const { rows: [experiment] } = await client.query(
        `INSERT INTO experiments (project_id, environment_id, folder_id, key, name, description, targeting)
         SELECT project_id, coalesce($3, environment_id), folder_id, $4, coalesce($5, 'Copy of ' || name), description, targeting
         FROM experiments
         WHERE id = $1 AND project_id = $2
         RETURNING id, key, name, description, status, environment_id, folder_id, targeting, created_at`,
        [experimentId, projectId, input.environmentId ?? null, input.key, input.name ?? null],
      );

      if (!experiment) {
        throw new AppError(HttpStatus.NOT_FOUND, 'EXPERIMENT_NOT_FOUND', 'Experiment not found');
      }

      // 2. Copy its variants
      const { rows: variants } = await client.query(
        `INSERT INTO variants (experiment_id, key, name, is_control, weight, position)
         SELECT $2, key, name, is_control, weight, position
         FROM variants
         WHERE experiment_id = $1
         RETURNING id, key, name, is_control, weight, position`,
        [experimentId, experiment.id],
      );

      await writeAuditLog(client, {
        projectId,
        user,
        action: 'create',
        entityType: 'experiment',
        entityId: experiment.id,
        after: { ...experiment, variants, duplicated_from: experimentId },
      });

      return { ...experiment, variants: variants.sort((a, b) => a.position - b.position) };
    });
  } catch (error) {
    if (isUniqueViolation(error) && constraintName(error) === 'experiments_environment_id_key_key') {
      throw new AppError(HttpStatus.CONFLICT, 'EXPERIMENT_KEY_EXISTS', 'An experiment with this key already exists in this environment');
    }
    if (isForeignKeyViolation(error)) {
      throw new AppError(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Invalid request body', [
        { field: 'environmentId', message: 'not found in this project' },
      ]);
    }
    throw error;
  }
}