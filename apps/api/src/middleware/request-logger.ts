import type { RequestHandler } from 'express';

export const requestLogger: RequestHandler = (req, res, next) => {
  const start = performance.now();

  res.on('finish', () => {
    const ms = Math.round(performance.now() - start);
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });

  next();
};