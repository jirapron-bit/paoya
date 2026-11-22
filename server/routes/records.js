// ข้อมูลส่วนตัวของผู้ใช้แต่ละประเภท: ยาประจำ, นัดหมาย, ประวัติแพ้ยา, บันทึกสุขภาพ
// ทุกประเภทใช้รูปแบบเดียวกัน: GET / POST / PUT /:id / DELETE /:id
const express = require('express');
const { db } = require('../db');
const { HttpError, str, int, num, allergyMatches } = require('../util');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

// field: ชื่อคอลัมน์ในฐานข้อมูล, key: ชื่อที่ใช้ใน JSON, parse: แปลง/ตรวจค่า
const resources = {
  meds: {
    table: 'my_meds',
    order: 'id',
    fields: [
      { field: 'name', key: 'name', parse: (v) => str(v, 200), required: 'กรุณากรอกชื่อยา' },
      { field: 'dosage', key: 'dosage', parse: (v) => str(v, 100) },
      { field: 'time_note', key: 'time', parse: (v) => str(v, 200) },
      { field: 'daily_dose', key: 'dailyDose', parse: (v) => num(v, { min: 0, max: 100, fallback: 1 }) },
      { field: 'total_capacity', key: 'totalCapacity', parse: (v) => int(v, { min: 1, max: 100000, fallback: 30 }) },
      { field: 'stock', key: 'stock', parse: (v) => int(v, { min: 0, max: 100000, fallback: 0 }) },
    ],
  },
  appointments: {
    table: 'appointments',
    order: 'date, time',
    fields: [
      { field: 'hospital', key: 'hospital', parse: (v) => str(v, 200), required: 'กรุณากรอกชื่อโรงพยาบาล/คลินิก' },
      { field: 'doctor', key: 'doctor', parse: (v) => str(v, 200) },
      { field: 'date', key: 'date', parse: (v) => (DATE_RE.test(str(v)) ? str(v) : ''), required: 'กรุณาเลือกวันที่' },
      { field: 'time', key: 'time', parse: (v) => (TIME_RE.test(str(v)) ? str(v) : '') },
      { field: 'note', key: 'note', parse: (v) => str(v, 500) },
    ],
  },
  allergies: {
    table: 'allergies',
    order: 'id',
    fields: [
      { field: 'drug_name', key: 'drugName', parse: (v) => str(v, 200), required: 'กรุณากรอกชื่อยาที่แพ้' },
      { field: 'symptom', key: 'symptom', parse: (v) => str(v, 300) },
      {
        field: 'severity', key: 'severity',
        parse: (v) => (['เล็กน้อย', 'รุนแรงปานกลาง', 'รุนแรงมาก'].includes(v) ? v : 'รุนแรงปานกลาง'),
      },
    ],
  },
  vitals: {
    table: 'vitals',
    order: 'date DESC, id DESC',
    fields: [
      { field: 'date', key: 'date', parse: (v) => (DATE_RE.test(str(v)) ? str(v) : ''), required: 'กรุณาเลือกวันที่' },
      { field: 'systolic', key: 'systolic', parse: (v) => int(v, { min: 40, max: 300 }) },
      { field: 'diastolic', key: 'diastolic', parse: (v) => int(v, { min: 20, max: 200 }) },
      { field: 'pulse', key: 'pulse', parse: (v) => int(v, { min: 20, max: 250 }) },
      { field: 'sugar', key: 'sugar', parse: (v) => int(v, { min: 10, max: 1000 }) },
      { field: 'note', key: 'note', parse: (v) => str(v, 500) },
    ],
  },
};

