// ข้อมูลส่วนตัวของผู้ใช้แต่ละประเภท: ยาประจำ, นัดหมาย, ประวัติแพ้ยา, บันทึกสุขภาพ
// ทุกประเภทใช้รูปแบบเดียวกัน: GET / POST / PUT /:id / DELETE /:id
const express = require('express');
const { db } = require('../db');
const { HttpError, str, int, num, allergyMatches, parseJSON } = require('../util');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const VALID_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// เวลาเตือนกินยา: รับเป็น array เช่น ["08:00","20:00"] เก็บเป็น JSON (เรียงเวลา ไม่ซ้ำ ไม่เกิน 8 เวลา)
const parseTimes = (v) => {
  const list = Array.isArray(v) ? v : [];
  return JSON.stringify([...new Set(list.map((t) => str(t, 5)).filter((t) => VALID_TIME.test(t)))].sort().slice(0, 8));
};

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
      { field: 'reminder_times', key: 'reminderTimes', parse: parseTimes, out: (v) => parseJSON(v, []) },
      { field: 'dose_amount', key: 'doseAmount', parse: (v) => num(v, { min: 0.25, max: 20, fallback: 1 }) },
    ],
    // ถ้าตั้งเวลาเตือนไว้ ให้คำนวณ "วันละกี่เม็ด" จาก ครั้งละ x จำนวนเวลา
    finalize: (v) => {
      const times = JSON.parse(v.reminder_times);
      if (times.length) v.daily_dose = v.dose_amount * times.length;
      return v;
    },
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

function makeRouter({ table, order, fields, finalize = (v) => v }) {
  const router = express.Router();
  const toJSON = (row) => {
    const out = { id: row.id };
    for (const f of fields) out[f.key] = f.out ? f.out(row[f.field]) : row[f.field];
    return out;
  };
  const parseBody = (body = {}) => {
    const values = {};
    for (const f of fields) {
      const v = f.parse(body[f.key]);
      if (f.required && (v === '' || v === null)) throw new HttpError(400, f.required);
      values[f.field] = v;
    }
    return finalize(values);
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

// ---------- เตือนกินยา ----------
const medsDoseList = (userId, date) => {
  const meds = db.prepare('SELECT * FROM my_meds WHERE user_id = ? ORDER BY id').all(userId);
  const logs = db.prepare('SELECT * FROM dose_logs WHERE user_id = ? AND date = ?').all(userId, date);
  const logOf = new Map(logs.map((l) => [`${l.med_id}|${l.time}`, l]));
  const doses = [];
  for (const m of meds) {
    for (const time of parseJSON(m.reminder_times, [])) {
      const log = logOf.get(`${m.id}|${time}`);
      doses.push({
        medId: m.id, name: m.name, dosage: m.dosage, note: m.time_note, time,
        amount: m.dose_amount, stock: m.stock, status: log ? log.status : 'pending',
      });
    }
  }
  return doses.sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));
};

const reqDate = (v) => {
  const d = str(v, 10);
  if (!DATE_RE.test(d)) throw new HttpError(400, 'วันที่ไม่ถูกต้อง');
  return d;
};

// รายการยาที่ต้องกินวันนี้: GET /api/meds/today?date=2026-11-28 (ส่งวันที่ตามเครื่องผู้ใช้)
built.meds.router.get('/today', (req, res) => {
  const date = reqDate(req.query.date);
  const doses = medsDoseList(req.userId, date);
  res.json({ date, doses, taken: doses.filter((d) => d.status === 'taken').length, total: doses.length });
});

