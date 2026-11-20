import { pool } from '../../db.ts';

export async function listAuditLogs(projectId: number, cursor: number | undefined, limit: number) {
  const { rows } = await pool.query(
    `SELECT id, user_email, action, entity_type, entity_id, before, after, created_at
     FROM audit_logs
     WHERE project_id = $1
       AND ($2::bigint IS NULL OR id < $2)
     ORDER BY id DESC
     LIMIT $3`,
    [projectId, cursor ?? null, limit + 1],
  );

  const hasMore = rows.length > limit;
  const auditLogs = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? auditLogs[auditLogs.length - 1].id : null;

  return { auditLogs, nextCursor };
}