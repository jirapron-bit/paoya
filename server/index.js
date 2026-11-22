// จุดเริ่มต้นของเซิร์ฟเวอร์เป๋ายา
require('dotenv').config({ quiet: true });
const path = require('node:path');
const express = require('express');
const cors = require('cors');

const { db } = require('./db'); // สร้างตาราง + โหลดข้อมูลยาครั้งแรก
const { requireAuth, sameOriginGuard } = require('./auth');
const { rateLimit } = require('./rateLimit');
const records = require('./routes/records');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');

// ถ้ารันหลัง proxy/โฮสต์ (Render, Railway, Nginx, Cloudflare) ให้ตั้ง TRUST_PROXY=1
// เพื่อให้รู้ IP จริงของผู้ใช้ (ใช้จำกัดจำนวนครั้ง) และรู้ว่าเป็น https
if (process.env.TRUST_PROXY) {
  const v = process.env.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(v) ? Number(v) : v === 'true' ? true : v);
}

// หัวข้อความด้านความปลอดภัย
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), geolocation=(self), microphone=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  });
  if (IS_PROD && req.secure) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

if (process.env.CORS_ORIGIN) {
  app.use('/api', cors({ origin: process.env.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true }));
}
app.use(express.json({ limit: '8mb' })); // รูปฉลากยาจากกล้อง

// API: ห้ามเบราว์เซอร์/proxy เก็บแคชข้อมูลสุขภาพ + กัน CSRF + จำกัดจำนวนคำขอรวมต่อ IP
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api', sameOriginGuard);
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: Number(process.env.API_RATE_LIMIT) || 300 }));

app.get('/api/health', (_req, res) => {
  db.prepare('SELECT 1').get();
  res.json({ ok: true });
});
app.use('/api/auth', require('./routes/auth'));
app.use('/api/medicines', require('./routes/medicines'));
app.use('/api/me', requireAuth, require('./routes/me'));
app.use('/api/meds', requireAuth, records.meds);
app.use('/api/appointments', requireAuth, records.appointments);
app.use('/api/allergies', requireAuth, records.allergies);
app.use('/api/vitals', requireAuth, records.vitals);
app.use('/api/ai', requireAuth, require('./routes/ai'));

app.use('/api', (_req, res) => res.status(404).json({ error: 'ไม่พบ API นี้' }));

// หน้าเว็บ (โฟลเดอร์ public) — ไฟล์ .jsx/.js ให้เบราว์เซอร์ตรวจของใหม่ทุกครั้ง จะได้ไม่ติดเวอร์ชันเก่าหลังอัปเดต
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res, filePath) => {
    if (/\.(html|jsx?|css)$/.test(filePath)) res.set('Cache-Control', 'no-cache');
  },
}));

// จัดการ error ทั้งหมด
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'ไฟล์ใหญ่เกินไป' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 && !err.status ? 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์' : err.message });
});

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`\nเป๋ายาพร้อมใช้งานที่ http://localhost:${PORT}  (${IS_PROD ? 'production' : 'development'})`);
    const ai = require('./llm').aiInfo();
    console.log(ai.enabled ? `เปิดใช้ AI (${ai.provider}: ${ai.model}) แล้ว` : 'ยังไม่ได้ตั้งค่า AI (GROQ_API_KEY หรือ GEMINI_API_KEY): แชท/สแกนจะใช้โหมดพื้นฐาน');
    if (IS_PROD && !process.env.TRUST_PROXY) console.warn('คำเตือน: ถ้ารันหลัง proxy/โฮสต์ ควรตั้ง TRUST_PROXY=1');
    if (IS_PROD && !(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)) console.warn('คำเตือน: ยังไม่ได้ตั้งระบบส่งอีเมล ผู้ใช้จะรีเซ็ตรหัสผ่านเองไม่ได้');
  });
  // ปิดเซิร์ฟเวอร์อย่างนุ่มนวลตอนโฮสต์สั่งหยุด (deploy เวอร์ชันใหม่)
  const shutdown = () => {
    server.close(() => {
      try { db.close(); } catch { /* ปิดไปแล้ว */ }
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = app;
