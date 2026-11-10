import { pool } from '../../db.ts';
import { generateApiKey } from '../../lib/api-key.ts';
import { withTransaction } from '../../db.ts';
import { writeAuditLog } from '../../lib/audit.ts';


export async function listProjects(userId: number) {
  const { rows } = await pool.query(
    `SELECT projects.id, projects.name, memberships.role
     FROM projects
     JOIN memberships ON projects.id = memberships.project_id
     WHERE memberships.user_id = $1
     ORDER BY projects.created_at DESC`,
    [userId],
  );
  return rows;
}

export async function createProject(user: { id: number; email: string }, name: string) {
  return withTransaction(async (client) => {
    const { rows: [project] } = await client.query(
      'INSERT INTO projects (name) VALUES ($1) RETURNING id, name',
      [name],
    );

    await client.query(
      `INSERT INTO memberships (user_id, project_id, role) VALUES ($1, $2, 'admin')`,
      [user.id, project.id],
    );

    const { rows: environments } = await client.query(
      `INSERT INTO environments (project_id, name)
       VALUES ($1, 'staging'), ($1, 'production')
       RETURNING id, name`,
      [project.id],
    );

    await client.query(
      'INSERT INTO api_keys (environment_id, key) VALUES ($1, $2), ($3, $4)',
      [environments[0].id, generateApiKey(), environments[1].id, generateApiKey()],
    );

    await writeAuditLog(client, {
      projectId: project.id,
      user,
      action: 'create',
      entityType: 'project',
      entityId: project.id,
      after: project,
    });

    return { ...project, role: 'admin' };
  });
}

export async function getProject(projectId: number) {
  const { rows } = await pool.query(
    'SELECT id, name, created_at FROM projects WHERE id = $1',
    [projectId],
  );
  return rows[0];
}

export async function renameProject(
  user: { id: number; email: string },
  projectId: number,
  name: string,
) {
  return withTransaction(async (client) => {
    const { rows: [current] } = await client.query(
      'SELECT name FROM projects WHERE id = $1 FOR UPDATE',
      [projectId],
    );

    const { rows: [project] } = await client.query(
      `UPDATE projects SET name = $2, updated_at = now()
       WHERE id = $1
       RETURNING id, name, created_at`,
      [projectId, name],
    );

    if (current.name !== name) {
      await writeAuditLog(client, {
        projectId,
        user,
        action: 'update',
        entityType: 'project',
        entityId: projectId,
        before: { name: current.name },
        after: { name },
      });
    }

    return project;
  });
}

export async function deleteProject(projectId: number) {
  await pool.query('DELETE FROM projects WHERE id = $1', [projectId]);
}