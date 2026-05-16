# Shadow7 Mail Server

Fastify + Bun + TypeScript backend for the self-hosted mail manager.

## Scripts

```bash
bun install
bun run dev
```

The server listens on `127.0.0.1:5160` by default.

Environment variables:

- `HOST`: listen host
- `PORT`: listen port
- `DATABASE_PATH`: SQLite database path
- `LOG_LEVEL`: Fastify logger level
- `COOKIE_SECURE`: set to `true` only when serving over HTTPS

## Current Routes

- `GET /health`
- `GET /api/system/status`
