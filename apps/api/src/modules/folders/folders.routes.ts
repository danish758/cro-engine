import { Router } from 'express';
import { requireProjectRole } from '../../middleware/require-project-role.ts';
import { HttpStatus } from '../../lib/http-status.ts';
import { parseBody } from '../../lib/validate.ts';
import { folderNameSchema } from './folders.schemas.ts';
import { AppError } from '../../lib/errors.ts';
import { parseId } from '../../lib/params.ts';
import { createFolder, deleteFolder, listFolders, renameFolder } from './folders.service.ts';


export const foldersRouter = Router({ mergeParams: true });

foldersRouter.get('/', requireProjectRole('member'), async (req, res) => {
  const folders = await listFolders(req.projectId!);
  res.json({ folders });
});

foldersRouter.post('/', requireProjectRole('member'), async (req, res) => {
  const { name } = parseBody(folderNameSchema, req.body);
  const folder = await createFolder(req.user!, req.projectId!, name);
  res.status(HttpStatus.CREATED).json({ folder });
});

foldersRouter.patch('/:folderId', requireProjectRole('member'), async (req, res) => {
  const folderId = parseId(req.params.folderId);
  if (!folderId) {
    throw new AppError(HttpStatus.NOT_FOUND, 'FOLDER_NOT_FOUND', 'Folder not found');
  }

  const { name } = parseBody(folderNameSchema, req.body);
  const folder = await renameFolder(req.user!, req.projectId!, folderId, name);
  res.json({ folder });
});


foldersRouter.delete('/:folderId', requireProjectRole('member'), async (req, res) => {
  const folderId = parseId(req.params.folderId);
  if (!folderId) {
    throw new AppError(HttpStatus.NOT_FOUND, 'FOLDER_NOT_FOUND', 'Folder not found');
  }

  await deleteFolder(req.user!, req.projectId!, folderId);
  res.status(HttpStatus.NO_CONTENT).end();
});