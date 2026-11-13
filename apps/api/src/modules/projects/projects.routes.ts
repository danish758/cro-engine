import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.ts';
import { HttpStatus } from '../../lib/http-status.ts';
import { parseBody } from '../../lib/validate.ts';
import { projectNameSchema } from './projects.schemas.ts';
import { requireProjectRole } from '../../middleware/require-project-role.ts';
import { createProject, getProject, listProjects, renameProject, deleteProject } from './projects.service.ts';
import { environmentsRouter } from '../environments/environments.routes.ts';
import { foldersRouter } from '../folders/folders.routes.ts';
import { contextKeysRouter } from '../context-keys/context-keys.routes.ts';
import { experimentsRouter } from '../experiments/experiments.routes.ts';


export const projectsRouter = Router();

// Every project route needs a logged-in user
projectsRouter.use(requireAuth);

projectsRouter.get('/', async (req, res) => {
  const projects = await listProjects(req.user!.id);
  res.json({ projects });
});

projectsRouter.post('/', async (req, res) => {
  const { name } = parseBody(projectNameSchema, req.body);
  const project = await createProject(req.user!, name);
  res.status(HttpStatus.CREATED).json({ project });
});

projectsRouter.get('/:id', requireProjectRole('member'), async (req, res) => {
  const project = await getProject(req.projectId!);
  res.json({ project: { ...project, role: req.projectRole } });
});

projectsRouter.patch('/:id', requireProjectRole('admin'), async (req, res) => {
  const { name } = parseBody(projectNameSchema, req.body);
  const project = await renameProject(req.user!, req.projectId!, name);
  res.json({ project: { ...project, role: req.projectRole } });
});

projectsRouter.delete('/:id', requireProjectRole('admin'), async (req, res) => {
  await deleteProject(req.projectId!);
  res.status(HttpStatus.NO_CONTENT).end();
});


projectsRouter.use('/:id/environments', environmentsRouter);
projectsRouter.use('/:id/folders', foldersRouter);
projectsRouter.use('/:id/context-keys', contextKeysRouter);
projectsRouter.use('/:id/experiments', experimentsRouter);