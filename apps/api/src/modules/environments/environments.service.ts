import { pool, withTransaction } from '../../db.ts';
import { generateApiKey } from '../../lib/api-key.ts';
import { writeAuditLog } from '../../lib/audit.ts';
import { isForeignKeyViolation, isUniqueViolation } from '../../lib/db-errors.ts';
import { AppError } from '../../lib/errors.ts';
import { HttpStatus } from '../../lib/http-status.ts';


export async function listEnvironments(projectId: number) {
  const { rows } = await pool.query(
    `SELECT env.id, env.name, env.created_at, api.key AS api_key
     FROM environments AS env
     LEFT JOIN api_keys AS api
       ON env.id = api.environment_id AND api.revoked_at IS NULL
     WHERE env.project_id = $1
     ORDER BY env.created_at`,
    [projectId],
  );
  return rows;
}

export async function createEnvironment(
  user: { id: number; email: string },
  projectId: number,
  name: string,
) {
  try {
    return await withTransaction(async (client) => {
      const { rows: [environment] } = await client.query(
        `INSERT INTO environments (project_id, name) VALUES ($1, $2)
         RETURNING id, name, created_at`,
        [projectId, name],
      );

      const apiKey = generateApiKey();
      await client.query(
        'INSERT INTO api_keys (environment_id, key) VALUES ($1, $2)',
        [environment.id, apiKey],
      );

      await writeAuditLog(client, {
        projectId,
        user,
        action: 'create',
        entityType: 'environment',
        entityId: environment.id,
        after: environment,
      });

      return { ...environment, api_key: apiKey };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(HttpStatus.CONFLICT, 'ENVIRONMENT_EXISTS', 'An environment with this name already exists');
    }
    throw error;
  }
}


export async function deleteEnvironment(
  user: { id: number; email: string },
  projectId: number,
  environmentId: number,
) {
  try {
    await withTransaction(async (client) => {
      const { rows: [environment] } = await client.query(
        `DELETE FROM environments WHERE id = $1 AND project_id = $2
         RETURNING id, project_id, name, created_at, updated_at`,
        [environmentId, projectId],
      );

      if (!environment) {
        throw new AppError(HttpStatus.NOT_FOUND, 'ENVIRONMENT_NOT_FOUND', 'Environment not found');
      }

      await writeAuditLog(client, {
        projectId,
        user,
        action: 'delete',
        entityType: 'environment',
        entityId: environment.id,
        before: environment,
      });
    });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new AppError(HttpStatus.CONFLICT, 'ENVIRONMENT_IN_USE', 'This environment has experiments and can’t be deleted');
    }
    throw error;
  }
}

export async function regenerateApiKey(
  user: { id: number; email: string },
  projectId: number,
  environmentId: number,
) {
  return withTransaction(async (client) => {
    const { rows: [environment] } = await client.query(
      'SELECT id FROM environments WHERE id = $1 AND project_id = $2 FOR UPDATE',
      [environmentId, projectId],
    );

    if (!environment) {
      throw new AppError(HttpStatus.NOT_FOUND, 'ENVIRONMENT_NOT_FOUND', 'Environment not found');
    }

    const { rows: revoked } = await client.query(
      `UPDATE api_keys SET revoked_at = now()
       WHERE environment_id = $1 AND revoked_at IS NULL
       RETURNING id`,
      [environmentId],
    );

    const apiKey = generateApiKey();
    const { rows: [created] } = await client.query(
      'INSERT INTO api_keys (key, environment_id) VALUES ($1, $2) RETURNING id',
      [apiKey, environmentId],
    );

    await writeAuditLog(client, {
      projectId,
      user,
      action: 'create',
      entityType: 'api_key',
      entityId: created.id,
      before: revoked[0] ? { revoked_key_id: revoked[0].id } : undefined,
      after: { environment_id: environmentId },
    });

    return { environment_id: environmentId, api_key: apiKey };
  });
}