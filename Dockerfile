# Build the React client
FROM node:22-bookworm-slim AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Runtime: Node server + yt-dlp (Python) + ffmpeg
FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# yt-dlp from pip with curl_cffi so it can impersonate a browser; TikTok (and
# others) reject server IPs that don't look like a real browser.
RUN python3 -m venv /opt/yt-dlp \
  && /opt/yt-dlp/bin/pip install --no-cache-dir "yt-dlp[default,curl-cffi]"
# Point youtube-dl-exec at that yt-dlp instead of downloading its own.
ENV YOUTUBE_DL_DIR=/opt/yt-dlp/bin YOUTUBE_DL_SKIP_DOWNLOAD=1
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/index.js server/lib.js ./
COPY --from=client /app/client/dist /app/client/dist
ENV NODE_ENV=production PORT=3000
USER node
EXPOSE 3000
CMD ["node", "index.js"]
