FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/ packages/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @harmony/cloud build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app .
EXPOSE 3000
ENV PORT=3000
CMD ["node", "packages/cloud/dist/server.js"]
