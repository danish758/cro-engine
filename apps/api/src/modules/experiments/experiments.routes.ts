import { Router } from 'express';
import { requireProjectRole } from '../../middleware/require-project-role.ts';
import { AppError } from '../../lib/errors.ts';
import { HttpStatus } from '../../lib/http-status.ts';
import { parseId } from '../../lib/params.ts';
import { parseBody, parseQuery } from '../../lib/validate.ts';
import { createExperimentSchema, listExperimentsQuerySchema, replaceTargetingSchema, replaceVariantsSchema ,updateExperimentSchema, duplicateExperimentSchema } from './experiments.schemas.ts';
import { createExperiment, getExperiment, listExperiments, replaceTargeting, replaceVariants, updateExperiment, archiveExperiment, duplicateExperiment } from './experiments.service.ts';
import { changeStatusSchema } from './experiments.schemas.ts';
import { changeStatus } from './experiments.service.ts';

export const experimentsRouter = Router({ mergeParams: true });

experimentsRouter.get('/', requireProjectRole('member'), async (req, res) => {
  const filters = parseQuery(listExperimentsQuerySchema, req.query);
  const experiments = await listExperiments(req.projectId!, filters);
  res.json({ experiments });
});

function experimentIdFrom(value: unknown): number {
  const experimentId = parseId(value);
  if (!experimentId) {
    throw new AppError(HttpStatus.NOT_FOUND, 'EXPERIMENT_NOT_FOUND', 'Experiment not found');
  }
  return experimentId;
}

experimentsRouter.get('/:experimentId', requireProjectRole('member'), async (req, res) => {
  const experiment = await getExperiment(req.projectId!, experimentIdFrom(req.params.experimentId));
  res.json({ experiment });
});

experimentsRouter.post('/', requireProjectRole('member'), async (req, res) => {
  const input = parseBody(createExperimentSchema, req.body);
  const experiment = await createExperiment(req.user!, req.projectId!, input);
  res.status(HttpStatus.CREATED).json({ experiment });
});

experimentsRouter.put('/:experimentId/variants', requireProjectRole('member'), async (req, res) => {
  const { variants } = parseBody(replaceVariantsSchema, req.body);
  const updated = await replaceVariants(req.user!, req.projectId!, experimentIdFrom(req.params.experimentId), variants);
  res.json({ variants: updated });
});

experimentsRouter.put('/:experimentId/targeting', requireProjectRole('member'), async (req, res) => {
  const { targeting } = parseBody(replaceTargetingSchema, req.body);
  const updated = await replaceTargeting(req.user!, req.projectId!, experimentIdFrom(req.params.experimentId), targeting);
  res.json({ targeting: updated });
});

experimentsRouter.patch('/:experimentId', requireProjectRole('member'), async (req, res) => {
  const input = parseBody(updateExperimentSchema, req.body);
  const experiment = await updateExperiment(req.user!, req.projectId!, experimentIdFrom(req.params.experimentId), input);
  res.json({ experiment });
});

experimentsRouter.post('/:experimentId/status', requireProjectRole('member'), async (req, res) => {
  const { status } = parseBody(changeStatusSchema, req.body);
  const experiment = await changeStatus(req.user!, req.projectId!, experimentIdFrom(req.params.experimentId), status);
  res.json({ experiment });
});

experimentsRouter.post('/:experimentId/archive', requireProjectRole('member'), async (req, res) => {
  const experiment = await archiveExperiment(req.user!, req.projectId!, experimentIdFrom(req.params.experimentId));
  res.json({ experiment });
});

experimentsRouter.post('/:experimentId/duplicate', requireProjectRole('member'), async (req, res) => {
  const input = parseBody(duplicateExperimentSchema, req.body);
  const experiment = await duplicateExperiment(req.user!, req.projectId!, experimentIdFrom(req.params.experimentId), input);
  res.status(HttpStatus.CREATED).json({ experiment });
});