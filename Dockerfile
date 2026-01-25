FROM node:20-bookworm AS base

RUN apt-get update && apt-get install -y \
    python3 \
    python3-venv \
    python3-pip \
    bash \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

FROM base AS deps

# Python venv OUTSIDE /app
ENV VENV_PATH=/opt/venv
RUN python3 -m venv $VENV_PATH
ENV PATH="$VENV_PATH/bin:$PATH"

COPY package.json pnpm-lock.yaml ./
COPY scripts/deps.sh ./scripts/
COPY requirements.txt ./
COPY .env.example ./

RUN chmod +x ./scripts/deps.sh
RUN pnpm run deps

FROM base AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml ./

COPY . .

RUN pnpm build

FROM node:20-bookworm AS runner

RUN apt-get update && apt-get install -y \
    python3 \
    python3-venv \
    python3-pip \
    bash \
 && rm -rf /var/lib/apt/lists/*

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy Python venv
ENV VENV_PATH=/opt/venv
ENV PATH="$VENV_PATH/bin:$PATH"
COPY --from=deps /opt/venv /opt/venv

# Copy app
COPY --from=builder /app ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["pnpm", "start"]
