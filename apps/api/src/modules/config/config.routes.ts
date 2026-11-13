import { Router } from 'express';
import { pool } from '../../db.ts';
import { requireApiKey } from '../../middleware/require-api-key.ts';

export const configRouter = Router();

configRouter.get('/', requireApiKey, async (req, res) => {
  const { rows: experiments } = await pool.query(
    `SELECT e.key,
            e.status,
            e.targeting,
            e.seed,
            (SELECT json_agg(json_build_object('key', v.key, 'weight', v.weight) ORDER BY v.position)
             FROM variants v
             WHERE v.experiment_id = e.id) AS variants
     FROM experiments e
     WHERE e.environment_id = $1
       AND e.status = 'running'
       AND e.archived_at IS NULL
     ORDER BY e.key`,
    [req.environmentId],
  );

  res.json({ experiments });
});