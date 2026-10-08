FROM mcr.microsoft.com/playwright:v1.61.0-noble
WORKDIR /app
ENV NODE_ENV=production PORT=8080 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY *.js ./
USER pwuser
CMD ["node","server.js"]
