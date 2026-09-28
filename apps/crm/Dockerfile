FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js schema.sql assistant.md ./
COPY public ./public
RUN mkdir -p /data/media
ENV NODE_ENV=production MEDIA_DIR=/data/media
EXPOSE 4100
CMD ["node","server.js"]
