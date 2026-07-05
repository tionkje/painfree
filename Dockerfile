# syntax=docker/dockerfile:1
FROM node:24-bookworm AS build
WORKDIR /app
# No .git in the build context, so skip husky's prepare hook install.
ENV HUSKY=0
RUN corepack enable
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
# --ignore-scripts on prune: it would otherwise re-run the `prepare` (husky)
# script after removing husky itself. Native deps were already built at install.
RUN pnpm build && pnpm prune --prod --ignore-scripts

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
