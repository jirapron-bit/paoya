// เลือกผู้ให้บริการ AI: Groq (ฟรี ไม่ต้องผูกบัตร), Gemini หรือบริการที่ใช้รูปแบบ OpenAI (OpenRouter, GitHub Models, OpenAI)
//
// ตั้งค่าใน .env อย่างใดอย่างหนึ่ง:
//   GROQ_API_KEY=gsk_...                    → ใช้ Groq (แนะนำ ฟรี)
//   GEMINI_API_KEY=...                      → ใช้ Google Gemini
//   AI_BASE_URL=... + AI_API_KEY=...        → บริการอื่นที่ใช้รูปแบบ OpenAI
// ถ้าตั้งไว้หลายอัน เลือกเองได้ด้วย AI_PROVIDER=groq | gemini | openai
// เปลี่ยนรุ่นโมเดลได้ด้วย AI_MODEL=...
const { HttpError } = require('./util');
const gemini = require('./gemini');

const IS_PROD = process.env.NODE_ENV === 'production';

const PRESETS = {
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    key: () => process.env.GROQ_API_KEY,
    // รุ่นที่รับรูปภาพได้ (อ่านฉลากยา) เรียงตามลำดับที่จะลอง — Groq เปลี่ยนรุ่นบ่อย จึงมีรุ่นสำรอง
    models: ['qwen/qwen3.8-27b', 'qwen/qwen3.6-27b', 'meta-llama/llama-4-scout-17b-16e-instruct'],
  },
  openai: {
    label: 'OpenAI-compatible',
    baseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
    key: () => process.env.AI_API_KEY,
    models: ['gpt-4o-mini'],
  },
};

const clean = (v) => String(v || '').trim().replace(/^["']|["']$/g, '');

function provider() {
  const chosen = clean(process.env.AI_PROVIDER).toLowerCase();
  if (chosen === 'gemini' || chosen === 'groq' || chosen === 'openai') return chosen;
  if (clean(process.env.GROQ_API_KEY)) return 'groq';
  if (clean(process.env.GEMINI_API_KEY)) return 'gemini';
  if (clean(process.env.AI_API_KEY)) return 'openai';
  return null;
}

const hasAI = () => {
  const p = provider();
  if (p === 'gemini') return gemini.hasGemini();
  return Boolean(p && clean(PRESETS[p].key()));
};

const modelCandidates = (p = provider()) =>
  [...new Set([clean(process.env.AI_MODEL), ...(PRESETS[p]?.models || [])].filter(Boolean))];
const workingModel = {};

// แปลงรูปแบบข้อความของ Gemini → OpenAI (ai.js เขียนไว้ในรูปแบบ Gemini)
function toOpenAIMessages(system, contents) {
  const messages = [{ role: 'system', content: system }];
  for (const c of contents) {
    const parts = c.parts || [];
    const hasImage = parts.some((p) => p.inline_data);
    const role = c.role === 'model' ? 'assistant' : 'user';
    if (!hasImage) {
      messages.push({ role, content: parts.map((p) => p.text || '').join('\n') });
    } else {
      messages.push({
        role,
        content: parts.map((p) => (p.inline_data
          ? { type: 'image_url', image_url: { url: `data:${p.inline_data.mime_type};base64,${p.inline_data.data}` } }
          : { type: 'text', text: p.text || '' })),
      });
    }
  }
  return messages;
}

function explainOpenAI(status, bodyText) {
  let msg = '';
  let code = '';
  try {
    const e = JSON.parse(bodyText).error || {};
    msg = e.message || '';
    code = e.code || e.type || '';
  } catch { msg = bodyText.slice(0, 200); }
  const t = `${code} ${msg}`;
  if (status === 401 || /invalid_api_key|Invalid API Key|unauthorized/i.test(t)) return { code: 'bad_key', th: 'API key ไม่ถูกต้อง ให้ก๊อป key มาวางใหม่' };
  if (status === 404 || /model_not_found|does not exist|decommissioned|not found/i.test(t)) return { code: 'no_model', th: 'ไม่พบโมเดลที่ตั้งไว้' };
  if (status === 429 || /rate_limit|quota/i.test(t)) return { code: 'quota', th: 'ใช้โควตาฟรีเกินกำหนดชั่วคราว รอสักครู่แล้วลองใหม่' };
  if (status === 413 || /too large|maximum/i.test(t)) return { code: 'too_large', th: 'รูปหรือข้อความใหญ่เกินไป' };
  if (status === 403) return { code: 'forbidden', th: `key นี้ไม่มีสิทธิ์ใช้งาน${msg ? `: ${msg.slice(0, 120)}` : ''}` };
  if (status >= 500) return { code: 'server', th: 'ระบบ AI ขัดข้องชั่วคราว ลองใหม่อีกครั้ง' };
  return { code: 'other', th: `AI ตอบกลับ error ${status}${msg ? `: ${msg.slice(0, 150)}` : ''}` };
}

// โมเดลบางรุ่นใส่ <think>...</think> มาด้วย ตัดออก
const stripThinking = (s) => String(s || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

async function callOpenAICompatible({ system, contents, json, maxTokens }) {
  const p = provider();
  const preset = PRESETS[p];
  const key = clean(preset.key());
  const baseUrl = clean(p === 'openai' ? process.env.AI_BASE_URL || preset.baseUrl : preset.baseUrl).replace(/\/+$/, '');
  const messages = toOpenAIMessages(system, contents);
  const models = workingModel[p] ? [workingModel[p], ...modelCandidates(p).filter((m) => m !== workingModel[p])] : modelCandidates(p);

  let last = null;
  for (const model of models) {
    let res;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
          max_tokens: maxTokens || 1500,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: AbortSignal.timeout(45000),
      });
    } catch (err) {
      const timeout = err.name === 'TimeoutError' || err.name === 'AbortError';
      last = { info: { code: 'network', th: timeout ? 'AI ตอบช้าเกินไป ลองใหม่อีกครั้ง' : `เชื่อมต่อ ${preset.label} ไม่ได้ (${err.cause?.code || err.message})` } };
      break;
    }
    const text = await res.text();
    if (res.ok) {
      const data = JSON.parse(text);
      const out = stripThinking(data.choices?.[0]?.message?.content);
      if (!out) throw new HttpError(502, 'AI ไม่ได้ส่งคำตอบกลับมา ลองใหม่อีกครั้ง');
      if (workingModel[p] !== model) {
        if (clean(process.env.AI_MODEL) && model !== clean(process.env.AI_MODEL)) console.warn(`[AI] ใช้โมเดล ${process.env.AI_MODEL} ไม่ได้ เปลี่ยนไปใช้ ${model} แทน`);
        workingModel[p] = model;
      }
      return out;
    }
    last = { status: res.status, info: explainOpenAI(res.status, text), raw: text };
    console.error(`[AI] ${preset.label} error (${model}) ${res.status} ${last.info.code}: ${last.info.th}\n${text.slice(0, 400)}`);
    // json_object ใช้กับรุ่นนี้ไม่ได้ → ลองรุ่นถัดไป; หาโมเดลไม่เจอ → ลองรุ่นถัดไป
    if (!['no_model', 'other'].includes(last.info.code)) break;
  }
  const info = last.info;
  const hint = info.code === 'no_model' ? 'ไม่พบโมเดลที่ใช้ได้ ลองตั้ง AI_MODEL ใหม่ (ดูรายชื่อได้ด้วย npm run check-ai)' : info.th;
  throw new HttpError(info.code === 'quota' ? 429 : 502,
    IS_PROD && !['quota', 'network'].includes(info.code) ? 'บริการ AI ไม่ตอบสนอง กรุณาลองใหม่อีกครั้ง' : `บริการ AI ใช้ไม่ได้: ${hint}`);
}

