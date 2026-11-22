// ฐานข้อมูล SQLite (ใช้ node:sqlite ที่มากับ Node.js 22.13+ ไม่ต้องติดตั้งอะไรเพิ่ม)
require('dotenv').config({ quiet: true });
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'paoya.db');
const MEDICINES_JSON = path.join(__dirname, '..', 'data', 'medicines.json');

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    age INTEGER,
    blood_type TEXT,
    weight REAL,
    height REAL,
    chronic_diseases TEXT NOT NULL DEFAULT '[]',
    emergency_contact TEXT,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    settings TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- แต่ละครั้งที่เข้าสู่ระบบ = 1 เซสชัน ลบแถวนี้ = บังคับออกจากระบบทันที
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    user_agent TEXT,
    ip TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS medicines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    no INTEGER,
    main_group TEXT,
    subgroup TEXT,
    generic_name TEXT NOT NULL,
    dosage_form TEXT,
    strength TEXT,
    account_old TEXT,
    account_new TEXT,
    change_code TEXT,
    change_detail TEXT,
    conditions TEXT,
    remarks TEXT,
    announced_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_medicines_name ON medicines(generic_name);

  CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, medicine_id)
  );

  CREATE TABLE IF NOT EXISTS recent_views (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
    viewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    PRIMARY KEY (user_id, medicine_id)
  );

  CREATE TABLE IF NOT EXISTS my_meds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    dosage TEXT,
    time_note TEXT,
    daily_dose REAL NOT NULL DEFAULT 1,
    total_capacity INTEGER NOT NULL DEFAULT 30,
    stock INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hospital TEXT NOT NULL,
    doctor TEXT,
    date TEXT NOT NULL,
    time TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS allergies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    drug_name TEXT NOT NULL,
    symptom TEXT,
    severity TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    systolic INTEGER,
    diastolic INTEGER,
    pulse INTEGER,
    sugar INTEGER,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const MED_FIELDS = ['no', 'main_group', 'subgroup', 'generic_name', 'dosage_form', 'strength',
  'account_old', 'account_new', 'change_code', 'change_detail', 'conditions', 'remarks', 'announced_at'];

function loadMedicines({ reset = false } = {}) {
  if (reset) {
    db.exec('DELETE FROM favorites; DELETE FROM recent_views; DELETE FROM medicines;');
  }
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM medicines').get();
  if (n > 0) return n;
  if (!fs.existsSync(MEDICINES_JSON)) {
    console.warn('ไม่พบ data/medicines.json — ข้ามการโหลดข้อมูลยา');
    return 0;
  }
  const rows = JSON.parse(fs.readFileSync(MEDICINES_JSON, 'utf8'));
  const insert = db.prepare(
    `INSERT INTO medicines (${MED_FIELDS.join(', ')}) VALUES (${MED_FIELDS.map(() => '?').join(', ')})`
  );
  db.exec('BEGIN');
  try {
    for (const r of rows) insert.run(...MED_FIELDS.map((f) => r[f] ?? (f === 'no' ? 0 : '')));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  console.log(`โหลดข้อมูลยา ${rows.length} รายการเข้าฐานข้อมูลแล้ว`);
  return rows.length;
}

loadMedicines();

if (require.main === module && process.argv.includes('--reset-medicines')) {
  const n = loadMedicines({ reset: true });
  console.log(`รีเซ็ตข้อมูลยาเรียบร้อย (${n} รายการ)`);
}

module.exports = { db, loadMedicines };
