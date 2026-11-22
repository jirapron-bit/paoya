// จำกัดจำนวนครั้งที่เรียกได้ต่อช่วงเวลา (กันเดารหัสผ่าน / ยิง API ถล่ม)
// เก็บในหน่วยความจำของเซิร์ฟเวอร์ ใช้ได้เมื่อรันเซิร์ฟเวอร์ตัวเดียว (กรณีทั่วไปของ SQLite)

class Limiter {
  constructor({ windowMs, max }) {
    this.windowMs = windowMs;
    this.max = max;
    this.hits = new Map(); // key -> { count, resetAt }
    setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    }, Math.min(windowMs, 60_000)).unref();
  }

  _entry(key) {
    const now = Date.now();
    let e = this.hits.get(key);
    if (!e || e.resetAt <= now) {
      e = { count: 0, resetAt: now + this.windowMs };
      this.hits.set(key, e);
    }
    return e;
  }

  // ถูกบล็อกอยู่หรือไม่ (ไม่นับเพิ่ม) คืนจำนวนวินาทีที่ต้องรอ หรือ 0
  blockedFor(key) {
    const e = this.hits.get(key);
    if (!e || e.resetAt <= Date.now() || e.count < this.max) return 0;
    return Math.ceil((e.resetAt - Date.now()) / 1000);
  }

  hit(key) {
    this._entry(key).count += 1;
  }

  reset(key) {
    this.hits.delete(key);
  }
}

function tooMany(res, seconds, message) {
  res.set('Retry-After', String(seconds));
  const minutes = Math.ceil(seconds / 60);
  return res.status(429).json({ error: `${message} กรุณาลองใหม่ในอีก ${minutes} นาที`, retryAfter: seconds });
}

// middleware: นับทุกคำขอ
function rateLimit({ windowMs, max, key = (req) => req.ip, message = 'เรียกใช้งานถี่เกินไป' }) {
  const limiter = new Limiter({ windowMs, max });
  return (req, res, next) => {
    const k = key(req);
    const wait = limiter.blockedFor(k);
    if (wait) return tooMany(res, wait, message);
    limiter.hit(k);
    next();
  };
}

module.exports = { Limiter, rateLimit, tooMany };
