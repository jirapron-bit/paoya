// ส่งอีเมล ผ่านบริการ Resend (https://resend.com) ด้วย HTTP ธรรมดา ไม่ต้องติดตั้งแพ็กเกจเพิ่ม
// ตั้งค่าใน .env:  RESEND_API_KEY=...  และ  EMAIL_FROM="เป๋ายา <no-reply@โดเมนของคุณ>"
// ถ้าไม่ได้ตั้ง จะคืน false แล้วให้ผู้เรียกจัดการเอง (เช่น แสดงลิงก์ใน terminal)

const isEmailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

async function sendEmail({ to, subject, html, text }) {
  if (!isEmailConfigured()) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error('ส่งอีเมลไม่สำเร็จ', res.status, (await res.text().catch(() => '')).slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error('ส่งอีเมลไม่สำเร็จ', err.message);
    return false;
  }
}

module.exports = { sendEmail, isEmailConfigured };
