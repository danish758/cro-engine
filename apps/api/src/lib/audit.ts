import type pg from 'pg';

type AuditEntry = {
  projectId: number;
  user: { id: number; email: string };
  action: 'create' | 'update' | 'delete';
  entityType: string;
  entityId: number;
  before?: unknown;
  after?: unknown;
};

export async function writeAuditLog(client: pg.PoolClient, entry: AuditEntry) {
  await client.query(
    `INSERT INTO audit_logs (project_id, user_id, user_email, action, entity_type, entity_id, before, after)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.projectId,
      entry.user.id,
      entry.user.email,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
    ],
  );
}