function makeRouter({ table, order, fields }) {
  const router = express.Router();
  const toJSON = (row) => {
    const out = { id: row.id };
    for (const f of fields) out[f.key] = row[f.field];
    return out;
  };
  const parseBody = (body = {}) => {
    const values = {};
    for (const f of fields) {
      const v = f.parse(body[f.key]);
      if (f.required && (v === '' || v === null)) throw new HttpError(400, f.required);
      values[f.field] = v;
    }
    return values;
  };
  const getOwned = (req) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`).get(int(req.params.id), req.userId);
    if (!row) throw new HttpError(404, 'ไม่พบรายการนี้');
    return row;
  };

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM ${table} WHERE user_id = ? ORDER BY ${order}`).all(req.userId);
    res.json({ items: rows.map(toJSON) });
  });

  router.post('/', (req, res) => {
    const v = parseBody(req.body);
    const cols = Object.keys(v);
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO ${table} (user_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`
    ).run(req.userId, ...cols.map((c) => v[c]));
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(lastInsertRowid);
    res.status(201).json({ item: toJSON(row), ...extraInfo(table, req.userId, row) });
  });

  router.put('/:id', (req, res) => {
    getOwned(req);
    const v = parseBody(req.body);
    const cols = Object.keys(v);
    db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND user_id = ?`)
      .run(...cols.map((c) => v[c]), int(req.params.id), req.userId);
    const row = getOwned(req);
    res.json({ item: toJSON(row), ...extraInfo(table, req.userId, row) });
  });

  router.delete('/:id', (req, res) => {
    getOwned(req);
    db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).run(int(req.params.id), req.userId);
    res.json({ ok: true });
  });

  return { router, toJSON, getOwned };
}

// เพิ่มยาประจำที่ตรงกับยาที่แพ้ → แนบคำเตือนกลับไป
function extraInfo(table, userId, row) {
  if (table !== 'my_meds') return {};
  const allergies = db.prepare('SELECT * FROM allergies WHERE user_id = ?').all(userId);
  const hits = allergyMatches(allergies, row.name);
  return hits.length ? { allergyWarnings: hits.map((a) => ({ drugName: a.drug_name, symptom: a.symptom, severity: a.severity })) } : {};
}

const built = Object.fromEntries(Object.entries(resources).map(([k, cfg]) => [k, makeRouter(cfg)]));

// เติมสต็อกยาแบบเร็ว: POST /api/meds/:id/refill { amount: 10 }
built.meds.router.post('/:id/refill', (req, res) => {
  const row = built.meds.getOwned(req);
  const amount = int(req.body?.amount, { min: 1, max: 10000 });
  if (!amount) throw new HttpError(400, 'จำนวนที่เติมไม่ถูกต้อง');
  db.prepare('UPDATE my_meds SET stock = stock + ? WHERE id = ?').run(amount, row.id);
  res.json({ item: built.meds.toJSON(built.meds.getOwned(req)) });
});

// ดาวน์โหลดนัดหมายเป็นไฟล์ปฏิทิน (.ics)
built.appointments.router.get('/:id/calendar.ics', (req, res) => {
  const a = built.appointments.getOwned(req);
  const esc = (s) => String(s || '').replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
  const [h, m] = (a.time || '09:00').split(':').map(Number);
  const d = a.date.replace(/-/g, '');
  const pad = (n) => String(n).padStart(2, '0');
  const start = `${d}T${pad(h)}${pad(m)}00`;
  const end = `${d}T${pad(Math.min(h + 1, 23))}${pad(m)}00`;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PAOYA//TH', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:paoya-appt-${a.id}@paoya`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=Asia/Bangkok:${start}`,
    `DTEND;TZID=Asia/Bangkok:${end}`,
    `SUMMARY:${esc(`นัดหมายแพทย์: ${a.hospital}${a.doctor ? ` (${a.doctor})` : ''}`)}`,
    `LOCATION:${esc(a.hospital)}`,
    `DESCRIPTION:${esc(a.note || 'บันทึกโดยแอปเป๋ายา')}`,
    'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:พรุ่งนี้มีนัดพบแพทย์', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="appointment-${a.date}.ics"`);
  res.send(ics);
});

module.exports = Object.fromEntries(Object.entries(built).map(([k, v]) => [k, v.router]));
