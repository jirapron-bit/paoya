// Service worker ของเป๋ายา: ทำให้ติดตั้งเป็นแอปได้ และเปิดหน้าแอปได้เร็วขึ้น/เปิดได้แม้เน็ตหลุด
// - ข้อมูลจาก /api ไม่เก็บแคชเด็ดขาด (เป็นข้อมูลสุขภาพส่วนตัว และต้องสดเสมอ)
// - ไฟล์หน้าเว็บของเรา: ดึงจากเซิร์ฟเวอร์ก่อน ถ้าเน็ตหลุดค่อยใช้ของในแคช (อัปเดตแล้วเห็นของใหม่ทันที)
// - ไลบรารีจาก CDN (React, Tailwind, ฟอนต์): ใช้ของในแคชก่อน เพราะเวอร์ชันไม่เปลี่ยน
// เมื่อแก้ไฟล์ในรายการ APP_SHELL ให้เพิ่มเลข VERSION เพื่อล้างแคชเก่า
const VERSION = 'paoya-v4';
const SHELL_CACHE = `${VERSION}-shell`;
const CDN_CACHE = `${VERSION}-cdn`;

const APP_SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/css/app.css',
  '/js/icons.js',
  '/js/api.js',
  '/js/ui.jsx',
  '/js/app.jsx',
  '/js/screens/auth.jsx',
  '/js/screens/home.jsx',
  '/js/screens/medicine.jsx',
  '/js/screens/mymeds.jsx',
  '/js/screens/scan.jsx',
  '/js/screens/pharmacy.jsx',
  '/js/screens/settings.jsx',
  '/js/screens/chat.jsx',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

const CDN_HOSTS = ['unpkg.com', 'cdn.tailwindcss.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (cached) return cached;
    if (request.mode === 'navigate') return (await cache.match('/offline.html')) || Response.error();
    return Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CDN_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // ข้อมูลส่วนตัว: ผ่านตรงไปที่เซิร์ฟเวอร์เสมอ
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  } else if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request));
  }
  // อย่างอื่น (เช่น Google Maps) ปล่อยให้เบราว์เซอร์จัดการตามปกติ
});
