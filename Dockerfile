FROM node:22-slim

WORKDIR /app

# 1. Only the package files, then install
COPY package.json package-lock.json ./
COPY packages/assignment-engine/package.json packages/assignment-engine/
COPY packages/stats-engine/package.json packages/stats-engine/
COPY packages/sdk/package.json packages/sdk/
COPY apps/api/package.json apps/api/
RUN npm ci

# 2. Then the rest of the code
COPY . .
RUN npm run build --workspace=packages/assignment-engine

ENV NODE_ENV=production
WORKDIR /app/apps/api
CMD ["node", "src/index.ts"]