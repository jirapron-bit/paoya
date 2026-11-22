// ฟังก์ชันช่วยเล็ก ๆ ที่ใช้หลายไฟล์

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const str = (v, max = 500) => (v === undefined || v === null ? '' : String(v).trim().slice(0, max));

function num(v, { min = -Infinity, max = Infinity, fallback = null } = {}) {
  if (v === '' || v === undefined || v === null) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

function int(v, opts) {
  const n = num(v, opts);
  return n === null ? (opts?.fallback ?? null) : Math.round(n);
}

function parseJSON(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
  if (pw.length > 200) throw new HttpError(400, 'รหัสผ่านยาวเกินไป');
  if (/^(.)\1+$/.test(pw) || /^(12345678|password|11111111|qwertyui)/i.test(pw)) {
    throw new HttpError(400, 'รหัสผ่านนี้เดาง่ายเกินไป กรุณาตั้งใหม่');
  }
}

// ชื่อยาที่ผู้ใช้แพ้ ตรงกับชื่อยานี้หรือไม่ (เทียบแบบไม่สนตัวพิมพ์ ทั้งสองทาง)
function allergyMatches(allergies, drugName) {
  const name = String(drugName || '').toLowerCase().trim();
  if (!name) return [];
  return allergies.filter((a) => {
    const allergen = String(a.drug_name || '').toLowerCase().trim();
    if (allergen.length < 3) return allergen === name;
    const firstWord = name.split(/[\s(,]/)[0];
    return name.includes(allergen) || (firstWord.length >= 4 && allergen.includes(firstWord));
  });
}

module.exports = { HttpError, str, num, int, parseJSON, allergyMatches, validatePassword };
