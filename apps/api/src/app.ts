import express from 'express';
import { healthRouter } from './modules/health/health.routes.ts';
import { notFoundHandler, errorHandler } from './lib/errors.ts';
import { requestLogger } from './middleware/request-logger.ts';
import { authRouter } from './modules/auth/auth.routes.ts';
import { projectsRouter } from './modules/projects/projects.routes.ts';
import { configRouter } from './modules/config/config.routes.ts';
import cookieParser from 'cookie-parser';



export const app = express();

app.use(requestLogger); 

// Parse JSON bodies, refusing anything over 100kb
app.use(express.json({ limit: '100kb' }));

app.use(cookieParser());


app.use('/api/v1/config', configRouter);

// Routes
app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/projects', projectsRouter);


app.use(notFoundHandler);
app.use(errorHandler);
