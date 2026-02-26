# Harmony — Multi-stage build for server + web UI
# Usage: docker build -f packages/docker/Dockerfile -t harmony .

# ── Stage 1: Install dependencies ──
FROM node:22-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ packages/
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build UI ──
FROM deps AS ui-build
RUN cd packages/ui-app && npx vite build

# ── Stage 3: Server runtime ──
FROM node:22-slim AS server
RUN apt-get update && apt-get install -y wget && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN corepack enable
COPY --from=deps /app .
EXPOSE 4000 4001
VOLUME ["/var/harmony/data"]
ENV HARMONY_CONFIG=/etc/harmony/config.yaml
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://localhost:4001/health || exit 1
CMD ["node", "--import", "tsx", "packages/server-runtime/bin/harmony-server.js", "--config", "/etc/harmony/config.yaml"]

# ── Stage 4: UI static serve (nginx) ──
FROM nginx:alpine AS ui
COPY --from=ui-build /app/packages/ui-app/dist /usr/share/nginx/html
COPY packages/docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
