// ตรวจว่า key ของ AI (Groq / Gemini / OpenAI-compatible) ใช้ได้ไหม และโมเดลไหนใช้ได้
// วิธีใช้:  npm run check-ai
require('dotenv').config({ quiet: true });
const llm = require('../server/llm');
const gemini = require('../server/gemini');
const { keyFormatProblem, listModels } = llm;
const callGemini = llm.callAI;
const modelCandidates = () => (llm.provider() === 'gemini' ? gemini.modelCandidates() : llm.modelCandidates());

(async () => {
  const p = llm.provider();
  const key = String((p === 'groq' ? process.env.GROQ_API_KEY : p === 'openai' ? process.env.AI_API_KEY : process.env.GEMINI_API_KEY) || '').trim();
  console.log(`\n=== ตรวจระบบ AI (${p === 'groq' ? 'Groq' : p === 'openai' ? 'OpenAI-compatible' : 'Gemini'}) ===\n`);
  console.log(`key: ${key ? `${key.slice(0, 6)}...${key.slice(-4)} (ยาว ${key.length} ตัว)` : '(ว่าง)'}`);

  const formatProblem = keyFormatProblem();
  if (formatProblem) console.log(`⚠️  ${formatProblem}`);
  if (!key) process.exit(1);

  console.log('\n1) ตรวจ key กับผู้ให้บริการ ...');
  let available = [];
  try {
    const r = await listModels();
    if (!r.ok) {
      console.log(`❌ ${r.info.th}`);
      if (r.raw) console.log(`   (รายละเอียด: ${r.raw.replace(/\s+/g, ' ').slice(0, 300)})`);
      process.exit(1);
    }
    available = r.models;
    console.log(`✅ key ใช้ได้ (มีโมเดลให้ใช้ ${available.length} รุ่น)`);
  } catch (err) {
    console.log(`❌ เชื่อมต่อผู้ให้บริการ AI ไม่ได้: ${err.cause?.code || err.message}`);
    console.log('   ตรวจสอบอินเทอร์เน็ต / firewall / proxy ของเครื่องนี้');
    process.exit(1);
  }

  console.log('\n2) โมเดลที่แอปจะใช้ (เรียงตามลำดับที่จะลอง):');
  for (const m of modelCandidates()) console.log(`   ${available.includes(m) ? '✅' : '➖'} ${m}`);
  const interesting = available.filter((m) => (p === 'gemini' ? /flash/.test(m) : /vision|vl|scout|maverick|qwen|gpt-4o|llama-4/i.test(m)) && !/image-gen|tts|audio|whisper|live|embedding|guard/i.test(m)).slice(0, 10);
  if (interesting.length) console.log(`   รุ่นที่น่าจะใช้ได้กับ key นี้: ${interesting.join(', ')}`);

  console.log('\n3) ทดลองถามจริง ...');
  try {
    const reply = await callGemini({ system: 'ตอบสั้นที่สุด', contents: [{ role: 'user', parts: [{ text: 'พิมพ์คำว่า สวัสดี' }] }] });
    console.log(`✅ AI ตอบว่า: ${reply.trim().slice(0, 80)}`);
  } catch (err) {
    console.log(`❌ ${err.message}`);
    console.log('\nถ้ามีรุ่นที่ใช้ได้ในข้อ 2 ให้ใส่ใน .env เช่น  AI_MODEL=ชื่อรุ่น (Groq) หรือ GEMINI_MODEL=ชื่อรุ่น (Gemini) แล้วรันใหม่\n');
    process.exit(1);
  }

  // ทดสอบอ่านรูป (ใช้รูปสีพื้นเล็ก ๆ) เพื่อเช็กว่าโมเดลรับรูปได้ สำหรับหน้าสแกน
  console.log('\n4) ทดลองส่งรูป (สำหรับหน้าสแกนยา) ...');
  try {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAZ0lEQVR4Xu3RAQkAIAADQTWI/UMZRkxxCH8JNn6evcfP1s/jnw5oFdAqoFVAq4BWAa0CWgW0CmgV0CqgVUCrgFYBrQJaBbQKaBXQKqBVQKuAVgGtAloFtApoFdAqoFVAq4BWAa0C2gUInQGYWlmBJQAAAABJRU5ErkJggg=='; // รูปสีแดง 64x64
    const reply = await callGemini({ system: 'ตอบสั้นที่สุด', json: true, contents: [{ role: 'user', parts: [{ text: 'ภาพนี้เป็นสีอะไร ตอบเป็น JSON {"color":"..."}' }, { inline_data: { mime_type: 'image/png', data: png } }] }] });
    console.log(`✅ อ่านรูปได้: ${reply.trim().slice(0, 80)}`);
    console.log('\nพร้อมใช้งาน! รัน npm start แล้วลองแชทและสแกนได้เลย\n');
  } catch (err) {
    console.log(`❌ ${err.message}`);
    console.log('\nถ้ามีรุ่น flash ที่ใช้ได้ในข้อ 2 ให้ใส่ใน .env เช่น  GEMINI_MODEL=ชื่อรุ่น  แล้วรันใหม่\n');
    process.exit(1);
  }
})();
