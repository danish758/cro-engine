import type { RequestHandler } from 'express';
import { pool } from '../db.ts';
import { AppError } from '../lib/errors.ts';
import { HttpStatus } from '../lib/http-status.ts';

export type ProjectRole = 'admin' | 'member';

const rank: Record<ProjectRole, number> = { member: 1, admin: 2 };

export function requireProjectRole(minRole: ProjectRole): RequestHandler {
  return async (req, res, next) => {
    const projectId = Number(req.params.id);
    const notFound = new AppError(HttpStatus.NOT_FOUND, 'PROJECT_NOT_FOUND', 'Project not found');

    if (!Number.isSafeInteger(projectId) || projectId <= 0) {
      throw notFound;
    }

    const { rows } = await pool.query(
      'SELECT role FROM memberships WHERE user_id = $1 AND project_id = $2',
      [req.user!.id, projectId],
    );
    const role: ProjectRole | undefined = rows[0]?.role;

    if (!role) {
      throw notFound;
    }
    if (rank[role] < rank[minRole]) {
      throw new AppError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You need admin rights for this');
    }

    req.projectId = projectId;
    req.projectRole = role;
    next();
  };
}