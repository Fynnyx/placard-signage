# Placard Signage server: one image with the admin UI, the device API, the player and the Pi files.
FROM node:22-bookworm-slim AS build
WORKDIR /src/server
RUN corepack enable
COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY server/ ./
RUN pnpm exec nuxt prepare && pnpm build

FROM node:22-bookworm-slim
LABEL org.opencontainers.image.title="Placard Signage" \
      org.opencontainers.image.description="Self-hosted digital signage for Raspberry Pi screens"
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    MIGRATIONS_DIR=/app/migrations \
    PI_DIR=/app/pi
WORKDIR /app
COPY --from=build /src/server/.output ./.output
COPY server/server/db/migrations ./migrations
COPY pi ./pi
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
