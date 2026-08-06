FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    BACKEND_SERVICE_ROLE=export \
    FIREBASE_PROJECT_ID=charly-brown \
    FIREBASE_STORAGE_BUCKET=charly-brown.firebasestorage.app \
    PLAYWRIGHT_BROWSERS_PATH=/app/backend/.playwright-browsers \
    PLAYWRIGHT_INSTALL_ON_POSTINSTALL=0

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg fontconfig fonts-dejavu-core fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./backend/
COPY backend/scripts ./backend/scripts
RUN npm ci --omit=dev --prefix backend \
    && node backend/node_modules/playwright/cli.js install-deps chromium \
    && node backend/scripts/install-playwright-chromium.js

COPY backend ./backend
COPY public ./public

USER node
CMD ["node", "backend/workers/podcaster-montage-cloud-run-job.js"]
