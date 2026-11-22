// ค้นหาข้อมูลยาจากบัญชียาหลักแห่งชาติ + ติดดาว + ประวัติการเปิดดู
const express = require('express');
const { db } = require('../db');
const { requireAuth, optionalAuth } = require('../auth');
const { HttpError, str, int, allergyMatches } = require('../util');

const router = express.Router();

function toMedicine(row, favSet) {
  return {
    id: row.id,
    no: row.no,
    genericName: row.generic_name,
    dosageForm: row.dosage_form,
    strength: row.strength,
    mainGroup: row.main_group,
    subgroup: row.subgroup,
    accountOld: row.account_old,
    accountNew: row.account_new,
    changeCode: row.change_code,
    changeDetail: row.change_detail,
    conditions: row.conditions,
    remarks: row.remarks,
    announcedAt: row.announced_at,
    isFavorite: favSet ? favSet.has(row.id) : false,
  };
}

const favoriteSet = (userId) =>
  new Set(userId ? db.prepare('SELECT medicine_id FROM favorites WHERE user_id = ?').all(userId).map((r) => r.medicine_id) : []);

// รายการหมวดหมู่หลัก
router.get('/categories', (_req, res) => {
  const rows = db.prepare(
    'SELECT main_group AS name, COUNT(*) AS count FROM medicines GROUP BY main_group ORDER BY MIN(id)'
  ).all();
  res.json({ categories: rows });
});

// รายชื่อยาแบบสั้น (ไม่ซ้ำชื่อ) สำหรับจับคู่ข้อความจากกล้องสแกนในเบราว์เซอร์
router.get('/names', (_req, res) => {
  const rows = db.prepare('SELECT MIN(id) AS id, generic_name AS name FROM medicines GROUP BY generic_name ORDER BY name').all();
  res.json({ items: rows });
});

// ค้นหา: /api/medicines?q=para&category=...&limit=30&offset=0
router.get('/', optionalAuth, (req, res) => {
  const q = str(req.query.q, 100);
  const category = str(req.query.category, 200);
  const limit = int(req.query.limit, { min: 1, max: 100, fallback: 30 });
  const offset = int(req.query.offset, { min: 0, max: 100000, fallback: 0 });

  const where = [];
  const params = [];
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    where.push(`(generic_name LIKE ? ESCAPE '\\' OR dosage_form LIKE ? ESCAPE '\\' OR subgroup LIKE ? ESCAPE '\\' OR main_group LIKE ? ESCAPE '\\')`);
    params.push(like, like, like, like);
  }
  if (category) {
    where.push('main_group = ?');
    params.push(category);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  // ชื่อที่ขึ้นต้นด้วยคำค้นมาก่อน
  const orderSql = q ? 'ORDER BY (generic_name LIKE ?) DESC, generic_name, id' : 'ORDER BY id';
  const orderParams = q ? [`${q}%`] : [];

  const total = db.prepare(`SELECT COUNT(*) AS n FROM medicines ${whereSql}`).get(...params).n;
  const rows = db.prepare(`SELECT * FROM medicines ${whereSql} ${orderSql} LIMIT ? OFFSET ?`)
    .all(...params, ...orderParams, limit, offset);
  const favs = favoriteSet(req.userId);
  res.json({ total, items: rows.map((r) => toMedicine(r, favs)) });
});

router.get('/favorites', requireAuth, (req, res) => {
  const rows = db.prepare(
    `SELECT m.* FROM favorites f JOIN medicines m ON m.id = f.medicine_id
     WHERE f.user_id = ? ORDER BY f.created_at DESC`
  ).all(req.userId);
  res.json({ items: rows.map((r) => toMedicine(r, new Set(rows.map((x) => x.id)))) });
});

router.get('/recent', requireAuth, (req, res) => {
  const rows = db.prepare(
    `SELECT m.* FROM recent_views v JOIN medicines m ON m.id = v.medicine_id
     WHERE v.user_id = ? ORDER BY v.viewed_at DESC LIMIT 8`
  ).all(req.userId);
  const favs = favoriteSet(req.userId);
  res.json({ items: rows.map((r) => toMedicine(r, favs)) });
});

router.delete('/recent', requireAuth, (req, res) => {
  db.prepare('DELETE FROM recent_views WHERE user_id = ?').run(req.userId);
  res.json({ ok: true });
});

// รายละเอียดยา + บันทึกประวัติการเปิดดู + เตือนถ้าตรงกับยาที่แพ้
router.get('/:id', optionalAuth, (req, res) => {
  const id = int(req.params.id, { min: 1 });
  const row = id && db.prepare('SELECT * FROM medicines WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'ไม่พบข้อมูลยา');

  let allergyWarnings = [];
  if (req.userId) {
    db.prepare(
      `INSERT INTO recent_views (user_id, medicine_id) VALUES (?, ?)
       ON CONFLICT(user_id, medicine_id) DO UPDATE SET viewed_at = strftime('%Y-%m-%d %H:%M:%f', 'now')`
    ).run(req.userId, id);
    const allergies = db.prepare('SELECT * FROM allergies WHERE user_id = ?').all(req.userId);
    allergyWarnings = allergyMatches(allergies, row.generic_name)
      .map((a) => ({ drugName: a.drug_name, symptom: a.symptom, severity: a.severity }));
  }

  const otherForms = db.prepare(
    'SELECT * FROM medicines WHERE generic_name = ? AND id != ? ORDER BY id LIMIT 20'
  ).all(row.generic_name, id);
  const favs = favoriteSet(req.userId);
  res.json({
    medicine: toMedicine(row, favs),
    otherForms: otherForms.map((r) => toMedicine(r, favs)),
    allergyWarnings,
  });
});

router.put('/:id/favorite', requireAuth, (req, res) => {
  const id = int(req.params.id, { min: 1 });
  if (!id || !db.prepare('SELECT 1 FROM medicines WHERE id = ?').get(id)) throw new HttpError(404, 'ไม่พบข้อมูลยา');
  db.prepare('INSERT OR IGNORE INTO favorites (user_id, medicine_id) VALUES (?, ?)').run(req.userId, id);
  res.json({ isFavorite: true });
});

router.delete('/:id/favorite', requireAuth, (req, res) => {
  db.prepare('DELETE FROM favorites WHERE user_id = ? AND medicine_id = ?').run(req.userId, int(req.params.id));
  res.json({ isFavorite: false });
});

module.exports = router;
module.exports.toMedicine = toMedicine;