// บันทึกว่ากินแล้ว/ข้าม: POST /api/meds/:id/doses { date, time, status: 'taken' | 'skipped' }
// กินแล้ว = หักสต็อกตามจำนวนครั้งละ
built.meds.router.post('/:id/doses', (req, res) => {
  const med = built.meds.getOwned(req);
  const date = reqDate(req.body?.date);
  const time = str(req.body?.time, 5);
  const status = req.body?.status === 'skipped' ? 'skipped' : 'taken';
  if (!parseJSON(med.reminder_times, []).includes(time)) throw new HttpError(400, 'ยานี้ไม่ได้ตั้งเวลาเตือนตอนนี้');

  db.exec('BEGIN');
  try {
    const prev = db.prepare('SELECT * FROM dose_logs WHERE med_id = ? AND date = ? AND time = ?').get(med.id, date, time);
    if (prev?.status === 'taken') db.prepare('UPDATE my_meds SET stock = stock + ? WHERE id = ?').run(prev.amount, med.id);
    const amount = status === 'taken' ? med.dose_amount : 0;
    db.prepare(`INSERT INTO dose_logs (user_id, med_id, date, time, status, amount) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(med_id, date, time) DO UPDATE SET status = excluded.status, amount = excluded.amount, logged_at = CURRENT_TIMESTAMP`)
      .run(req.userId, med.id, date, time, status, amount);
    if (amount) db.prepare('UPDATE my_meds SET stock = MAX(0, stock - ?) WHERE id = ?').run(amount, med.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  res.json({ item: built.meds.toJSON(built.meds.getOwned(req)), status });
});

// ยกเลิกการบันทึก (กดผิด): DELETE /api/meds/:id/doses { date, time } → คืนสต็อก
built.meds.router.delete('/:id/doses', (req, res) => {
  const med = built.meds.getOwned(req);
  const date = reqDate(req.body?.date);
  const time = str(req.body?.time, 5);
  const prev = db.prepare('SELECT * FROM dose_logs WHERE med_id = ? AND date = ? AND time = ?').get(med.id, date, time);
  if (prev) {
    if (prev.status === 'taken') db.prepare('UPDATE my_meds SET stock = stock + ? WHERE id = ?').run(prev.amount, med.id);
    db.prepare('DELETE FROM dose_logs WHERE id = ?').run(prev.id);
  }
  res.json({ item: built.meds.toJSON(built.meds.getOwned(req)) });
});

// ปฏิทินเตือนกินยาทุกวัน (.ics) — เพิ่มเข้าปฏิทินมือถือ ให้มือถือเตือนแม้ปิดแอป
const ICS_TIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:Asia/Bangkok', 'BEGIN:STANDARD', 'DTSTART:19700101T000000',
  'TZOFFSETFROM:+0700', 'TZOFFSETTO:+0700', 'TZNAME:ICT', 'END:STANDARD', 'END:VTIMEZONE',
];
const icsEscape = (s) => String(s || '').replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');

built.meds.router.get('/reminders.ics', (req, res) => {
  const meds = db.prepare('SELECT * FROM my_meds WHERE user_id = ?').all(req.userId);
  const start = (str(req.query.from, 10).match(/^\d{4}-\d{2}-\d{2}$/) ? str(req.query.from, 10) : new Date().toLocaleDateString('sv-SE')).replace(/-/g, '');
  const stamp = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const events = [];
  for (const m of meds) {
    for (const t of parseJSON(m.reminder_times, [])) {
      const hhmm = t.replace(':', '');
      const what = `กินยา ${m.name}${m.dosage ? ` ${m.dosage}` : ''} (${m.dose_amount} เม็ด)`;
      events.push(
        'BEGIN:VEVENT',
        `UID:paoya-med-${m.id}-${hhmm}@paoya`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=Asia/Bangkok:${start}T${hhmm}00`,
        'DURATION:PT15M',
        'RRULE:FREQ=DAILY',
        `SUMMARY:${icsEscape(`💊 ${what}`)}`,
        `DESCRIPTION:${icsEscape(`${m.time_note ? `${m.time_note}\n` : ''}บันทึกว่ากินแล้วได้ในแอปเป๋ายา`)}`,
        'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(what)}`, 'END:VALARM',
        'END:VEVENT'
      );
    }
  }
  if (!events.length) throw new HttpError(400, 'ยังไม่ได้ตั้งเวลาเตือนให้ยาตัวไหนเลย');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PAOYA//TH', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:เตือนกินยา (เป๋ายา)', ...ICS_TIMEZONE, ...events, 'END:VCALENDAR'].join('\r\n');
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="paoya-reminders.ics"');
  res.send(ics);
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
    ...ICS_TIMEZONE,
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