import express from 'express';
import { healthRouter } from './modules/health/health.routes.ts';
import { notFoundHandler, errorHandler } from './lib/errors.ts';
import { requestLogger } from './middleware/request-logger.ts';



export const app = express();

app.use(requestLogger); 

// Parse JSON bodies, refusing anything over 100kb
app.use(express.json({ limit: '100kb' }));

// Routes
app.use('/health', healthRouter);


app.use(notFoundHandler);
app.use(errorHandler);
