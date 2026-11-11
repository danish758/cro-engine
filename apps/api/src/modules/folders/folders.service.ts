import { pool, withTransaction } from '../../db.ts';
import { writeAuditLog } from '../../lib/audit.ts';
import { isUniqueViolation } from '../../lib/db-errors.ts';
import { AppError } from '../../lib/errors.ts';
import { HttpStatus } from '../../lib/http-status.ts';


export async function listFolders(projectId: number) {
  const { rows } = await pool.query(
    `SELECT id, name FROM folders
     WHERE project_id = $1
     ORDER BY lower(name)`,
    [projectId],
  );
  return rows;
}


export async function createFolder(
  user: { id: number; email: string },
  projectId: number,
  name: string,
) {
  try {
    return await withTransaction(async (client) => {
      const { rows: [folder] } = await client.query(
        `INSERT INTO folders (project_id, name) VALUES ($1, $2)
         RETURNING id, name`,
        [projectId, name],
      );

      await writeAuditLog(client, {
        projectId,
        user,
        action: 'create',
        entityType: 'folder',
        entityId: folder.id,
        after: folder,
      });

      return folder;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(HttpStatus.CONFLICT, 'FOLDER_EXISTS', 'A folder with this name already exists');
    }
    throw error;
  }
}

export async function renameFolder(
  user: { id: number; email: string },
  projectId: number,
  folderId: number,
  name: string,
) {
  try {
    return await withTransaction(async (client) => {
      const { rows: [current] } = await client.query(
        'SELECT name FROM folders WHERE id = $1 AND project_id = $2 FOR UPDATE',
        [folderId, projectId],
      );

      if (!current) {
        throw new AppError(HttpStatus.NOT_FOUND, 'FOLDER_NOT_FOUND', 'Folder not found');
      }

      const { rows: [folder] } = await client.query(
        `UPDATE folders SET name = $2, updated_at = now()
         WHERE id = $1
         RETURNING id, name`,
        [folderId, name],
      );

      if (current.name !== name) {
        await writeAuditLog(client, {
          projectId,
          user,
          action: 'update',
          entityType: 'folder',
          entityId: folderId,
          before: { name: current.name },
          after: { name },
        });
      }

      return folder;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(HttpStatus.CONFLICT, 'FOLDER_EXISTS', 'A folder with this name already exists');
    }
    throw error;
  }
}

export async function deleteFolder(
  user: { id: number; email: string },
  projectId: number,
  folderId: number,
) {
  await withTransaction(async (client) => {
    const { rows: [folder] } = await client.query(
      `DELETE FROM folders WHERE project_id = $2 AND id = $1
       RETURNING id, project_id, name, created_at, updated_at`,
      [folderId, projectId],
    );

    if (!folder) {
      throw new AppError(HttpStatus.NOT_FOUND, 'FOLDER_NOT_FOUND', 'Folder not found');
    }

    await writeAuditLog(client, {
      projectId,
      user,
      action: 'delete',
      entityType: 'folder',
      entityId: folder.id,
      before: folder,
    });
  });
}