// จุดเรียกเดียวของทั้งแอป (รูปแบบอาร์กิวเมนต์เหมือน Gemini)
async function callAI(args) {
  const p = provider();
  if (!p) throw new HttpError(503, 'ยังไม่ได้ตั้งค่า AI');
  if (p === 'gemini') return gemini.callGemini(args);
  return callOpenAICompatible(args);
}

async function listModels() {
  const p = provider();
  if (p === 'gemini') return gemini.listModels();
  const preset = PRESETS[p];
  const baseUrl = clean(p === 'openai' ? process.env.AI_BASE_URL || preset.baseUrl : preset.baseUrl).replace(/\/+$/, '');
  const res = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${clean(preset.key())}` }, signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, info: explainOpenAI(res.status, text), raw: text };
  const body = JSON.parse(text);
  return { ok: true, models: (body.data || body.models || []).map((m) => m.id || m.name).filter(Boolean) };
}

function aiInfo() {
  const p = provider();
  if (!p || !hasAI()) return { enabled: false, provider: null, model: null };
  if (p === 'gemini') return { enabled: true, provider: 'Gemini', model: gemini.currentModel() };
  return { enabled: true, provider: PRESETS[p].label, model: workingModel[p] || modelCandidates(p)[0] };
}

function keyFormatProblem() {
  const p = provider();
  if (!p) return 'ยังไม่ได้ใส่ key ของ AI ในไฟล์ .env (GROQ_API_KEY หรือ GEMINI_API_KEY)';
  if (p === 'gemini') return gemini.keyFormatProblem();
  const key = clean(PRESETS[p].key());
  if (!key) return `ยังไม่ได้ใส่ key สำหรับ ${PRESETS[p].label}`;
  if (/\s/.test(key)) return 'key มีช่องว่างอยู่ข้างใน';
  if (p === 'groq' && !/^gsk_[\w-]{20,}$/.test(key)) return 'key ของ Groq ปกติขึ้นต้นด้วย gsk_ ให้ก๊อปมาวางใหม่ทั้งหมด';
  return null;
}

module.exports = { callAI, hasAI, aiInfo, listModels, keyFormatProblem, modelCandidates, provider };