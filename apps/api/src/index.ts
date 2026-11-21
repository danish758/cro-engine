import { app } from './app.ts';
import {config} from './config.ts'
import { pool } from './db.ts';

const server = app.listen(config.PORT, () => {
  console.log(`API running on port ${config.PORT}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down...`);

  // 1. Stop accepting new connections; wait for open requests to finish
  server.close(async () => {
    // 2. Close the database pool
    await pool.end();
    console.log('Shutdown complete');
    // 3. Exit normally
    process.exit(0);
  });

  // Safety net: if requests never finish, force exit after 10 seconds
  setTimeout(() => {
    console.error('Forcing shutdown');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
