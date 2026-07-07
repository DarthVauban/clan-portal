# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable
WORKDIR /app

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS builder

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
RUN mkdir .next && chown nextjs:nodejs .next
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/database ./database
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate-and-seed.mjs ./scripts/migrate-and-seed.mjs
COPY --from=builder --chown=nextjs:nodejs /app/src/data/corepunk-items.json ./src/data/corepunk-items.json
COPY --from=builder --chown=nextjs:nodejs /app/src/data/corepunk-items-ru.json ./src/data/corepunk-items-ru.json
COPY --from=builder --chown=nextjs:nodejs /app/src/localization/corepunk-glossary.json ./src/localization/corepunk-glossary.json

USER nextjs

EXPOSE 3000

CMD ["sh", "-c", "node scripts/migrate-and-seed.mjs && node server.js"]
