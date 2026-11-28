// ชิ้นส่วนหน้าตาที่ใช้ร่วมกันทุกหน้า

const BRAND = {
  dark: '#004D25',
  main: '#388E3C',
  text: '#2D7A4C',
};

function Icon({ name, className = 'w-5 h-5', strokeWidth = 2 }) {
  const parts = window.PAOYA_ICONS[name];
  if (!parts) return null;
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {parts.map(([tag, attr], i) => React.createElement(tag, { key: i, ...attr }))}
    </svg>
  );
}

// ---------- แจ้งเตือนเล็ก ๆ ด้านบน (แทน alert) ----------
function toast(message, type = 'success') {
  window.dispatchEvent(new CustomEvent('paoya:toast', { detail: { message, type, id: Date.now() + Math.random() } }));
}

function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const onToast = (e) => {
      const t = e.detail;
      setItems((prev) => [...prev, t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 3200);
    };
    window.addEventListener('paoya:toast', onToast);
    return () => window.removeEventListener('paoya:toast', onToast);
  }, []);
  const color = { success: 'bg-[#004D25]', error: 'bg-red-600', info: 'bg-gray-800' };
  return (
    <div className="absolute bottom-36 md:bottom-10 left-0 right-0 z-[100] pointer-events-none">
      {items.map((t) => (
        <div key={t.id} role="status"
          className={`toast-in absolute left-1/2 -translate-x-1/2 w-[90%] max-w-md ${color[t.type] || color.info} text-white text-xs font-medium px-4 py-3 rounded-2xl shadow-lg flex items-center gap-2`}>
          <Icon name={t.type === 'error' ? 'alert-circle' : 'check'} className="w-4 h-4 flex-shrink-0" />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- ส่วนหัวหน้า ----------
function TopBar({ title, onBack, right, dark = false }) {
  return (
    <div className={`${dark ? 'bg-[#004D25] text-white' : 'bg-white text-gray-800 border-b border-gray-100'} px-4 py-3.5 flex items-center justify-between sticky top-0 z-10 shadow-sm`}>
      {onBack ? (
        <button onClick={onBack} aria-label="ย้อนกลับ"
          className={`p-1.5 -ml-1 rounded-full active:scale-95 transition-all ${dark ? 'hover:bg-white/10' : 'text-gray-600 hover:bg-gray-100'}`}>
          <Icon name="chevron-left" className="w-6 h-6" />
        </button>
      ) : <div className="w-8" />}
      <h2 className="font-bold text-base truncate px-2">{title}</h2>
      <div className="min-w-8 flex justify-end">{right}</div>
    </div>
  );
}

// ---------- กล่องป๊อปอัป ----------
function Modal({ title, icon, iconClass = 'text-[#2D7A4C]', onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // วาดลงกรอบแอป (#root) โดยตรง เพื่อให้ทับทั้งหน้าจอแม้หน้าถูกเลื่อนลงอยู่
  return ReactDOM.createPortal(
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-3"
      onClick={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div role="dialog" aria-label={title}
        className={`pop-in bg-white w-full ${wide ? 'max-w-sm' : 'max-w-xs'} rounded-3xl p-5 shadow-2xl space-y-4 max-h-[90%] overflow-y-auto`}>
        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
          <h3 className={`font-bold text-gray-800 text-base flex items-center gap-2`}>
            {icon && <Icon name={icon} className={`w-5 h-5 ${iconClass}`} />} {title}
          </h3>
          {onClose && (
            <button onClick={onClose} aria-label="ปิด" className="text-gray-400 hover:text-gray-600 p-1">
              <Icon name="x" className="w-5 h-5" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>,
    document.getElementById('root')
  );
}

function ConfirmModal({ title, message, confirmText = 'ยืนยัน', danger = false, onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-gray-600">{message}</p>
      <div className="flex gap-2">
        <Button variant={danger ? 'danger' : 'primary'} className="flex-1" disabled={busy}
          onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>
          {busy ? 'กำลังดำเนินการ...' : confirmText}
        </Button>
        <Button variant="ghost" className="flex-1" onClick={onCancel}>ยกเลิก</Button>
      </div>
    </Modal>
  );
}

// ---------- ปุ่มและช่องกรอก ----------
function Button({ variant = 'primary', size = 'md', className = '', children, ...props }) {
  const variants = {
    primary: 'bg-[#388E3C] hover:bg-[#2e7d32] text-white shadow',
    dark: 'bg-[#004D25] hover:bg-[#003d1d] text-white shadow',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow',
    ghost: 'bg-gray-100 hover:bg-gray-200 text-gray-700',
    outline: 'bg-white border border-gray-200 hover:border-[#2D7A4C] hover:text-[#2D7A4C] text-gray-700',
    soft: 'bg-green-50 hover:bg-green-100 text-[#2D7A4C] border border-green-200',
  };
  const sizes = { sm: 'text-xs px-3 py-1.5 rounded-xl', md: 'text-sm px-4 py-2.5 rounded-xl', lg: 'text-base px-5 py-3 rounded-full' };
  return (
    <button {...props}
      className={`font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none inline-flex items-center justify-center gap-1.5 ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </button>
  );
}

const inputCls = 'w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D7A4C] focus:ring-2 focus:ring-green-100 bg-white';

function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="block text-xs text-gray-600 mb-1 font-medium">{label}</span>}
      {children}
      {hint && <span className="block text-[11px] text-gray-400 mt-1">{hint}</span>}
    </label>
  );
}

function PasswordInput({ value, onChange, placeholder = 'รหัสผ่าน', className = inputCls, ...rest }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative flex items-center">
      <input type={show ? 'text' : 'password'} value={value} onChange={onChange} placeholder={placeholder}
        className={`${className} pr-10`} {...rest} />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
        className="absolute right-3 text-gray-500 hover:text-gray-700">
        <Icon name={show ? 'eye' : 'eye-off'} className="w-5 h-5" />
      </button>
    </div>
  );
}

function Spinner({ label = 'กำลังโหลด...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-gray-400 text-sm gap-2">
      <Icon name="loader" className="w-6 h-6 animate-spin text-[#2D7A4C]" />
      {label}
    </div>
  );
}

function EmptyState({ icon = 'search', title, subtitle }) {
  return (
    <div className="text-center text-gray-400 py-8 border-2 border-dashed border-gray-200 rounded-2xl px-4 bg-white">
      <Icon name={icon} className="w-8 h-8 mx-auto mb-2 text-gray-300" />
      <p className="font-medium text-gray-500 text-sm">{title}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}

function ErrorText({ children }) {
  if (!children) return null;
  return <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{children}</p>;
}

function AllergyBanner({ warnings }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div role="alert" className="bg-red-50 border-2 border-red-300 rounded-2xl p-3.5 text-red-700">
      <p className="font-bold text-sm flex items-center gap-1.5">
        <Icon name="alert-triangle" className="w-4 h-4" /> คุณเคยบันทึกว่าแพ้ยานี้
      </p>
      {warnings.map((w, i) => (
        <p key={i} className="text-xs mt-1">
          {w.drugName}{w.symptom ? ` — อาการ: ${w.symptom}` : ''}{w.severity ? ` (${w.severity})` : ''}
        </p>
      ))}
      <p className="text-[11px] mt-1.5 text-red-600">ห้ามใช้ยานี้โดยไม่ได้ปรึกษาแพทย์หรือเภสัชกร</p>
    </div>
  );
}

// ---------- วันที่ ----------
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function formatDateTH(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || '-';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${TH_MONTHS[m - 1]} ${y + 543}`;
}
const todayISO = () => new Date().toLocaleDateString('sv-SE');

function daysUntil(iso) {
  const target = new Date(`${iso}T00:00:00`);
  const now = new Date(`${todayISO()}T00:00:00`);
  return Math.round((target - now) / 86400000);
}

// โหลดข้อมูลจาก API พร้อมสถานะ loading/error
function useApi(path, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const load = useCallback(async () => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const data = await api.get(path);
      setState({ data, loading: false, error: '' });
    } catch (err) {
      setState({ data: null, loading: false, error: err.message });
    }
  }, [path]);
  useEffect(() => { load(); }, [load, ...deps]);
  return { ...state, reload: load, setData: (fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })) };
}

// ---------- ติดตั้งเป็นแอป (PWA) ----------
const isStandalone = () =>
  (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
// iPadOS รุ่นใหม่แจ้งตัวว่าเป็น Mac จึงต้องดูจอสัมผัสด้วย
const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isMobileLike = () => isIOS() || /Android/i.test(navigator.userAgent);

function useInstall() {
  const [canPrompt, setCanPrompt] = useState(Boolean(window.__paoyaInstallPrompt));
  const [installed, setInstalled] = useState(isStandalone());
  useEffect(() => {
    const onInstallable = () => setCanPrompt(true);
    const onInstalled = () => { setInstalled(true); setCanPrompt(false); };
    window.addEventListener('paoya:installable', onInstallable);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('paoya:installable', onInstallable);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  // Android/Chrome/Edge: เปิดหน้าต่างติดตั้งของระบบ
  const prompt = async () => {
    const p = window.__paoyaInstallPrompt;
    if (!p) return false;
    p.prompt();
    const { outcome } = await p.userChoice;
    window.__paoyaInstallPrompt = null;
    setCanPrompt(false);
    return outcome === 'accepted';
  };
  return { installed, canPrompt, prompt, ios: isIOS() };
}

function ShareIOSIcon() {
  return (
    <svg className="w-4 h-4 inline -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function InstallGuideModal({ onClose }) {
  const ios = isIOS();
  const Step = ({ n, children }) => (
    <li className="flex gap-3 items-start">
      <span className="w-6 h-6 rounded-full bg-[#388E3C] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{n}</span>
      <span className="text-sm text-gray-700 leading-relaxed">{children}</span>
    </li>
  );
  return (
    <Modal title="ติดตั้งเป๋ายาบนเครื่อง" icon="plus-circle" onClose={onClose} wide>
      <p className="text-xs text-gray-500">ติดตั้งแล้วจะมีไอคอนเป๋ายาบนหน้าจอโฮม เปิดเต็มจอเหมือนแอปทั่วไป ไม่ต้องโหลดจาก App Store</p>
      {ios ? (
        <ol className="space-y-3">
          <Step n="1">เปิดหน้านี้ใน <b>Safari</b> (iOS 16.4 ขึ้นไปใช้ Chrome ได้ด้วย)</Step>
          <Step n="2">แตะปุ่ม <b>แชร์</b> <ShareIOSIcon /> ที่แถบด้านล่าง (iPhone) หรือมุมขวาบน (iPad)</Step>
          <Step n="3">เลื่อนลงแล้วแตะ <b>"เพิ่มไปยังหน้าจอโฮม"</b> (Add to Home Screen)</Step>
          <Step n="4">แตะ <b>"เพิ่ม"</b> ไอคอนเป๋ายาจะอยู่บนหน้าจอโฮม</Step>
        </ol>
      ) : (
        <ol className="space-y-3">
          <Step n="1">เปิดหน้านี้ใน <b>Chrome</b> หรือ <b>Edge</b></Step>
          <Step n="2">แตะเมนู <b>⋮</b> มุมขวาบน</Step>
          <Step n="3">เลือก <b>"ติดตั้งแอป"</b> หรือ <b>"เพิ่มลงในหน้าจอหลัก"</b></Step>
        </ol>
      )}
      <Button className="w-full" onClick={onClose}>เข้าใจแล้ว</Button>
    </Modal>
  );
}

// แถบชวนติดตั้งในหน้าแรก (เฉพาะมือถือ/แท็บเล็ตที่ยังไม่ได้ติดตั้ง ปิดแล้วไม่ขึ้นอีก)
function InstallBanner() {
  const { installed, canPrompt, prompt } = useInstall();
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem('paoya_install_dismissed') === '1'; } catch { return false; }
  });
  const [guide, setGuide] = useState(false);
  if (installed || hidden || !(canPrompt || isMobileLike())) return null;
  const dismiss = () => {
    setHidden(true);
    try { localStorage.setItem('paoya_install_dismissed', '1'); } catch { /* ignore */ }
  };
  return (
    <div className="bg-white border border-green-200 rounded-2xl p-3 flex items-center gap-3 shadow-sm">
      <img src="icons/icon-192.png" alt="" className="w-10 h-10 rounded-xl" />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm text-gray-800">ติดตั้งเป๋ายาไว้บนหน้าจอ</p>
        <p className="text-xs text-gray-500">เปิดเร็ว เต็มจอ เหมือนแอปทั่วไป</p>
      </div>
      <Button size="sm" onClick={async () => { if (!(await prompt())) setGuide(true); }}>ติดตั้ง</Button>
      <button onClick={dismiss} aria-label="ไม่ต้องแสดงอีก" className="text-gray-400 hover:text-gray-600 p-1"><Icon name="x" className="w-4 h-4" /></button>
      {guide && <InstallGuideModal onClose={() => setGuide(false)} />}
    </div>
  );
}

// ---------- อ่านออกเสียง (Text-to-Speech) ----------
// ใช้เสียงที่มากับเครื่อง (Web Speech API) ไม่มีค่าใช้จ่าย ไม่ต้องต่อ AI
const tts = (() => {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const RATES = { slow: 0.8, normal: 1, fast: 1.2 };
  let rate = 'normal';
  let thaiVoice = null;
  const listeners = new Set();
  let speakingId = null;

  const pickVoice = () => {
    if (!supported) return;
    const voices = window.speechSynthesis.getVoices();
    thaiVoice = voices.find((v) => /^th/i.test(v.lang) && /google|premium|enhanced|natural/i.test(v.name))
      || voices.find((v) => /^th/i.test(v.lang)) || null;
  };
  if (supported) {
    pickVoice();
    window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
  }
  const emit = () => listeners.forEach((fn) => fn(speakingId));

  // ทำข้อความให้อ่านลื่น: ตัดอีโมจิ เครื่องหมาย markdown และขยายหน่วยยาที่พบบ่อย
  const clean = (text) => String(text || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
    .replace(/[*_#`>•]/g, ' ')
    .replace(/(\d+(?:\.\d+)?)\s*mg\b/gi, '$1 มิลลิกรัม')
    .replace(/(\d+(?:\.\d+)?)\s*mcg\b/gi, '$1 ไมโครกรัม')
    .replace(/(\d+(?:\.\d+)?)\s*ml\b/gi, '$1 มิลลิลิตร')
    .replace(/(\d{1,2}):(\d{2})/g, (_, h, m) => `${Number(h)} นาฬิกา${m !== '00' ? ` ${Number(m)} นาที` : ''}`)
    .replace(/\s+/g, ' ')
    .trim();

  function stop() {
    if (!supported) return;
    window.speechSynthesis.cancel();
    speakingId = null;
    emit();
  }

  // id ใช้บอกว่าปุ่มไหนกำลังอ่านอยู่
  function speak(text, id = 'default') {
    if (!supported) return false;
    window.speechSynthesis.cancel();
    const body = clean(text);
    if (!body) return false;
    // แบ่งเป็นท่อนสั้น ๆ (บางเบราว์เซอร์หยุดอ่านเองถ้าข้อความยาวเกินไป)
    const chunks = body.match(/[^.!?。\n]{1,180}(?:[.!?。\n]|$)|[^\s]{180,}/g) || [body];
    speakingId = id;
    emit();
    chunks.forEach((chunk, i) => {
      const u = new SpeechSynthesisUtterance(chunk.trim());
      u.lang = 'th-TH';
      if (thaiVoice) { try { u.voice = thaiVoice; } catch { /* ใช้เสียงเริ่มต้น */ } }
      u.rate = RATES[rate] || 1;
      if (i === chunks.length - 1) {
        u.onend = () => { if (speakingId === id) { speakingId = null; emit(); } };
      }
      u.onerror = () => { speakingId = null; emit(); };
      window.speechSynthesis.speak(u);
    });
    return true;
  }

  return {
    supported,
    speak,
    stop,
    setRate: (r) => { rate = r; },
    hasThaiVoice: () => { pickVoice(); return Boolean(thaiVoice); },
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    get speakingId() { return speakingId; },
  };
})();

function useSpeaking() {
  const [id, setId] = useState(tts.speakingId);
  useEffect(() => tts.subscribe(setId), []);
  return id;
}

// ปุ่มลำโพง: กดอ่าน / กดอีกครั้งหยุด
function SpeakButton({ text, id, label = 'อ่านออกเสียง', className = '', compact = false }) {
  const speakingId = useSpeaking();
  const myId = id || label + String(text).slice(0, 30);
  if (!tts.supported) return null;
  const active = speakingId === myId;
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); active ? tts.stop() : tts.speak(typeof text === 'function' ? text() : text, myId); }}
      aria-label={active ? 'หยุดอ่าน' : label} aria-pressed={active}
      className={`inline-flex items-center gap-1 font-bold transition-all active:scale-95 ${active ? 'text-white bg-[#388E3C]' : 'text-[#2D7A4C] bg-green-50 hover:bg-green-100'} ${compact ? 'p-1.5 rounded-full' : 'text-xs px-2.5 py-1.5 rounded-full'} ${className}`}>
      <Icon name={active ? 'square' : 'volume'} className={compact ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
      {!compact && (active ? 'หยุด' : label)}
    </button>
  );
}

// ---------- เสียงเตือน ----------
function playAlarm({ sound = true, vibrate = true } = {}) {
  if (vibrate && navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
  if (!sound) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.28);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch { /* บางเบราว์เซอร์ต้องแตะหน้าจอก่อนถึงจะเล่นเสียงได้ */ }
}

const nowHHMM = () => new Date().toTimeString().slice(0, 5);
const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const TIME_PRESETS = [
  { time: '08:00', label: 'เช้า', icon: 'sunrise' },
  { time: '12:00', label: 'กลางวัน', icon: 'sun' },
  { time: '18:00', label: 'เย็น', icon: 'sunset' },
  { time: '21:00', label: 'ก่อนนอน', icon: 'moon' },
];
const timeLabel = (t) => TIME_PRESETS.find((p) => p.time === t)?.label || '';