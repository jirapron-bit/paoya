# ใช้ deploy บนโฮสต์ที่รองรับ Docker (Railway, Fly.io, Render, VPS)
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production \
    DB_FILE=/data/paoya.db \
    PORT=3000

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY server ./server
COPY public ./public
COPY data/medicines.json ./data/medicines.json

# ฐานข้อมูลอยู่ที่ /data ให้ผูก volume ถาวรไว้ตรงนี้
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1

CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
