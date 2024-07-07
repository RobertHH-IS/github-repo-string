FROM oven/bun:latest

WORKDIR /app

# Install git and other necessary tools
RUN apt-get update && apt-get install -y \
    git \
    tini \
    && rm -rf /var/lib/apt/lists/*

COPY package.json .
COPY bun.lockb .

RUN bun install

COPY . .

# Set a default port
ENV PORT=3000

# Expose the port
EXPOSE $PORT

# Use tini as an init system to properly handle signals
ENTRYPOINT ["/usr/bin/tini", "--"]

# Ensure Bun is running in foreground mode and logs are not buffered
ENV NODE_ENV=production
CMD ["sh", "-c", "FORCE_COLOR=1 exec bun run --smol index.ts"]