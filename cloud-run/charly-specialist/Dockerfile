FROM node:22-bookworm-slim
ENV NODE_ENV=production PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /app
COPY functions/package.json functions/package-lock.json ./
RUN npm ci --omit=dev && apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
COPY functions/src ./src
COPY cloud-run/charly-specialist/server.cjs ./server.cjs
USER node
CMD ["node", "server.cjs"]
