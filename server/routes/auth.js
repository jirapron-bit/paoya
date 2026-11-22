// สมัครสมาชิก / เข้าสู่ระบบ / ออกจากระบบ / ลืมรหัสผ่าน
const crypto = require('node:crypto');
const express = require('express');
const { db } = require('../db');
const {
  hashPassword, verifyPassword, burnPasswordCheck,
  startSession, endSession, endAllSessions, clearSessionCookie, optionalAuth, requireAuth,
} = require('../auth');
const { Limiter, rateLimit, tooMany } = require('../rateLimit');
const { sendEmail, isEmailConfigured } = require('../email');
const { HttpError, str, int, validatePassword } = require('../util');
const { publicUser } = require('./me');

const router = express.Router();
const RESET_TTL_MS = 30 * 60 * 1000; // ลิงก์รีเซ็ตใช้ได้ 30 นาที
const MIN = 60 * 1000;

// ---------- จำกัดจำนวนครั้ง ----------
const loginIpLimit = new Limiter({ windowMs: 15 * MIN, max: 30 });     // ต่อ IP: ลองได้ 30 ครั้ง / 15 นาที
const loginFailLimit = new Limiter({ windowMs: 15 * MIN, max: 5 });    // ต่อบัญชี: ผิดได้ 5 ครั้ง / 15 นาที
const forgotEmailLimit = new Limiter({ windowMs: 60 * MIN, max: 3 });  // ต่ออีเมล: ขอรีเซ็ตได้ 3 ครั้ง / ชั่วโมง

const registerLimit = rateLimit({ windowMs: 60 * MIN, max: 10, message: 'สมัครสมาชิกถี่เกินไป' });
const forgotIpLimit = rateLimit({ windowMs: 15 * MIN, max: 5, message: 'ขอรีเซ็ตรหัสผ่านถี่เกินไป' });
const resetLimit = rateLimit({ windowMs: 15 * MIN, max: 10, message: 'ลองตั้งรหัสผ่านถี่เกินไป' });

router.post('/register', registerLimit, (req, res) => {
  const b = req.body || {};
  const firstName = str(b.firstName, 100);
  const lastName = str(b.lastName, 100);
  const email = str(b.email, 200).toLowerCase();
  const username = str(b.username, 50);
  const age = int(b.age, { min: 1, max: 130 });
  const disease = str(b.disease, 200);

  if (!firstName || !lastName) throw new HttpError(400, 'กรุณากรอกชื่อและนามสกุล');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'รูปแบบอีเมลไม่ถูกต้อง');
  if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(username)) {
    throw new HttpError(400, 'ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ/ตัวเลข 3-50 ตัว (ใช้ _ . - ได้)');
  }
  validatePassword(b.password);

  const taken = db.prepare('SELECT email, username FROM users WHERE email = ? OR username = ?').get(email, username);
  if (taken) {
    throw new HttpError(409, taken.email.toLowerCase() === email ? 'อีเมลนี้ถูกใช้แล้ว' : 'ชื่อผู้ใช้นี้ถูกใช้แล้ว');
  }

  const diseases = disease && disease !== '-' ? [disease] : [];
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO users (first_name, last_name, age, chronic_diseases, email, username, password_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(firstName, lastName, age, JSON.stringify(diseases), email, username, hashPassword(b.password));

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid);
  const token = startSession(req, res, user.id);
  res.status(201).json({ user: publicUser(user), ...(req.body?.wantToken ? { token } : {}) });
});

