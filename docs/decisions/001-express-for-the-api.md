# 001. Express for the backend API

## Context
The v1 backend lives inside Next.js route handlers. The rebuild moves it to a standalone Node API.

## Options
- Fastify: built-in schema validation, logging and plugins
- Express: the most common Node framework.
- NestJS: growing fast, more structure, more magic

## Decision
Express 5 with TypeScript. Validation (zod) and logging (pino) are added by hand.

## Why
Job postings in Pakistan, India and US remote roles mention Express most, and GrowthBook's own back-end is Express. Wiring validation and logging by hand is part of the learning. NestJS is the next thing to learn, since it runs on Express by default.
