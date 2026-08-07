FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9.15.4

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/v1_api/package.json apps/v1_api/
RUN --mount=type=cache,id=teameet-pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
  pnpm install --frozen-lockfile

COPY apps/v1_api/ apps/v1_api/

WORKDIR /app/apps/v1_api
RUN npx prisma generate
RUN npx tsc --pretty false --outDir dist --rootDir src --module commonjs --target ES2022 --moduleResolution node --esModuleInterop --allowSyntheticDefaultImports --experimentalDecorators --emitDecoratorMetadata --skipLibCheck --strict --sourceMap src/jobs/v1-game-operations-worker.main.ts

FROM node:22-alpine AS runtime
WORKDIR /app
RUN corepack enable pnpm

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/v1_api/node_modules ./apps/v1_api/node_modules
COPY --from=builder /app/apps/v1_api/dist ./apps/v1_api/dist
COPY --from=builder /app/apps/v1_api/prisma ./apps/v1_api/prisma
COPY --from=builder /app/apps/v1_api/package.json ./apps/v1_api/package.json
COPY --from=builder /app/apps/v1_api/tsconfig.json ./apps/v1_api/tsconfig.json
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

ENV NODE_ENV=production
ENV WORKER_PORT=8122
EXPOSE 8122

RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app \
  && chown -R app:app /app

WORKDIR /app/apps/v1_api
USER app
CMD ["node", "dist/jobs/v1-game-operations-worker.main.js"]
