import express from 'express';
import { pool } from './db.ts';

const app = express();
const port = 3000;


app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'ok' });
  } catch {
    res.status(503).json({ status: 'error', database: 'unreachable' });
  }
});

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});