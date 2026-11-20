import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.ts';
import { errorHandler, notFoundHandler } from './lib/errors.ts';
import { requestLogger } from './middleware/request-logger.ts';
import { authRouter } from './modules/auth/auth.routes.ts';
import { configRouter } from './modules/config/config.routes.ts';
import { healthRouter } from './modules/health/health.routes.ts';
import { projectsRouter } from './modules/projects/projects.routes.ts';

export const app = express();

// Security headers on every response (also removes X-Powered-By)
app.use(helmet());

// Only the dashboard may call the API from a browser, with its session cookie.
// The SDK's config endpoint runs server-side, so CORS doesn't apply to it.
app.use(cors({ origin: config.DASHBOARD_ORIGIN, credentials: true }));

app.use(requestLogger);

// Parse JSON bodies, refusing anything over 100kb
app.use(express.json({ limit: '100kb' }));

app.use(cookieParser());

// Routes
app.use('/api/v1/config', configRouter);
app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/projects', projectsRouter);

// Must come after all routes
app.use(notFoundHandler);
app.use(errorHandler);
