# cpl-server: Yukon Node game server. One image runs either world; the compose env selects which
# (WORLD=Login -> :6111, WORLD=Blizzard -> :6112, MODE=migrate -> run migrations and exit).
# Build context = the server-clubpenguinlive repo root.

FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/data ./data
COPY --from=build /app/utils ./utils
COPY --from=build /app/migrations ./migrations
COPY deploy/entrypoint-server.sh /usr/local/bin/entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh && chmod +x /usr/local/bin/entrypoint.sh
RUN groupadd -r app && useradd -r -g app app \
    && chown -R app:app /app
USER app
EXPOSE 6111 6112
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
