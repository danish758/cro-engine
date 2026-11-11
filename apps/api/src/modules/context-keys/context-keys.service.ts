import { pool, withTransaction } from '../../db.ts';
import { writeAuditLog } from '../../lib/audit.ts';
import { isUniqueViolation } from '../../lib/db-errors.ts';
import { AppError } from '../../lib/errors.ts';
import { HttpStatus } from '../../lib/http-status.ts';

export async function listContextKeys(projectId: number) {
  const { rows } = await pool.query(
    'SELECT id, key, type FROM context_keys WHERE project_id = $1 ORDER BY key',
    [projectId],
  );
  return rows;
}

export async function createContextKey(
  user: { id: number; email: string },
  projectId: number,
  input: { key: string; type: string },
) {
  try {
    return await withTransaction(async (client) => {
      const { rows: [contextKey] } = await client.query(
        `INSERT INTO context_keys (project_id, key, type) VALUES ($1, $2, $3)
         RETURNING id, key, type`,
        [projectId, input.key, input.type],
      );

      await writeAuditLog(client, {
        projectId,
        user,
        action: 'create',
        entityType: 'context_key',
        entityId: contextKey.id,
        after: contextKey,
      });

      return contextKey;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(HttpStatus.CONFLICT, 'CONTEXT_KEY_EXISTS', 'A context key with this name already exists');
    }
    throw error;
  }
}

export async function deleteContextKey(
  user: { id: number; email: string },
  projectId: number,
  contextKeyId: number,
) {
  await withTransaction(async (client) => {
    const { rows: [found] } = await client.query(
      'SELECT key FROM context_keys WHERE id = $1 AND project_id = $2 FOR UPDATE',
      [contextKeyId, projectId],
    );

    if (!found) {
      throw new AppError(HttpStatus.NOT_FOUND, 'CONTEXT_KEY_NOT_FOUND', 'Context key not found');
    }

    const { rows: used } = await client.query(
      'SELECT 1 FROM experiments WHERE project_id = $1 AND targeting @> $2::jsonb LIMIT 1',
      [projectId, JSON.stringify([{ attribute: found.key }])],
    );

    if (used.length > 0) {
      throw new AppError(HttpStatus.CONFLICT, 'CONTEXT_KEY_IN_USE', 'This context key is used in experiment targeting');
    }

    const { rows: [contextKey] } = await client.query(
      `DELETE FROM context_keys WHERE id = $1
       RETURNING id, project_id, key, type, created_at, updated_at`,
      [contextKeyId],
    );

    await writeAuditLog(client, {
      projectId,
      user,
      action: 'delete',
      entityType: 'context_key',
      entityId: contextKey.id,
      before: contextKey,
    });
  });
}