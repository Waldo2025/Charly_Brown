FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    GOOGLE_CLOUD_PROJECT=charly-brown \
    GOOGLE_CLOUD_LOCATION=global \
    PORT=8080

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js protocol.js ./

USER node
EXPOSE 8080
CMD ["node", "server.js"]
