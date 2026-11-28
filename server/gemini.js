// เรียก Google Gemini API + แปลข้อผิดพลาดให้อ่านเข้าใจ + สลับไปใช้โมเดลสำรองเมื่อรุ่นที่ตั้งไว้ใช้ไม่ได้
const { HttpError } = require('./util');

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const IS_PROD = process.env.NODE_ENV === 'production';

// ลำดับโมเดลที่จะลอง: รุ่นที่ตั้งใน .env ก่อน แล้วค่อยรุ่นสำรอง
const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];
const modelCandidates = () => [...new Set([process.env.GEMINI_MODEL, ...FALLBACK_MODELS].filter(Boolean))];
let workingModel = null; // จำรุ่นที่ใช้ได้ล่าสุด

// ตัดช่องว่าง/เครื่องหมายคำพูดที่ติดมาตอนวาง
function getKey() {
  return String(process.env.GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');
}
const hasGemini = () => Boolean(getKey());

// ตรวจรูปแบบ key เบื้องต้น คืนข้อความเตือน หรือ null
function keyFormatProblem(key = getKey()) {
  if (!key) return 'ยังไม่ได้ใส่ GEMINI_API_KEY ในไฟล์ .env';
  if (/\s/.test(key)) return 'key มีช่องว่างอยู่ข้างใน';
  if (/^AIzaSy.*\./.test(key) || /key$/i.test(key)) return 'key น่าจะมีข้อความตัวอย่างติดมาด้วย (เช่น "AIzaSy" ด้านหน้า หรือคำว่า "key" ด้านท้าย) ให้ก๊อปจาก AI Studio มาวางใหม่ทั้งหมด';
  if (!/^(AIza[\w-]{30,}|AQ\.[\w.-]{20,})$/.test(key)) return 'รูปแบบ key ไม่เหมือน key ของ Google AI Studio (ปกติขึ้นต้นด้วย AIza หรือ AQ.)';
  return null;
}

// แปลง error จาก Google เป็นภาษาไทย
function explain(status, bodyText) {
  let reason = '';
  let message = '';
  try {
    const err = JSON.parse(bodyText).error || {};
    message = err.message || '';
    reason = (err.details || []).map((d) => d.reason).find(Boolean) || err.status || '';
  } catch { /* ไม่ใช่ JSON */ }
  const text = `${reason} ${message}`;
  if (/API_KEY_INVALID|API key not valid|API_KEY/i.test(text)) return { code: 'bad_key', th: 'API key ไม่ถูกต้อง ให้ก๊อป key จาก Google AI Studio มาวางใหม่' };
  if (/free tier is not available|set up billing|BILLING/i.test(text)) return { code: 'billing', th: 'โปรเจกต์ Google ของ key นี้ใช้ Gemini แบบฟรีไม่ได้ ต้องเปิด billing ที่ https://aistudio.google.com/billing ก่อน' };
  if (status === 403 || /PERMISSION_DENIED|SERVICE_DISABLED/i.test(text)) return { code: 'forbidden', th: 'key นี้ไม่มีสิทธิ์ใช้ Gemini API (อาจเป็น key ของบริการอื่น หรือยังไม่ได้เปิดใช้ Generative Language API)' };
  if (status === 404 || /NOT_FOUND|is not found|not supported/i.test(text)) return { code: 'no_model', th: 'ไม่พบโมเดลที่ตั้งไว้' };
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(text)) return { code: 'quota', th: 'ใช้โควตาฟรีของ Gemini หมดแล้วชั่วคราว รอสักครู่แล้วลองใหม่ (หรือเปิด billing ใน AI Studio)' };
  if (/location is not supported|FAILED_PRECONDITION/i.test(text)) return { code: 'region', th: 'บัญชี/ประเทศนี้ยังใช้ Gemini API แบบฟรีไม่ได้ (FAILED_PRECONDITION)' };
  if (status >= 500) return { code: 'server', th: 'ระบบของ Google ขัดข้องชั่วคราว ลองใหม่อีกครั้ง' };
  return { code: 'other', th: `Gemini ตอบกลับ error ${status}${message ? `: ${message.slice(0, 150)}` : ''}` };
}

async function requestModel(model, body) {
  let res;
  try {
    res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': getKey() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });
  } catch (err) {
    const timeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    return { ok: false, info: { code: 'network', th: timeout ? 'AI ตอบช้าเกินไป ลองใหม่อีกครั้ง' : `เชื่อมต่อ Google ไม่ได้ (${err.cause?.code || err.message}) ตรวจสอบอินเทอร์เน็ตของเซิร์ฟเวอร์` } };
  }
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, info: explain(res.status, text), raw: text };
  return { ok: true, data: JSON.parse(text) };
}

// เรียก Gemini: คืนข้อความคำตอบ หรือโยน HttpError พร้อมเหตุผลภาษาไทย
async function callGemini({ system, contents, json = false, maxTokens }) {
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { temperature: 0.3, ...(maxTokens ? { maxOutputTokens: maxTokens } : {}), ...(json ? { responseMimeType: "application/json" } : {}) },
  };
  const models = workingModel ? [workingModel, ...modelCandidates().filter((m) => m !== workingModel)] : modelCandidates();
  let last = null;
  for (const model of models) {
    const r = await requestModel(model, body);
    if (r.ok) {
      if (workingModel !== model) {
        if (process.env.GEMINI_MODEL && model !== process.env.GEMINI_MODEL) console.warn(`[AI] ใช้โมเดล ${process.env.GEMINI_MODEL} ไม่ได้ เปลี่ยนไปใช้ ${model} แทน`);
        workingModel = model;
      }
      const cand = r.data.candidates?.[0];
      const out = cand?.content?.parts?.map((p) => p.text || '').join('') || '';
      if (!out) {
        const blocked = r.data.promptFeedback?.blockReason || cand?.finishReason;
        throw new HttpError(422, blocked === 'SAFETY' || blocked === 'PROHIBITED_CONTENT'
          ? 'AI ไม่สามารถตอบคำถามนี้ได้ ลองถามใหม่ด้วยถ้อยคำอื่น'
          : 'AI ไม่ได้ส่งคำตอบกลับมา ลองใหม่อีกครั้ง');
      }
      return out;
    }
    last = r;
    console.error(`[AI] Gemini error (${model}) ${r.status || ''} ${r.info.code}: ${r.info.th}${r.raw ? `\n${r.raw.slice(0, 400)}` : ''}`);
    if (r.info.code !== 'no_model') break; // ลองรุ่นถัดไปเฉพาะกรณีหาโมเดลไม่เจอ
  }
  const hint = last.info.code === 'no_model' ? 'ไม่พบโมเดล Gemini ที่ใช้ได้ ลองตั้ง GEMINI_MODEL ใหม่' : last.info.th;
  // โหมดพัฒนา: บอกสาเหตุบนหน้าเว็บด้วย จะได้แก้ง่าย / production: ข้อความทั่วไป (รายละเอียดอยู่ใน log)
  throw new HttpError(last.info.code === 'quota' ? 429 : 502,
    IS_PROD && !['quota', 'network'].includes(last.info.code) ? 'บริการ AI ไม่ตอบสนอง กรุณาลองใหม่อีกครั้ง' : `บริการ AI ใช้ไม่ได้: ${hint}`);
}

async function listModels() {
  const res = await fetch(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': getKey() }, signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, info: explain(res.status, text), raw: text };
  const models = (JSON.parse(text).models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''));
  return { ok: true, models };
}

const currentModel = () => workingModel || modelCandidates()[0];

module.exports = { callGemini, hasGemini, keyFormatProblem, listModels, currentModel, modelCandidates };