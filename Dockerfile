# Build the React client
FROM node:22-bookworm-slim AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Runtime: Node server + yt-dlp (Python script) + ffmpeg
FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package*.json ./
# postinstall of youtube-dl-exec downloads the latest yt-dlp from GitHub
RUN npm ci --omit=dev
COPY server/index.js server/lib.js ./
COPY --from=client /app/client/dist /app/client/dist
ENV NODE_ENV=production PORT=3000
USER node
EXPOSE 3000
CMD ["node", "index.js"]
