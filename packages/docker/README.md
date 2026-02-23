# Harmony Docker Deployment

## Quick Start

```bash
# Server + UI
docker compose up -d

# Server + UI + Discord bot
docker compose --profile with-bot up -d
```

## Configuration

1. Copy `.env.example` to `.env` and fill in values
2. Copy `harmony.config.example.yaml` to `harmony.config.yaml` and edit
3. Run `docker compose up -d`

## Commands

```bash
# Start
docker compose up -d

# Stop
docker compose down

# Logs
docker compose logs -f server

# Development (hot reload)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Multi-arch build
docker buildx build --platform linux/amd64,linux/arm64 -f Dockerfile.server ../.. -t harmony-server
```

## Volumes

- `harmony-data` — Server database and media files
- `bot-data` — Discord bot state

## Health Checks

- Server: `http://localhost:4001/health`
- UI: `http://localhost:8080/health`
