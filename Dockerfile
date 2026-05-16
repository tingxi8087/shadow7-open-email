FROM oven/bun:1.3.13 AS web-build
WORKDIR /app/web
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY web/ ./
RUN bun run build

FROM oven/bun:1.3.13 AS server-deps
WORKDIR /app/server
COPY server/package.json server/bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.13 AS runtime
WORKDIR /app
ENV HOST=0.0.0.0
ENV PORT=5160
ENV DATABASE_PATH=/app/data/shadow7-mail.sqlite
ENV WEB_DIST_PATH=/app/web/dist
ENV SMTP_INBOUND_HOST=0.0.0.0
ENV SMTP_INBOUND_PORT=25
COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server/package.json server/tsconfig.json ./server/
COPY server/src ./server/src
COPY --from=web-build /app/web/dist ./web/dist
RUN mkdir -p /app/data
EXPOSE 5160 25
WORKDIR /app/server
CMD ["bun", "src/index.ts"]
