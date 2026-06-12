FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /workspace/backend

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend ./
COPY public /workspace/public
COPY firestore.rules /workspace/firestore.rules
COPY storage.rules /workspace/storage.rules

EXPOSE 8080

CMD ["node", "server.js"]
