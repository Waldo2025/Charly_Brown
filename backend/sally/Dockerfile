FROM mcr.microsoft.com/playwright:v1.61.0-noble
WORKDIR /app
ENV NODE_ENV=production PORT=8080 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY controller.js server.js policy.js html-policy.js course-reader.js smoke.js ./
COPY agent.js task-store.js task-service.js quiz-adapter.js ./
USER pwuser
CMD ["node","server.js"]
