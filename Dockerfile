FROM node:20-bookworm AS base

RUN apt-get update && apt-get install -y \
    python3 \
    python3-venv \
    python3-pip \
    bash \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

ENV VENV_PATH=/opt/venv
ENV PATH="$VENV_PATH/bin:$PATH"

WORKDIR /app

FROM base AS deps


COPY package.json pnpm-lock.yaml ./
COPY scripts/prod_deps.sh ./scripts/
COPY requirements.txt ./
COPY .env.example ./

RUN chmod +x ./scripts/prod_deps.sh
RUN pnpm run deps-prod


FROM base AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml ./

COPY . .

RUN pnpm build

FROM base AS runner

WORKDIR /app

COPY --from=deps /opt/venv /opt/venv
COPY --from=builder /app ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["pnpm", "start"]
