import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

// Migrations run as the table owner, not app_user (decision 018)
const pool = new pg.Pool({
  connectionString: process.env.MIGRATION_DATABASE_URL,
});

// Folder with the .sql files, relative to this file
const migrationsDir = new URL('../db/migrations/', import.meta.url);

// One connection for the whole run, so each BEGIN/COMMIT stays on it
const client = await pool.connect();

try {
  // 1. The table that records which migrations have run
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // 2. Names that have already run
  const { rows } = await client.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((row) => row.name));

  // 3. All .sql files, in order (001, 002, ...)
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  // 4. Run each new file in its own transaction
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = await readFile(new URL(file, migrationsDir), 'utf8');

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (name) VALUES ($1)',
        [file],
      );
      await client.query('COMMIT');
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`Failed on ${file}, rolled back.`);
      throw error;
    }
  }

  console.log('Migrations up to date.');
} finally {
  // Always give the connection back and close the pool, even after an error
  client.release();
  await pool.end();
}