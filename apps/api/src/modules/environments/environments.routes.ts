import { Router } from 'express';
import { requireProjectRole } from '../../middleware/require-project-role.ts';
import { HttpStatus } from '../../lib/http-status.ts';
import { parseBody } from '../../lib/validate.ts';
import { environmentNameSchema } from './environments.schemas.ts';
import { AppError } from '../../lib/errors.ts';
import { parseId } from '../../lib/params.ts';
import { createEnvironment, deleteEnvironment, listEnvironments, regenerateApiKey } from './environments.service.ts';

export const environmentsRouter = Router({ mergeParams: true });

environmentsRouter.get('/', requireProjectRole('member'), async (req, res) => {
  const environments = await listEnvironments(req.projectId!);
  res.json({ environments });
});

environmentsRouter.post('/', requireProjectRole('admin'), async (req, res) => {
  const { name } = parseBody(environmentNameSchema, req.body);
  const environment = await createEnvironment(req.user!, req.projectId!, name);
  res.status(HttpStatus.CREATED).json({ environment });
});



environmentsRouter.delete('/:environmentId', requireProjectRole('admin'), async (req, res) => {
  const environmentId = parseId(req.params.environmentId);
  if (!environmentId) {
    throw new AppError(HttpStatus.NOT_FOUND, 'ENVIRONMENT_NOT_FOUND', 'Environment not found');
  }

  await deleteEnvironment(req.user!, req.projectId!, environmentId);
  res.status(HttpStatus.NO_CONTENT).end();
});

environmentsRouter.post('/:environmentId/api-key/regenerate', requireProjectRole('admin'), async (req, res) => {
  const environmentId = parseId(req.params.environmentId);
  if (!environmentId) {
    throw new AppError(HttpStatus.NOT_FOUND, 'ENVIRONMENT_NOT_FOUND', 'Environment not found');
  }

  const result = await regenerateApiKey(req.user!, req.projectId!, environmentId);
  res.json(result);
});