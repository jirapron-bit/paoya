# ใช้ deploy บนโฮสต์ที่รองรับ Docker (Railway, Fly.io, Render, VPS)
# ฐานข้อมูลอยู่ที่ /data/paoya.db ให้ผูกดิสก์ถาวร (volume) ไว้ที่ /data
# (Railway: ไม่ใช้คำสั่ง VOLUME ใน Dockerfile ให้เพิ่ม Volume ในหน้าเว็บ Railway แทน)
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
RUN mkdir -p /data

EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]