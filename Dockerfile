# --- stage 1: build the React web app ---
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json ./
RUN bun install
COPY tsconfig.json vite.config.ts ./
COPY web ./web
RUN bun run build:web

# --- stage 2: runtime (Bun + ffmpeg) ---
# The backend has zero external runtime deps (only Bun built-ins), so we copy
# just the source + the built web assets. ffmpeg does all the heavy lifting.
FROM oven/bun:1
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY --from=build /app/web/dist ./web/dist
ENV DATA_DIR=/app/data
EXPOSE 3800
CMD ["bun", "src/index.ts"]
