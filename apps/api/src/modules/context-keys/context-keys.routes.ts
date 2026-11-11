import { Router } from 'express';
import { HttpStatus } from '../../lib/http-status.ts';
import { parseBody } from '../../lib/validate.ts';
import { requireProjectRole } from '../../middleware/require-project-role.ts';
import { createContextKeySchema } from './context-keys.schemas.ts';
import { AppError } from '../../lib/errors.ts';
import { parseId } from '../../lib/params.ts';
import { createContextKey, deleteContextKey, listContextKeys } from './context-keys.service.ts';
export const contextKeysRouter = Router({ mergeParams: true });

contextKeysRouter.get('/', requireProjectRole('member'), async (req, res) => {
  const contextKeys = await listContextKeys(req.projectId!);
  res.json({ contextKeys });
});

contextKeysRouter.post('/', requireProjectRole('member'), async (req, res) => {
  const input = parseBody(createContextKeySchema, req.body);
  const contextKey = await createContextKey(req.user!, req.projectId!, input);
  res.status(HttpStatus.CREATED).json({ contextKey });
});

contextKeysRouter.delete('/:contextKeyId', requireProjectRole('member'), async (req, res) => {
  const contextKeyId = parseId(req.params.contextKeyId);
  if (!contextKeyId) {
    throw new AppError(HttpStatus.NOT_FOUND, 'CONTEXT_KEY_NOT_FOUND', 'Context key not found');
  }

  await deleteContextKey(req.user!, req.projectId!, contextKeyId);
  res.status(HttpStatus.NO_CONTENT).end();
});