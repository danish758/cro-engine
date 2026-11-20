import { Router } from 'express';
import { parseQuery } from '../../lib/validate.ts';
import { requireProjectRole } from '../../middleware/require-project-role.ts';
import { listAuditLogsQuerySchema } from './audit-logs.schemas.ts';
import { listAuditLogs } from './audit-logs.service.ts';

export const auditLogsRouter = Router({ mergeParams: true });

auditLogsRouter.get('/', requireProjectRole('member'), async (req, res) => {
  const { cursor, limit } = parseQuery(listAuditLogsQuerySchema, req.query);
  const result = await listAuditLogs(req.projectId!, cursor, limit);
  res.json(result);
});