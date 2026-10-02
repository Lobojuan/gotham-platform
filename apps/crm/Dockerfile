FROM node:22-bookworm-slim
# ffmpeg: uploaded videos are converted to MP4 with the logo in the corner, and their recording date is read
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js media-tools.js events-pages.js receptionist.js schema.sql assistant.md ./
COPY public ./public
RUN mkdir -p /data/media
ENV NODE_ENV=production MEDIA_DIR=/data/media
EXPOSE 4100
CMD ["node","server.js"]
