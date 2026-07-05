# syntax=docker/dockerfile:1
FROM node:24-bookworm AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# adapter-node needs ORIGIN behind a reverse proxy for CSRF-protected form actions.
ENV PORT=3000
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json ./
EXPOSE 3000
CMD ["node", "build"]
