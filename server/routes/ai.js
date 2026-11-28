// เภสัชกร AI (แชท) และอ่านฉลากยาจากภาพ
// ถ้าตั้ง GROQ_API_KEY หรือ GEMINI_API_KEY ใน .env จะใช้ AI (ดู server/llm.js); ถ้าไม่ตั้งจะใช้คำตอบสำเร็จรูป/จับคู่ชื่อยาจากฐานข้อมูล
// API key อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น ไม่ถูกส่งไปที่เบราว์เซอร์
const express = require('express');
const { db } = require('../db');
const { HttpError, str, parseJSON, allergyMatches } = require('../util');
const { toMedicine } = require('./medicines');
const { rateLimit } = require('../rateLimit');

const router = express.Router();
// จำกัดการใช้ AI ต่อผู้ใช้ (กันค่าใช้จ่าย API บานปลาย)
const chatLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: Number(process.env.AI_CHAT_LIMIT) || 30, key: (req) => `u${req.userId}`, message: 'ถามบ่อยเกินไป' });
const scanLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: Number(process.env.AI_SCAN_LIMIT) || 20, key: (req) => `u${req.userId}`, message: 'สแกนบ่อยเกินไป' });
const { callAI, hasAI, aiInfo } = require('../llm');

// เก็บผลสรุปข้อมูลยาจาก AI ไว้ (ยาตัวเดียวกันถามครั้งเดียว ประหยัดโควตา และเปิดเร็วขึ้น)
db.exec(`
  CREATE TABLE IF NOT EXISTS medicine_ai_info (
    cache_key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
const infoLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 40, key: (req) => `u${req.userId}`, message: 'ขอข้อมูลยาบ่อยเกินไป' });

const DISCLAIMER = 'ข้อมูลนี้เป็นคำแนะนำทั่วไป ไม่ใช่การวินิจฉัย หากอาการรุนแรงหรือไม่แน่ใจ โปรดปรึกษาแพทย์หรือเภสัชกร';

// ข้อมูลสุขภาพของผู้ใช้ ให้ AI ตอบได้ตรงตัวมากขึ้น
function userContext(userId) {
  const u = db.prepare('SELECT age, chronic_diseases FROM users WHERE id = ?').get(userId) || {};
  const allergies = db.prepare('SELECT drug_name, symptom FROM allergies WHERE user_id = ?').all(userId);
  const meds = db.prepare('SELECT name, dosage, time_note FROM my_meds WHERE user_id = ?').all(userId);
  return [
    u.age ? `อายุ ${u.age} ปี` : null,
    `โรคประจำตัว: ${parseJSON(u.chronic_diseases, []).join(', ') || 'ไม่มี/ไม่ระบุ'}`,
    `ประวัติแพ้ยา: ${allergies.map((a) => `${a.drug_name}${a.symptom ? ` (${a.symptom})` : ''}`).join(', ') || 'ไม่มี/ไม่ระบุ'}`,
    `ยาที่ใช้ประจำ: ${meds.map((m) => [m.name, m.dosage, m.time_note].filter(Boolean).join(' ')).join('; ') || 'ไม่มี/ไม่ระบุ'}`,
  ].filter(Boolean).join('\n');
}

function ruleBasedReply(text) {
  const q = text.toLowerCase();
  if (/ปวดหัว|ไข้|พารา|paracetamol/.test(q)) {
    return 'สำหรับผู้ใหญ่ที่ปวดหัวหรือมีไข้ ยาพาราเซตามอล 500 มก. ทานครั้งละ 1-2 เม็ด ห่างกันอย่างน้อย 4-6 ชั่วโมงเมื่อมีอาการ และไม่เกิน 8 เม็ด (4 กรัม) ต่อวัน ผู้ที่เป็นโรคตับหรือดื่มแอลกอฮอล์เป็นประจำควรปรึกษาเภสัชกรก่อน หากไข้ไม่ลงใน 3 วันควรพบแพทย์ครับ';
  }
  if (/แพ้|ผื่น|บวม|หายใจ/.test(q)) {
    return 'หากสงสัยว่าแพ้ยา เช่น ผื่นคัน ปากหรือตาบวม ให้หยุดยาทันที ถ้าหายใจลำบาก แน่นหน้าอก หรือหน้ามืด ให้โทร 1669 หรือไปโรงพยาบาลทันที และบันทึกชื่อยาไว้ในเมนู "ประวัติแพ้ยา" เพื่อแสดงแพทย์ครั้งต่อไปครับ';
  }
  if (/ลืม(ทาน|กิน)ยา/.test(q)) {
    return 'ถ้าลืมทานยา ให้ทานทันทีที่นึกได้ แต่ถ้าใกล้เวลามื้อถัดไปแล้ว ให้ข้ามมื้อที่ลืมไปและทานมื้อถัดไปตามปกติ ห้ามเพิ่มยาเป็น 2 เท่า ยาบางชนิด เช่น ยาคุมกำเนิดหรือยาต้านไวรัส มีวิธีเฉพาะ ควรถามเภสัชกรครับ';
  }
  if (/ก่อนอาหาร|หลังอาหาร/.test(q)) {
    return 'ยาก่อนอาหาร ควรทานก่อนอาหารประมาณ 30 นาที - 1 ชั่วโมง ส่วนยาหลังอาหาร ทานหลังอาหารทันทีจนถึง 15-30 นาที ถ้าฉลากเขียนต่างจากนี้ให้ทำตามฉลากครับ';
  }
  if (/เก็บยา|หมดอายุ/.test(q)) {
    return 'ควรเก็บยาในที่แห้ง พ้นแสงแดด อุณหภูมิไม่เกิน 30 องศา ไม่เก็บในรถหรือห้องน้ำ ยาน้ำที่เปิดแล้วส่วนใหญ่ใช้ได้ประมาณ 1 เดือน และยาที่สี กลิ่น หรือลักษณะเปลี่ยนไปไม่ควรใช้ต่อครับ';
  }
  return 'ขอบคุณสำหรับคำถามครับ ตอนนี้ระบบตอบได้เฉพาะคำถามพื้นฐาน (เช่น ปวดหัว/ไข้, แพ้ยา, ลืมทานยา, ก่อน/หลังอาหาร, การเก็บยา) หากต้องการคำแนะนำเฉพาะตัว แนะนำให้ปรึกษาเภสัชกรประจำร้านยาครับ';
}

// POST /api/ai/chat  { messages: [{ sender: 'user'|'bot', text }] }
router.post('/chat', chatLimit, async (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-12) : [];
  const last = messages.filter((m) => m.sender === 'user').pop();
  const lastText = str(last?.text, 2000);
  if (!lastText) throw new HttpError(400, 'กรุณาพิมพ์คำถาม');

  if (!hasAI()) {
    return res.json({ reply: ruleBasedReply(lastText), mode: 'basic' });
  }

  const system = `คุณคือ "เภสัชกร AI" ของแอปเป๋ายา ตอบเป็นภาษาไทย สุภาพ กระชับ เข้าใจง่ายสำหรับคนทั่วไปและผู้สูงอายุ
- ให้ข้อมูลทั่วไปเรื่องยา วิธีใช้ ผลข้างเคียง การเก็บรักษา และเมื่อไรควรพบแพทย์
- ห้ามวินิจฉัยโรค ห้ามแนะนำให้หยุดหรือเปลี่ยนยาที่แพทย์สั่งเอง
- ถ้าเป็นอาการฉุกเฉิน (หายใจลำบาก เจ็บหน้าอก หมดสติ แพ้ยารุนแรง) ให้แนะนำโทร 1669 ทันที
- ถ้ายาที่ถามตรงกับประวัติแพ้ยาของผู้ใช้ ต้องเตือนชัดเจน
- ลงท้ายด้วยการแนะนำให้ยืนยันกับเภสัชกร/แพทย์เมื่อเป็นเรื่องเฉพาะบุคคล

ข้อมูลผู้ใช้:
${userContext(req.userId)}`;

  const contents = messages
    .map((m) => ({ role: m.sender === 'user' ? 'user' : 'model', parts: [{ text: str(m.text, 2000) }] }))
    .filter((m) => m.parts[0].text);
  while (contents.length && contents[0].role !== 'user') contents.shift();

  const reply = await callAI({ system, contents });
  res.json({ reply: reply.trim() || ruleBasedReply(lastText), mode: 'ai' });
});

// จับคู่ข้อความกับชื่อยาในฐานข้อมูล
function findMedicinesInText(text, limit = 5) {
  const words = [...new Set(String(text).toLowerCase().match(/[a-z][a-z-]{3,}/g) || [])];
  if (!words.length) return [];
  const names = db.prepare('SELECT MIN(id) AS id, generic_name FROM medicines GROUP BY generic_name').all();
  const hits = [];
  for (const n of names) {
    const first = n.generic_name.toLowerCase().split(/[\s(,]/)[0];
    if (first.length >= 4 && words.some((w) => w === first || (w.length >= 5 && first.startsWith(w)))) {
      hits.push(n.id);
      if (hits.length >= limit) break;
    }
  }
  return hits.map((id) => toMedicine(db.prepare('SELECT * FROM medicines WHERE id = ?').get(id)));
}

// POST /api/ai/scan  { image: 'base64 jpeg (ไม่มี prefix)', ocrText: 'ข้อความที่ OCR อ่านได้' }
router.post('/scan', scanLimit, async (req, res) => {
  const ocrText = str(req.body?.ocrText, 3000);
  const image = typeof req.body?.image === 'string' ? req.body.image.replace(/^data:image\/\w+;base64,/, '') : '';

  if (!hasAI() || !image) {
    const matches = findMedicinesInText(ocrText);
    return res.json({
      mode: 'ocr',
      result: {
        extractedText: ocrText,
        drugName: matches[0]?.genericName || '',
        confidence: matches.length ? 'medium' : 'low',
        aiAdvice: matches.length
          ? 'พบชื่อยาที่ตรงกับบัญชียาหลัก ดูรายละเอียดเพิ่มเติมได้ด้านล่าง (เปิดใช้ AI เพื่อให้บอกวิธีใช้ด้วย)'
          : 'ยังอ่านชื่อยาไม่ได้ ลองถ่ายให้ชัดขึ้น หรือเปิดใช้ AI (ใส่ GEMINI_API_KEY) เพื่อให้อ่านภาพได้แม่นขึ้น',
      },
      matches,
      allergyWarnings: [],
      disclaimer: DISCLAIMER,
    });
  }

  const u = db.prepare('SELECT age FROM users WHERE id = ?').get(req.userId) || {};
  const system = `คุณคือเภสัชกรไทย ดูภาพยา (ฉลาก กล่อง ขวด หรือแผงยา ซึ่งอาจเอียง กลับหัว สะท้อนแสง หรือมีแค่บางส่วน) แล้วระบุว่าเป็นยาอะไร
ตอบเป็น JSON ภาษาไทยเท่านั้น (ชื่อยาเป็นภาษาอังกฤษ)
กติกา:
- ระบุยาจากข้อความที่เห็นจริงในภาพเท่านั้น ถ้าอ่านชื่อยาไม่ได้ ให้ drugName เป็น "" และ confidence เป็น "low" ห้ามเดา
- labelInstruction: ใส่เฉพาะวิธีใช้ที่พิมพ์อยู่บนบรรจุภัณฑ์ในภาพ ถ้าไม่มี ให้ใส่ ""
- usedFor / howToUse / sideEffects / cautions: ข้อมูลทั่วไปของยานี้ตามเอกสารกำกับยามาตรฐาน สำหรับผู้ใหญ่ เขียนสั้น เข้าใจง่ายสำหรับผู้สูงอายุ
- howToUse: ระบุขนาดยาปกติสำหรับผู้ใหญ่ตามความแรงที่เห็นในภาพ ถ้าเป็นยาที่ต้องให้แพทย์สั่งและปรับขนาดตามคน (เช่น ยาความดัน เบาหวาน ยาฆ่าเชื้อ ยาจิตเวช) ให้เขียนว่า "ใช้ตามที่แพทย์สั่ง" พร้อมข้อปฏิบัติทั่วไป
- เด็ก หญิงตั้งครรภ์/ให้นมบุตร ผู้ป่วยโรคตับหรือไต ให้แนะนำปรึกษาเภสัชกร/แพทย์ก่อนใช้ ห้ามระบุขนาดยาเด็กเอง${u.age ? `\n- ผู้ใช้อายุ ${u.age} ปี` : ''}`;
  const prompt = `ข้อความที่ OCR อ่านได้เบื้องต้น (อาจผิด): "${ocrText}"
ตอบ JSON รูปแบบนี้:
{"isMedicine":true,"drugName":"ชื่อสามัญทางยา","brandName":"ชื่อการค้า","strength":"ความแรง เช่น 10 mg","dosageForm":"รูปแบบยา เช่น ยาเม็ด","usedFor":"ใช้รักษาอะไร","howToUse":"วิธีใช้ทั่วไป","labelInstruction":"วิธีใช้ที่พิมพ์บนฉลาก","sideEffects":"ผลข้างเคียงที่พบบ่อย","cautions":"ข้อควรระวัง","extractedText":"ข้อความที่อ่านได้จากภาพ","confidence":"high|medium|low"}`;

  const text = await callAI({
    system,
    json: true,
    contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: image } }] }],
  });
  const raw = parseJSON(text, null) || parseJSON((text.match(/\{[\s\S]*\}/) || [''])[0], null);
  if (!raw || typeof raw !== 'object') throw new HttpError(502, 'AI อ่านฉลากไม่สำเร็จ กรุณาลองใหม่');
  const field = (k, max = 600) => str(raw[k], max);
  const result = {
    isMedicine: raw.isMedicine !== false,
    drugName: field('drugName', 200),
    brandName: field('brandName', 200),
    strength: field('strength', 100),
    dosageForm: field('dosageForm', 100),
    usedFor: field('usedFor'),
    howToUse: field('howToUse'),
    labelInstruction: field('labelInstruction'),
    sideEffects: field('sideEffects'),
    cautions: field('cautions'),
    extractedText: field('extractedText', 1500),
    confidence: ['high', 'medium', 'low'].includes(raw.confidence) ? raw.confidence : 'low',
  };
  // ความมั่นใจต่ำ = ไม่แสดงวิธีใช้ กันผู้ใช้ทำตามข้อมูลของยาผิดตัว
  if (!result.drugName || result.confidence === 'low') {
    result.usedFor = ''; result.howToUse = ''; result.sideEffects = ''; result.cautions = '';
  }

  const matches = findMedicinesInText(`${result.drugName} ${ocrText}`);
  const allergies = db.prepare('SELECT * FROM allergies WHERE user_id = ?').all(req.userId);
  const allergyWarnings = result.drugName
    ? allergyMatches(allergies, result.drugName).map((a) => ({ drugName: a.drug_name, symptom: a.symptom, severity: a.severity }))
    : [];
  res.json({ mode: 'ai', result, matches, allergyWarnings, disclaimer: DISCLAIMER });
});

// สรุปข้อมูลการใช้ยาด้วย AI สำหรับหน้ารายละเอียดยา: GET /api/ai/medicine-info/:id
router.get('/medicine-info/:id', infoLimit, async (req, res) => {
  const row = db.prepare('SELECT * FROM medicines WHERE id = ?').get(Number(req.params.id));
  if (!row) throw new HttpError(404, 'ไม่พบข้อมูลยา');
  // v3 = เพิ่มชื่อที่คนทั่วไปเรียก + สรุปสั้นว่าใช้ทำอะไร; v2 = ข้อมูลแบบละเอียด (ชื่อวิทยาศาสตร์ ชื่อการค้า สรรพคุณ ข้อบ่งใช้ ข้อห้ามใช้ ฯลฯ)
  const key = `${row.generic_name.toLowerCase()}|${String(row.dosage_form || '').toLowerCase()}|v3`;
  const cached = db.prepare('SELECT data, created_at FROM medicine_ai_info WHERE cache_key = ?').get(key);
  if (cached) return res.json({ info: parseJSON(cached.data, null), cached: true, disclaimer: DISCLAIMER });
  if (!hasAI()) return res.json({ info: null, enabled: false });

  const system = `คุณคือเภสัชกรไทย ให้ข้อมูลยาทั่วไปตามเอกสารกำกับยามาตรฐาน ตอบเป็น JSON ภาษาไทยเท่านั้น (ยกเว้นชื่อยาภาษาอังกฤษ) เขียนสั้น ชัด เข้าใจง่ายสำหรับผู้สูงอายุ
กติกา:
- ถ้าไม่รู้จักยานี้หรือไม่แน่ใจ ให้ "known": false และเว้นช่องอื่นว่าง ห้ามเดา
- ช่องไหนไม่แน่ใจ ให้เว้นว่าง "" ดีกว่าเดา โดยเฉพาะ scientificName และ brandNames
- howToUse: ขนาดยาทั่วไปสำหรับผู้ใหญ่ตามรูปแบบยา ถ้าเป็นยาที่แพทย์ต้องปรับขนาดเฉพาะคน (เช่น ยาความดัน เบาหวาน ยาฆ่าเชื้อ ยาจิตเวช ยาฉีด ยาเคมีบำบัด) ให้เขียน "ใช้ตามขนาดที่แพทย์สั่ง" พร้อมข้อปฏิบัติทั่วไป
- ห้ามระบุขนาดยาเด็ก ให้แนะนำปรึกษาแพทย์/เภสัชกร
- ช่องที่เป็นรายการ ให้คั่นแต่ละข้อด้วยการขึ้นบรรทัดใหม่ (\\n) ไม่เกิน 5 ข้อ ข้อละไม่เกิน 1 ประโยค
- ช่องอื่นไม่เกิน 3 ประโยค`;
  const prompt = `ยา: ${row.generic_name}
รูปแบบยา: ${row.dosage_form || '-'}${row.strength && row.strength !== 'ไม่ระบุ' ? `\nความแรง: ${row.strength}` : ''}
กลุ่มยา: ${row.subgroup || row.main_group || '-'}
ตอบ JSON:
{"known":true,
"commonName":"ชื่อที่คนไทยทั่วไปเรียกยานี้ สั้น ๆ เข้าใจง่าย เช่น ยาพารา, ยาแก้แพ้, ยาลดกรด, ยาฆ่าเชื้อ (ห้ามใช้ศัพท์แพทย์)",
"oneLine":"ประโยคเดียวสั้น ๆ ว่ายานี้ใช้ทำอะไร ภาษาชาวบ้าน เช่น ใช้ลดไข้ แก้ปวดหัว ปวดฟัน ปวดเมื่อย",
"thaiName":"ชื่อยาภาษาไทย (ทับศัพท์) เช่น พาราเซตามอล",
"scientificName":"ชื่อทางเคมี/ชื่อวิทยาศาสตร์ (IUPAC) ภาษาอังกฤษ",
"brandNames":"ชื่อการค้าที่พบบ่อยในไทย คั่นด้วยจุลภาค",
"drugClass":"กลุ่มยาแบบเข้าใจง่าย เช่น ยาแก้ปวดลดไข้",
"properties":"สรรพคุณ: ยาออกฤทธิ์อย่างไร (อธิบายง่าย ๆ)",
"indications":"ข้อบ่งใช้: ใช้รักษาโรค/อาการอะไร (รายการ)",
"howToUse":"วิธีใช้และขนาดยาทั่วไปสำหรับผู้ใหญ่",
"contraindications":"ข้อห้ามใช้: ห้ามใช้ในใคร (รายการ)",
"cautions":"ข้อควรระวัง/คำเตือน (รายการ)",
"sideEffects":"ผลข้างเคียงที่พบบ่อย และอาการที่ต้องหยุดยาแล้วไปพบแพทย์ (รายการ)",
"interactions":"ยาหรืออาหารที่ไม่ควรใช้ร่วมกัน (รายการ)",
"pregnancy":"หญิงตั้งครรภ์และให้นมบุตร",
"storage":"การเก็บรักษา",
"tips":"คำแนะนำเพิ่มเติม เช่น กินพร้อมอาหารได้ไหม ลืมกินทำอย่างไร"}`;

  const text = await callAI({ system, json: true, maxTokens: 3000, contents: [{ role: 'user', parts: [{ text: prompt }] }] });
  const raw = parseJSON(text, null) || parseJSON((text.match(/\{[\s\S]*\}/) || [''])[0], null);
  if (!raw || typeof raw !== 'object') throw new HttpError(502, 'AI สรุปข้อมูลยาไม่สำเร็จ ลองใหม่อีกครั้ง');
  const f = (k, max = 800) => str(Array.isArray(raw[k]) ? raw[k].join('\n') : raw[k], max);
  const info = {
    known: raw.known !== false,
    commonName: f('commonName', 80),
    oneLine: f('oneLine', 200),
    thaiName: f('thaiName', 120),
    scientificName: f('scientificName', 300),
    brandNames: f('brandNames', 300),
    drugClass: f('drugClass', 200),
    properties: f('properties'),
    indications: f('indications'),
    howToUse: f('howToUse'),
    contraindications: f('contraindications'),
    cautions: f('cautions'),
    sideEffects: f('sideEffects'),
    interactions: f('interactions'),
    pregnancy: f('pregnancy'),
    storage: f('storage', 400),
    tips: f('tips'),
  };
  info.usedFor = info.indications; // ชื่อเดิม ให้ส่วนอื่นของแอปใช้ต่อได้
  if (info.known && (info.indications || info.howToUse)) {
    db.prepare('INSERT OR REPLACE INTO medicine_ai_info (cache_key, data) VALUES (?, ?)').run(key, JSON.stringify(info));
  }
  res.json({ info, cached: false, disclaimer: DISCLAIMER });
});

router.get('/status', (_req, res) => {
  const info = aiInfo();
  res.json({ gemini: info.enabled, enabled: info.enabled, provider: info.provider, model: info.model });
});

module.exports = router;