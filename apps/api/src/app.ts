import express from 'express';
import { healthRouter } from './modules/health/health.routes.ts';
import { notFoundHandler, errorHandler } from './lib/errors.ts';
import { AppError } from './lib/errors.ts';

export const app = express();

// Parse JSON bodies, refusing anything over 100kb
app.use(express.json({ limit: '100kb' }));

// Routes
app.use('/health', healthRouter);

app.use(notFoundHandler);
app.use(errorHandler);
