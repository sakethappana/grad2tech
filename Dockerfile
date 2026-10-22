# Grad2Tech platform image. The same image runs the web app and the background worker.
#   docker build -t grad2tech .
#   web:    docker run --env-file .env -p 3000:3000 grad2tech
#   worker: docker run --env-file .env grad2tech npm run worker

FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
COPY scripts/copy-monaco.mjs ./scripts/copy-monaco.mjs
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
# Build needs a syntactically valid DATABASE_URL; nothing connects during the build.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build BETTER_AUTH_SECRET=build-time-placeholder-secret-0000000000 npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN groupadd --system app && useradd --system --gid app app
COPY --from=build --chown=app:app /app ./
USER app
EXPOSE 3000
# Applies pending migrations, then starts the web server.
CMD ["npm", "run", "start:prod"]
