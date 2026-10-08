FROM mcr.microsoft.com/playwright:v1.61.0-noble
WORKDIR /app
COPY cloud-run/science-sandbox/package.json ./
RUN npm install --omit=dev --ignore-scripts
COPY cloud-run/science-sandbox/server.js ./
COPY functions/src/science-candidate-document.js ./
USER pwuser
ENV PORT=8080
CMD ["node", "server.js"]
