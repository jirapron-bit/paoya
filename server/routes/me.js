// ข้อมูลส่วนตัว การตั้งค่า และภาพรวมของผู้ใช้
const express = require('express');
const { db } = require('../db');
const { hashPassword, verifyPassword, endAllSessions, clearSessionCookie } = require('../auth');
const { HttpError, str, num, int, parseJSON, validatePassword } = require('../util');

const router = express.Router();

const DEFAULT_SETTINGS = {
  notifications: { enableAll: true, sound: true, vibrate: true, refillReminder: true },
  largeText: false,
};
const BLOOD_TYPES = ['', 'A', 'B', 'AB', 'O'];

function publicUser(u) {
  const settings = parseJSON(u.settings, {});
  return {
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    age: u.age,
    bloodType: u.blood_type || '',
    weight: u.weight,
    height: u.height,
    chronicDiseases: parseJSON(u.chronic_diseases, []),
    emergencyContact: u.emergency_contact || '',
    email: u.email,
    username: u.username,
    settings: {
      ...DEFAULT_SETTINGS,
      ...settings,
      notifications: { ...DEFAULT_SETTINGS.notifications, ...(settings.notifications || {}) },
    },
  };
}

const getUser = (id) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) throw new HttpError(401, 'ไม่พบบัญชีผู้ใช้ กรุณาเข้าสู่ระบบใหม่');
  return u;
};

router.get('/', (req, res) => res.json({ user: publicUser(getUser(req.userId)) }));

router.put('/', (req, res) => {
  const b = req.body || {};
  const firstName = str(b.firstName, 100);
  const lastName = str(b.lastName, 100);
  if (!firstName || !lastName) throw new HttpError(400, 'กรุณากรอกชื่อและนามสกุล');
  const bloodType = BLOOD_TYPES.includes(b.bloodType) ? b.bloodType : '';
  const diseases = Array.isArray(b.chronicDiseases)
    ? [...new Set(b.chronicDiseases.map((d) => str(d, 100)).filter(Boolean))].slice(0, 30)
    : [];

  db.prepare(
    `UPDATE users SET first_name = ?, last_name = ?, age = ?, blood_type = ?, weight = ?, height = ?,
       chronic_diseases = ?, emergency_contact = ? WHERE id = ?`
  ).run(
    firstName, lastName,
    int(b.age, { min: 1, max: 130 }),
    bloodType,
    num(b.weight, { min: 1, max: 500 }),
    num(b.height, { min: 30, max: 300 }),
    JSON.stringify(diseases),
    str(b.emergencyContact, 30),
    req.userId
  );
  res.json({ user: publicUser(getUser(req.userId)) });
});

router.put('/settings', (req, res) => {
  const current = publicUser(getUser(req.userId)).settings;
  const b = req.body || {};
  const next = {
    largeText: typeof b.largeText === 'boolean' ? b.largeText : current.largeText,
    notifications: { ...current.notifications },
  };
  for (const k of Object.keys(DEFAULT_SETTINGS.notifications)) {
    if (typeof b.notifications?.[k] === 'boolean') next.notifications[k] = b.notifications[k];
  }
  db.prepare('UPDATE users SET settings = ? WHERE id = ?').run(JSON.stringify(next), req.userId);
  res.json({ user: publicUser(getUser(req.userId)) });
});

router.put('/password', (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const u = getUser(req.userId);
  if (typeof currentPassword !== 'string' || !verifyPassword(currentPassword, u.password_hash)) {
    throw new HttpError(400, 'รหัสผ่านเดิมไม่ถูกต้อง');
  }
  validatePassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), req.userId);
  endAllSessions(req.userId, req.sessionId); // อุปกรณ์อื่นต้องเข้าสู่ระบบใหม่
  res.json({ message: 'เปลี่ยนรหัสผ่านเรียบร้อย อุปกรณ์อื่นถูกออกจากระบบแล้ว' });
});

// ลบบัญชีและข้อมูลสุขภาพทั้งหมดของผู้ใช้
router.delete('/', (req, res) => {
  const u = getUser(req.userId);
  if (typeof req.body?.password !== 'string' || !verifyPassword(req.body.password, u.password_hash)) {
    throw new HttpError(400, 'รหัสผ่านไม่ถูกต้อง');
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.userId); // เซสชันถูกลบตามไปด้วย (ON DELETE CASCADE)
  clearSessionCookie(res);
  res.json({ message: 'ลบบัญชีเรียบร้อย' });
});

// อุปกรณ์ที่เข้าสู่ระบบอยู่
function deviceName(ua = '') {
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : '';
  return [browser, os].filter(Boolean).join(' บน ') || 'อุปกรณ์ไม่ทราบชื่อ';
}

router.get('/sessions', (req, res) => {
  const rows = db.prepare('SELECT * FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC')
    .all(req.userId, Date.now());
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      device: deviceName(r.user_agent || ''),
      createdAt: new Date(r.created_at).toISOString(),
      lastSeenAt: new Date(r.last_seen_at).toISOString(),
      current: r.id === req.sessionId,
    })),
  });
});

router.delete('/sessions/:id', (req, res) => {
  const r = db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(String(req.params.id), req.userId);
  if (!r.changes) throw new HttpError(404, 'ไม่พบอุปกรณ์นี้');
  if (req.params.id === req.sessionId) clearSessionCookie(res);
  res.json({ ok: true });
});

// ออกจากระบบอุปกรณ์อื่นทั้งหมด (เครื่องนี้ยังอยู่)
router.post('/sessions/revoke-others', (req, res) => {
  const r = endAllSessions(req.userId, req.sessionId);
  res.json({ ok: true, revoked: r.changes });
});

// ภาพรวมสำหรับหน้าแรก: ยาใกล้หมด นัดถัดไป จำนวนรายการ
router.get('/summary', (req, res) => {
  const meds = db.prepare('SELECT * FROM my_meds WHERE user_id = ?').all(req.userId);
  const lowStock = meds
    .map((m) => ({ id: m.id, name: m.name, stock: m.stock, daysLeft: m.daily_dose > 0 ? Math.floor(m.stock / m.daily_dose) : null }))
    .filter((m) => m.daysLeft !== null && m.daysLeft <= 3);
  const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD ตามเวลาเครื่อง
  const nextAppointment = db.prepare(
    'SELECT * FROM appointments WHERE user_id = ? AND date >= ? ORDER BY date, time LIMIT 1'
  ).get(req.userId, today) || null;
  const count = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?`).get(req.userId).n;
  res.json({
    lowStock,
    nextAppointment,
    counts: { meds: meds.length, appointments: count('appointments'), allergies: count('allergies'), vitals: count('vitals') },
  });
});

module.exports = router;
module.exports.publicUser = publicUser;