router.post('/login', (req, res) => {
  const login = str(req.body?.login, 200).toLowerCase();
  const password = req.body?.password;
  if (!login || typeof password !== 'string') throw new HttpError(400, 'กรุณากรอกอีเมล/ชื่อผู้ใช้ และรหัสผ่าน');

  const ipWait = loginIpLimit.blockedFor(req.ip);
  if (ipWait) return tooMany(res, ipWait, 'ลองเข้าสู่ระบบหลายครั้งเกินไป');
  const accountWait = loginFailLimit.blockedFor(login);
  if (accountWait) return tooMany(res, accountWait, 'ใส่รหัสผ่านผิดหลายครั้ง บัญชีถูกล็อกชั่วคราว');
  loginIpLimit.hit(req.ip);

  const user = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(login, login);
  const ok = user ? verifyPassword(password, user.password_hash) : burnPasswordCheck(password) && false;
  if (!ok) {
    loginFailLimit.hit(login);
    throw new HttpError(401, 'อีเมล/ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง');
  }
  loginFailLimit.reset(login);
  const token = startSession(req, res, user.id);
  // แอปมือถือ/แอปอื่นที่ใช้ Bearer ส่ง { wantToken: true } มาเพื่อรับ token; หน้าเว็บใช้ cookie อย่างเดียว
  res.json({ user: publicUser(user), ...(req.body?.wantToken ? { token } : {}) });
});

router.post('/logout', optionalAuth, (req, res) => {
  if (req.sessionId) endSession(req.sessionId);
  clearSessionCookie(res);
  res.json({ ok: true });
});

// ออกจากระบบทุกอุปกรณ์ (รวมเครื่องนี้)
router.post('/logout-all', requireAuth, (req, res) => {
  endAllSessions(req.userId);
  clearSessionCookie(res);
  res.json({ ok: true });
});

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

router.post('/forgot-password', forgotIpLimit, async (req, res) => {
  const email = str(req.body?.email, 200).toLowerCase();
  const response = { message: 'ถ้าอีเมลนี้มีอยู่ในระบบ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้แล้ว' };
  if (!email || forgotEmailLimit.blockedFor(email)) return res.json(response);
  forgotEmailLimit.hit(email);

  const user = db.prepare('SELECT id, email, first_name FROM users WHERE email = ?').get(email);
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ?').run(user.id); // ลิงก์เก่าใช้ไม่ได้
    db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
      .run(user.id, hashToken(token), Date.now() + RESET_TTL_MS);
    const link = `${appUrl(req)}/?reset=${token}`;

    const sent = await sendEmail({
      to: user.email,
      subject: 'ตั้งรหัสผ่านใหม่ - เป๋ายา',
      text: `สวัสดีคุณ${user.first_name}\n\nกดลิงก์นี้เพื่อตั้งรหัสผ่านใหม่ (ใช้ได้ 30 นาที):\n${link}\n\nถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ`,
      html: `<div style="font-family:sans-serif;line-height:1.6"><p>สวัสดีคุณ${user.first_name}</p>
        <p>กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ (ลิงก์ใช้ได้ 30 นาที)</p>
        <p><a href="${link}" style="background:#388E3C;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;display:inline-block">ตั้งรหัสผ่านใหม่</a></p>
        <p style="color:#666;font-size:13px">ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ</p></div>`,
    });

    if (!sent) {
      if (process.env.NODE_ENV === 'production') {
        console.warn(`[ลืมรหัสผ่าน] ส่งอีเมลไม่ได้ (${isEmailConfigured() ? 'บริการอีเมลขัดข้อง' : 'ยังไม่ได้ตั้ง RESEND_API_KEY / EMAIL_FROM'}) สำหรับผู้ใช้ id ${user.id}`);
      } else {
        console.log(`\n[ลืมรหัสผ่าน] ลิงก์ตั้งรหัสใหม่สำหรับ ${user.email}:\n${link}\n`);
        response.devResetToken = token; // โหมดพัฒนาเท่านั้น
      }
    }
  }
  res.json(response);
});

router.post('/reset-password', resetLimit, (req, res) => {
  const token = str(req.body?.token, 200);
  validatePassword(req.body?.password);
  const row = token
    ? db.prepare('SELECT * FROM password_resets WHERE token_hash = ? AND used = 0').get(hashToken(token))
    : null;
  if (!row || row.expires_at < Date.now()) throw new HttpError(400, 'ลิงก์หมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่');

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(req.body.password), row.user_id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ?').run(row.user_id);
  endAllSessions(row.user_id); // ออกจากระบบทุกเครื่อง เผื่อมีคนแอบใช้บัญชีอยู่
  clearSessionCookie(res);
  res.json({ message: 'ตั้งรหัสผ่านใหม่เรียบร้อย กรุณาเข้าสู่ระบบ' });
});

module.exports = router;
