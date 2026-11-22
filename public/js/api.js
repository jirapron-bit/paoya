// ตัวช่วยเรียก backend (ไฟล์ JavaScript ธรรมดา โหลดก่อนไฟล์ .jsx ทั้งหมด)
// การเข้าสู่ระบบใช้ cookie แบบ httpOnly ที่เซิร์ฟเวอร์ตั้งให้ หน้าเว็บจึงไม่ต้องเก็บ token เอง
/* global React */
const { useState, useEffect, useRef, useCallback, useMemo } = React;

const api = (() => {
  let loggedIn = false;
  // ล้าง token แบบเก่า (เวอร์ชันก่อนเก็บไว้ใน localStorage)
  try { localStorage.removeItem('paoya_token'); } catch { /* ignore */ }

  async function request(method, path, body, { silent401 = false } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(`/api${path}`, {
        method,
        headers,
        credentials: 'same-origin',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต');
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && loggedIn && !silent401) {
      loggedIn = false;
      window.dispatchEvent(new Event('paoya:logout'));
    }
    if (!res.ok) {
      const err = new Error(data.error || `เกิดข้อผิดพลาด (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ดาวน์โหลดไฟล์ที่ต้องเข้าสู่ระบบก่อน (เช่น ไฟล์ปฏิทิน .ics)
  async function download(path, filename) {
    const res = await fetch(`/api${path}`, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('ดาวน์โหลดไม่สำเร็จ');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return {
    setLoggedIn: (v) => { loggedIn = Boolean(v); },
    // ตรวจว่ายังเข้าสู่ระบบอยู่ไหม (ตอนเปิดแอป) ไม่แจ้งเตือนถ้ายังไม่ได้เข้า
    currentUser: async () => {
      try {
        const { user } = await request('GET', '/me', undefined, { silent401: true });
        loggedIn = true;
        return user;
      } catch (err) {
        if (err.status === 401) return null;
        throw err;
      }
    },
    download,
    get: (p) => request('GET', p),
    post: (p, b = {}) => request('POST', p, b),
    put: (p, b = {}) => request('PUT', p, b),
    del: (p, b) => request('DELETE', p, b),
  };
})();
