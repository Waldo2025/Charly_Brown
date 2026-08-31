FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    BACKEND_SERVICE_ROLE=gemini \
    FIREBASE_PROJECT_ID=charly-brown \
    FIREBASE_STORAGE_BUCKET=charly-brown.firebasestorage.app \
    API_HOST=0.0.0.0 \
    PDF_ANALYZER_PYTHON_BIN=python3 \
    SKIP_PLAYWRIGHT_BROWSER_INSTALL=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
    libenchant-2-2 \
    hunspell-es hunspell-en-us hunspell-fr hunspell-pt-br hunspell-de-de hunspell-it hunspell-ca \
      python3 \
      python3-pip \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./backend/
COPY backend/scripts ./backend/scripts
RUN npm ci --omit=dev --prefix backend

COPY backend/python/requirements-analizar-pdf.txt /tmp/requirements-analizar-pdf.txt
RUN pip3 install --no-cache-dir --break-system-packages \
      -r /tmp/requirements-analizar-pdf.txt \
      "Pillow>=10.0.0"

COPY backend ./backend
COPY public ./public

USER node
CMD ["node", "backend/server.js"]
