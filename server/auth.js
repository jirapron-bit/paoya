// ระบบยืนยันตัวตน
// - รหัสผ่านเข้ารหัสด้วย scrypt (มากับ Node.js)
// - เข้าสู่ระบบแล้วได้ JWT เก็บใน cookie แบบ httpOnly (JavaScript ในหน้าเว็บอ่านไม่ได้ กัน XSS ขโมย token)
// - ทุก token ผูกกับแถวในตาราง sessions: ออกจากระบบ/เปลี่ยนรหัส = ลบแถว token ใช้ไม่ได้ทันที
// - แอปอื่น (เช่น แอปมือถือ) ส่ง header  Authorization: Bearer <token>  แทน cookie ได้
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { db } = require('./db');

const IS_PROD = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || '';
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 7;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'paoya_session';
const COOKIE_SECURE = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : IS_PROD;

(function checkSecret() {
  const problems = [];
  if (JWT_SECRET.length < 16) problems.push('JWT_SECRET ต้องยาวอย่างน้อย 16 ตัวอักษร');
  if (IS_PROD && JWT_SECRET.length < 32) problems.push('ตอนใช้งานจริง (production) JWT_SECRET ต้องยาวอย่างน้อย 32 ตัวอักษร');
  if (IS_PROD && /change-me/i.test(JWT_SECRET)) problems.push('ยังใช้ JWT_SECRET ตัวอย่างอยู่ กรุณาสุ่มค่าใหม่');
  if (problems.length) {
    console.error(`\n[ตั้งค่าไม่ครบ] ${problems.join(' / ')}`);
    console.error('สุ่มค่าใหม่ได้ด้วย: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n');
    process.exit(1);
  }
})();

// ---------- รหัสผ่าน ----------
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

// ใช้ตอนไม่พบผู้ใช้ เพื่อให้เวลาตอบกลับใกล้เคียงกัน (กันเดาว่าบัญชีไหนมีอยู่จริง)
const DUMMY_HASH = hashPassword(crypto.randomBytes(8).toString('hex'));
const burnPasswordCheck = (password) => verifyPassword(password || 'x', DUMMY_HASH);

// ---------- เซสชัน ----------
const insertSession = db.prepare(
  'INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, user_agent, ip) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
const findSession = db.prepare('SELECT * FROM sessions WHERE id = ?');
const touchSession = db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?');

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MS,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'lax', path: '/' });
}

// สร้างเซสชันใหม่ + ตั้ง cookie คืนค่า token (สำหรับแอปที่ใช้ Bearer)
function startSession(req, res, userId) {
  const id = crypto.randomUUID();
  const now = Date.now();
  insertSession.run(id, userId, now, now, now + SESSION_MS, String(req.get('user-agent') || '').slice(0, 300), req.ip || '');
  const token = jwt.sign({ sub: String(userId), jti: id }, JWT_SECRET, { expiresIn: Math.floor(SESSION_MS / 1000) });
  setSessionCookie(res, token);
  return token;
}

function readCookie(req, name) {
  const header = req.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

function readToken(req) {
  const header = req.get('authorization') || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return readCookie(req, COOKIE_NAME);
}

// คืน { userId, sessionId } ถ้า token ใช้ได้ ไม่งั้นคืน null
function verifyRequest(req) {
  const token = readToken(req);
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
  const session = payload.jti ? findSession.get(payload.jti) : null;
  const now = Date.now();
  if (!session || String(session.user_id) !== String(payload.sub) || session.expires_at < now) return null;
  if (now - session.last_seen_at > 5 * 60 * 1000) touchSession.run(now, session.id);
  return { userId: session.user_id, sessionId: session.id };
}

function requireAuth(req, res, next) {
  const auth = verifyRequest(req);
  if (!auth) {
    if (readCookie(req, COOKIE_NAME)) clearSessionCookie(res);
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  }
  req.userId = auth.userId;
  req.sessionId = auth.sessionId;
  next();
}

function optionalAuth(req, _res, next) {
  const auth = verifyRequest(req);
  if (auth) {
    req.userId = auth.userId;
    req.sessionId = auth.sessionId;
  }
  next();
}

const endSession = (sessionId) => db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
// ออกจากระบบทุกเครื่อง (ยกเว้นเครื่องปัจจุบัน ถ้าระบุ)
const endAllSessions = (userId, exceptSessionId = null) =>
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id IS NOT ?').run(userId, exceptSessionId);

// ลบเซสชันหมดอายุทุกชั่วโมง
setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('DELETE FROM password_resets WHERE expires_at < ? OR used = 1').run(Date.now() - 24 * 3600 * 1000);
}, 60 * 60 * 1000).unref();

// ---------- กัน CSRF ----------
// คำขอที่แก้ข้อมูล (POST/PUT/DELETE) จากเว็บอื่นจะถูกปฏิเสธ
function sameOriginGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next(); // ไม่ใช่เบราว์เซอร์ (เช่น แอปมือถือ/curl) จะใช้ Bearer ซึ่งไม่โดน CSRF
  const allowed = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  let originHost = '';
  try { originHost = new URL(origin).host; } catch { /* origin ผิดรูปแบบ */ }
  const host = req.get('x-forwarded-host') && req.app.get('trust proxy') ? req.get('x-forwarded-host') : req.get('host');
  if (originHost === host || allowed.includes(origin)) return next();
  res.status(403).json({ error: 'ไม่อนุญาตคำขอจากเว็บไซต์อื่น' });
}

module.exports = {
  hashPassword, verifyPassword, burnPasswordCheck,
  startSession, endSession, endAllSessions, clearSessionCookie,
  requireAuth, optionalAuth, sameOriginGuard,
  SESSION_DAYS,
};
