// ตั้งค่า: ข้อมูลส่วนตัว โรคประจำตัว การแจ้งเตือน โหมดตัวอักษรใหญ่ รหัสผ่าน ออกจากระบบ ลบบัญชี

function ProfileModal({ user, onClose, onSaved }) {
  const [p, setP] = useState({
    firstName: user.firstName, lastName: user.lastName, age: user.age ?? '', bloodType: user.bloodType || '',
    weight: user.weight ?? '', height: user.height ?? '', emergencyContact: user.emergencyContact || '',
    chronicDiseases: user.chronicDiseases || [],
  });
  const [newDisease, setNewDisease] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });

  const addDisease = () => {
    const d = newDisease.trim();
    if (d && !p.chronicDiseases.includes(d)) setP({ ...p, chronicDiseases: [...p.chronicDiseases, d] });
    setNewDisease('');
  };

  const save = async () => {
    setBusy(true);
    try {
      const pending = newDisease.trim();
      const body = pending && !p.chronicDiseases.includes(pending) ? { ...p, chronicDiseases: [...p.chronicDiseases, pending] } : p;
      const { user: u } = await api.put('/me', body);
      onSaved(u);
      toast('บันทึกข้อมูลส่วนตัวแล้ว');
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const bmi = p.weight && p.height ? (Number(p.weight) / ((Number(p.height) / 100) ** 2)).toFixed(1) : null;

  return (
    <Modal title="ข้อมูลส่วนตัว" icon="user" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="ชื่อ"><input className={inputCls} value={p.firstName} onChange={set('firstName')} /></Field>
          <Field label="นามสกุล"><input className={inputCls} value={p.lastName} onChange={set('lastName')} /></Field>
          <Field label="อายุ (ปี)"><input type="number" min="1" className={inputCls} value={p.age} onChange={set('age')} /></Field>
          <Field label="หมู่เลือด">
            <select className={inputCls} value={p.bloodType} onChange={set('bloodType')}>
              <option value="">ไม่ระบุ</option><option>A</option><option>B</option><option>AB</option><option>O</option>
            </select>
          </Field>
          <Field label="น้ำหนัก (กก.)"><input type="number" min="1" step="0.1" className={inputCls} value={p.weight} onChange={set('weight')} /></Field>
          <Field label="ส่วนสูง (ซม.)"><input type="number" min="30" className={inputCls} value={p.height} onChange={set('height')} /></Field>
        </div>
        {bmi && <p className="text-[11px] text-gray-500 -mt-1">ดัชนีมวลกาย (BMI): <b>{bmi}</b></p>}

        <div className="space-y-1.5">
          <span className="text-xs text-gray-700 block font-bold">โรคประจำตัว</span>
          <div className="flex gap-2">
            <input placeholder="เช่น หอบหืด, ไตเรื้อรัง" value={newDisease} onChange={(e) => setNewDisease(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDisease(); } }} className={`${inputCls} py-2`} />
            <Button size="sm" className="whitespace-nowrap" onClick={addDisease}>+ เพิ่ม</Button>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {p.chronicDiseases.length === 0 ? <span className="text-gray-400 italic text-[11px]">ไม่มีโรคประจำตัว</span>
              : p.chronicDiseases.map((d) => (
                <span key={d} className="bg-green-50 text-[#2D7A4C] border border-green-200 px-2.5 py-1 rounded-lg flex items-center gap-1 font-medium text-[11px]">
                  {d}
                  <button type="button" aria-label={`ลบ ${d}`} onClick={() => setP({ ...p, chronicDiseases: p.chronicDiseases.filter((x) => x !== d) })} className="text-red-400 hover:text-red-600 ml-1">
                    <Icon name="x" className="w-3 h-3" />
                  </button>
                </span>
              ))}
          </div>
        </div>

        <Field label={<span className="text-red-500 font-bold">เบอร์โทรติดต่อฉุกเฉิน</span>}>
          <input type="tel" className={`${inputCls} border-red-200 bg-red-50/30 font-bold`} value={p.emergencyContact} onChange={set('emergencyContact')} placeholder="08x-xxx-xxxx" />
        </Field>
        <Button className="w-full" onClick={save} disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</Button>
      </div>
    </Modal>
  );
}

function PasswordModal({ onClose }) {
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (f.newPassword !== f.confirm) return setError('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
    try {
      const res = await api.put('/me/password', f);
      toast(res.message);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal title="เปลี่ยนรหัสผ่าน" icon="lock" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="รหัสผ่านเดิม"><PasswordInput autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} required /></Field>
        <Field label="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)"><PasswordInput autoComplete="new-password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} required minLength={8} /></Field>
        <Field label="ยืนยันรหัสผ่านใหม่"><PasswordInput autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required /></Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full">บันทึก</Button>
      </form>
    </Modal>
  );
}

function SessionsModal({ onClose, onLoggedOutHere }) {
  const sessions = useApi('/me/sessions');
  const items = sessions.data?.items || [];
  const fmt = (iso) => {
    const d = new Date(iso);
    return `${formatDateTH(d.toLocaleDateString('sv-SE'))} ${d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
  };
  const revoke = async (s) => {
    try {
      await api.del(`/me/sessions/${s.id}`);
      if (s.current) return onLoggedOutHere();
      toast('ออกจากระบบอุปกรณ์นั้นแล้ว', 'info');
      sessions.reload();
    } catch (err) { toast(err.message, 'error'); }
  };
  const revokeOthers = async () => {
    try {
      const r = await api.post('/me/sessions/revoke-others');
      toast(`ออกจากระบบอุปกรณ์อื่น ${r.revoked} เครื่องแล้ว`, 'info');
      sessions.reload();
    } catch (err) { toast(err.message, 'error'); }
  };
  return (
    <Modal title="อุปกรณ์ที่เข้าสู่ระบบ" icon="shield" onClose={onClose} wide>
      {sessions.loading ? <Spinner /> : sessions.error ? <ErrorText>{sessions.error}</ErrorText> : (
        <div className="space-y-2">
          {items.map((s) => (
            <div key={s.id} className={`p-3 rounded-xl border flex justify-between items-center gap-2 ${s.current ? 'border-green-200 bg-green-50/50' : 'border-gray-100'}`}>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-800">{s.device}{s.current && <span className="ml-1.5 text-[10px] bg-green-600 text-white px-1.5 py-0.5 rounded-full">เครื่องนี้</span>}</p>
                <p className="text-[11px] text-gray-500">ใช้งานล่าสุด {fmt(s.lastSeenAt)}</p>
              </div>
              <button onClick={() => revoke(s)} className="text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg font-bold whitespace-nowrap">ออกจากระบบ</button>
            </div>
          ))}
          {items.length > 1 && (
            <Button variant="danger" className="w-full mt-2" onClick={revokeOthers}>ออกจากระบบอุปกรณ์อื่นทั้งหมด</Button>
          )}
          <p className="text-[11px] text-gray-400">ถ้าเห็นอุปกรณ์ที่ไม่รู้จัก ให้ออกจากระบบอุปกรณ์นั้นแล้วเปลี่ยนรหัสผ่านทันที</p>
        </div>
      )}
    </Modal>
  );
}

function DeleteAccountModal({ onClose, onDeleted }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.del('/me', { password });
      toast('ลบบัญชีและข้อมูลทั้งหมดแล้ว', 'info');
      onDeleted();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal title="ลบบัญชี" icon="trash" iconClass="text-red-600" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-gray-600">ข้อมูลทั้งหมด (ยาประจำ นัดหมาย ประวัติแพ้ยา บันทึกสุขภาพ) จะถูกลบถาวร กู้คืนไม่ได้</p>
        <Field label="ยืนยันด้วยรหัสผ่าน"><PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" variant="danger" className="w-full">ลบบัญชีถาวร</Button>
      </form>
    </Modal>
  );
}

// ขอสิทธิ์แสดงการแจ้งเตือนของระบบ (เด้งเตือนแม้สลับไปแอปอื่น ขณะที่เป๋ายายังเปิดอยู่)
function NotificationPermissionRow() {
  const supported = 'Notification' in window;
  const [perm, setPerm] = useState(supported ? Notification.permission : 'unsupported');
  if (!supported) return null;
  const ask = async () => {
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === 'granted') toast('เปิดการแจ้งเตือนของเครื่องแล้ว');
    else toast('ไม่ได้รับอนุญาต เปิดได้ในการตั้งค่าเบราว์เซอร์', 'info');
  };
  return (
    <SettingsRow icon="bell" box="bg-green-50 text-[#2D7A4C]" title="แจ้งเตือนของเครื่อง"
      sub={perm === 'granted' ? 'เปิดแล้ว: เด้งเตือนแม้อยู่ในแอปอื่น' : perm === 'denied' ? 'ถูกปิดไว้ เปิดได้ในการตั้งค่าเบราว์เซอร์' : 'ให้เด้งเตือนแม้สลับไปแอปอื่น'}
      right={perm === 'granted' ? <Icon name="check-circle" className="w-5 h-5 text-green-600" />
        : perm === 'denied' ? null : <Button size="sm" onClick={ask}>อนุญาต</Button>} />
  );
}

// แถบเลื่อนขนาดตัวอักษร: ลากได้อิสระ ซ้ายสุด = เล็กสุด, ขวาสุด = ใหญ่สุด
// ทำให้ลื่น ไม่กระตุก:
//  1) ปรับละเอียดทีละ 0.1px (ไม่กระโดดเป็นขั้น)
//  2) อัปเดตขนาดไม่เกิน 1 ครั้งต่อเฟรมจอ (requestAnimationFrame) และไม่ให้ React วาดใหม่ระหว่างลาก
//  3) ล็อกตำแหน่งแถบเลื่อนให้อยู่ใต้นิ้วตลอด แม้เนื้อหาด้านบนจะขยาย/หด
const TEXT_MIN_PX = 14;
const TEXT_MAX_PX = 24;
const TEXT_DEFAULT_PX = 16;

function scrollParentOf(el) {
  let node = el?.parentElement;
  while (node && node !== document.body) {
    const oy = getComputedStyle(node).overflowY;
    if (oy === 'auto' || oy === 'scroll') return node;
    node = node.parentElement;
  }
  return document.scrollingElement;
}

function TextSizeSlider({ value, onSave }) {
  const inputRef = useRef(null);
  const labelRef = useRef(null);
  const frame = useRef(0);
  const pending = useRef(value);
  const saveTimer = useRef(null);
  const [isDefault, setIsDefault] = useState(value === TEXT_DEFAULT_PX);

  const paint = (px) => {
    const el = inputRef.current;
    if (!el) return;
    const scroller = scrollParentOf(el);
    // ปิดระบบเลื่อนชดเชยอัตโนมัติของเบราว์เซอร์ (scroll anchoring) ไม่ให้ทำซ้อนกับของเรา
    if (scroller && scroller.style.overflowAnchor !== 'none') scroller.style.overflowAnchor = 'none';
    const before = el.getBoundingClientRect().top;
    document.documentElement.style.fontSize = `${px}px`;
    el.style.setProperty('--fill', `${((px - TEXT_MIN_PX) / (TEXT_MAX_PX - TEXT_MIN_PX)) * 100}%`);
    if (labelRef.current) labelRef.current.textContent = `${Math.round((px / TEXT_DEFAULT_PX) * 100)}%`;
    // เนื้อหาด้านบนเปลี่ยนความสูง → เลื่อนหน้าชดเชย ให้แถบอยู่ที่เดิมใต้นิ้ว
    const after = el.getBoundingClientRect().top;
    if (scroller && Math.abs(after - before) > 0.5) scroller.scrollTop += after - before;
  };

  // ค่าจากเซิร์ฟเวอร์เปลี่ยน (เช่น เปิดจากเครื่องอื่น) → ตั้งตำแหน่งแถบใหม่
  useEffect(() => {
    if (inputRef.current && Number(inputRef.current.value) !== value) inputRef.current.value = value;
    pending.current = value;
    paint(value);
    setIsDefault(value === TEXT_DEFAULT_PX);
  }, [value]);

  useEffect(() => () => { cancelAnimationFrame(frame.current); clearTimeout(saveTimer.current); }, []);

  const save = (px) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onSave(px), 400);
  };

  const onInput = (e) => {
    // ระหว่างลาก: ปิดแอนิเมชันทั้งหน้า ไม่ให้ขนาดค่อย ๆ ไหลตามหลังจนแถบขยับหนีนิ้ว
    document.documentElement.classList.add('resizing-text');
    pending.current = Number(e.target.value);
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        paint(pending.current);
      });
    }
    save(pending.current);
  };

  const commit = () => {
    requestAnimationFrame(() => document.documentElement.classList.remove('resizing-text'));
    setIsDefault(Math.abs(pending.current - TEXT_DEFAULT_PX) < 0.05);
    save(pending.current);
  };

  const reset = () => {
    if (inputRef.current) inputRef.current.value = TEXT_DEFAULT_PX;
    pending.current = TEXT_DEFAULT_PX;
    paint(TEXT_DEFAULT_PX);
    setIsDefault(true);
    save(TEXT_DEFAULT_PX);
  };

  return (
    <div className="p-3.5 space-y-3">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-purple-50 text-purple-600"><Icon name="type" className="w-5 h-5" /></div>
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-sm text-gray-800">ขนาดตัวอักษร</h4>
          <p className="text-xs text-gray-400">ลากไปทางขวาเพื่อขยาย ทางซ้ายเพื่อย่อ</p>
        </div>
        <span ref={labelRef} className="text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full whitespace-nowrap tabular-nums">
          {Math.round((value / TEXT_DEFAULT_PX) * 100)}%
        </span>
      </div>

      {/* แถวแถบเลื่อนใช้ขนาดแบบ px คงที่ จะได้ไม่ยืด/หดตามตัวอักษรระหว่างลาก */}
      <div className="flex items-center" style={{ gap: '12px', height: '36px' }}>
        <span className="font-bold text-gray-500 leading-none" style={{ fontSize: '13px' }} aria-hidden="true">ก</span>
        <input ref={inputRef} type="range" min={TEXT_MIN_PX} max={TEXT_MAX_PX} step="0.1" defaultValue={value}
          onInput={onInput} onChange={() => {}} onPointerUp={commit} onKeyUp={commit} onTouchEnd={commit}
          aria-label="ขนาดตัวอักษร"
          className="paoya-range flex-1"
          style={{ '--fill': `${((value - TEXT_MIN_PX) / (TEXT_MAX_PX - TEXT_MIN_PX)) * 100}%` }} />
        <span className="font-bold text-gray-700 leading-none" style={{ fontSize: '28px' }} aria-hidden="true">ก</span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-50 rounded-xl p-3 border border-gray-100">
          <p className="text-sm text-gray-700">ตัวอย่าง: Amlodipine 5 mg ทานวันละ 1 เม็ด หลังอาหารเช้า</p>
        </div>
        {!isDefault && (
          <button type="button" onClick={reset}
            className="text-xs font-bold text-gray-500 hover:text-[#2D7A4C] px-2 py-1 whitespace-nowrap">คืนค่าปกติ</button>
        )}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-[#388E3C]' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

function SettingsRow({ icon, box, title, sub, onClick, right, danger }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick}
      className={`w-full text-left p-3.5 flex items-center justify-between ${onClick ? (danger ? 'hover:bg-red-50' : 'hover:bg-gray-50') : ''} transition-all`}>
      <div className="flex items-center space-x-3 min-w-0">
        <div className={`p-2 rounded-xl ${box}`}><Icon name={icon} className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h4 className={`font-bold text-sm ${danger ? 'text-red-600' : 'text-gray-800'}`}>{title}</h4>
          {sub && <p className="text-xs text-gray-400 truncate">{sub}</p>}
        </div>
      </div>
      {right || (onClick && <Icon name="chevron-right" className={`w-4 h-4 ${danger ? 'text-red-400' : 'text-gray-400'}`} />)}
    </Tag>
  );
}

function SettingsScreen({ user, setUser, go, onLogout }) {
  const [modal, setModal] = useState(null);
  const install = useInstall();
  const s = user.settings;

  const saveSettings = async (patch) => {
    try {
      const { user: u } = await api.put('/me/settings', patch);
      setUser(u);
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  const setNotif = (k) => (v) => saveSettings({ notifications: { [k]: v } });

  return (
    <div className="flex-1 flex flex-col pb-nav bg-gray-50 min-h-full">
      <TopBar title="ตั้งค่า" />
      <div className="p-4 space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-green-100 text-[#2D7A4C] flex items-center justify-center font-bold text-lg">
            {user.firstName.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-gray-800">{user.firstName} {user.lastName}</p>
            <p className="text-xs text-gray-400 truncate">@{user.username} • {user.email}</p>
          </div>
        </div>

        <div>
          <span className="text-xs font-bold text-gray-400 px-2 mb-2 block">ข้อมูลส่วนบุคคล & สุขภาพ</span>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-100">
            <SettingsRow icon="user" box="bg-green-50 text-[#2D7A4C]" title="ข้อมูลส่วนตัว & โรคประจำตัว"
              sub={`โรคประจำตัว ${user.chronicDiseases.length} โรค • เบอร์ฉุกเฉิน ${user.emergencyContact || 'ยังไม่ตั้ง'}`} onClick={() => setModal('profile')} />
            <SettingsRow icon="alert-triangle" box="bg-red-50 text-red-500" title="ประวัติแพ้ยา & บัตรแพ้ยา"
              sub="ระบบเตือนอัตโนมัติเมื่อเจอยาที่แพ้" onClick={() => go('mymeds', { tab: 'allergies' })} />
          </div>
        </div>

        <div>
          <span className="text-xs font-bold text-gray-400 px-2 mb-2 block">การแจ้งเตือนและการแสดงผล</span>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-100">
            <SettingsRow icon="bell" box="bg-yellow-50 text-yellow-600" title="เปิดการแจ้งเตือน" sub="แสดงเตือนยาใกล้หมดและนัดหมายในหน้าแรก"
              right={<Toggle label="เปิดการแจ้งเตือน" checked={s.notifications.enableAll} onChange={setNotif('enableAll')} />} />
            {s.notifications.enableAll && (
              <>
                <SettingsRow icon="alarm" box="bg-green-50 text-[#2D7A4C]" title="เตือนกินยาตามเวลา" sub="ตั้งเวลาได้ที่ ยาของฉัน → ยาประจำ"
                  right={<Toggle label="เตือนกินยาตามเวลา" checked={s.notifications.medReminder} onChange={setNotif('medReminder')} />} />
                {s.notifications.medReminder && (
                  <>
                    <SettingsRow icon="bell-ring" box="bg-green-50 text-[#2D7A4C]" title="เสียงเตือน"
                      right={<Toggle label="เสียงเตือน" checked={s.notifications.sound} onChange={setNotif('sound')} />} />
                    <SettingsRow icon="volume" box="bg-green-50 text-[#2D7A4C]" title="อ่านชื่อยาออกเสียงตอนเตือน"
                      right={<Toggle label="อ่านชื่อยาออกเสียงตอนเตือน" checked={s.notifications.speakReminders} onChange={setNotif('speakReminders')} />} />
                    <SettingsRow icon="activity" box="bg-green-50 text-[#2D7A4C]" title="สั่นเตือน" sub="เฉพาะมือถือ Android"
                      right={<Toggle label="สั่นเตือน" checked={s.notifications.vibrate} onChange={setNotif('vibrate')} />} />
                    <NotificationPermissionRow />
                  </>
                )}
                <SettingsRow icon="package" box="bg-amber-50 text-amber-600" title="เตือนเมื่อยาใกล้หมด" sub="เมื่อเหลือไม่เกิน 3 วัน"
                  right={<Toggle label="เตือนเมื่อยาใกล้หมด" checked={s.notifications.refillReminder} onChange={setNotif('refillReminder')} />} />
              </>
            )}
            <TextSizeSlider value={s.textSize || 16} onSave={(v) => saveSettings({ textSize: v })} />
          </div>
        </div>

        <div>
          <span className="text-xs font-bold text-gray-400 px-2 mb-2 block">อ่านออกเสียง</span>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-100">
            {!tts.supported ? (
              <p className="p-4 text-xs text-gray-500">เบราว์เซอร์นี้ไม่รองรับการอ่านออกเสียง ลองใช้ Chrome, Edge หรือ Safari</p>
            ) : (
              <>
                <SettingsRow icon="volume" box="bg-blue-50 text-blue-600" title="อ่านคำตอบเภสัชกร AI อัตโนมัติ" sub="ไม่ต้องกดปุ่มลำโพงทุกครั้ง"
                  right={<Toggle label="อ่านคำตอบ AI อัตโนมัติ" checked={Boolean(s.tts?.autoSpeak)} onChange={(v) => saveSettings({ tts: { autoSpeak: v } })} />} />
                <div className="p-3.5 space-y-2">
                  <p className="text-sm font-bold text-gray-800">ความเร็วเสียง</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[['slow', 'ช้า'], ['normal', 'ปกติ'], ['fast', 'เร็ว']].map(([v, label]) => (
                      <button key={v} onClick={() => saveSettings({ tts: { rate: v } })}
                        className={`py-2 rounded-xl text-xs font-bold border ${(s.tts?.rate || 'normal') === v ? 'bg-[#388E3C] text-white border-[#388E3C]' : 'bg-white text-gray-600 border-gray-200'}`}>{label}</button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-gray-500">{tts.hasThaiVoice() ? 'พบเสียงภาษาไทยในเครื่อง' : 'ไม่พบเสียงภาษาไทยในเครื่อง (อาจอ่านเป็นสำเนียงอื่น)'}</span>
                    <SpeakButton id="tts-test" label="ทดลองฟัง" text="สวัสดีค่ะ นี่คือเสียงอ่านของแอปเป๋ายา ถึงเวลากินยา แอมโลดิพีน 5 มิลลิกรัม 1 เม็ด" />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-100">
          {!install.installed && (
            <SettingsRow icon="plus-circle" box="bg-green-50 text-[#2D7A4C]" title="ติดตั้งแอปบนเครื่องนี้" sub="เพิ่มไอคอนเป๋ายาไว้บนหน้าจอโฮม"
              onClick={async () => { if (!(await install.prompt())) setModal('install'); }} />
          )}
          <SettingsRow icon="help-circle" box="bg-gray-100 text-gray-600" title="ช่วยเหลือ & เบอร์ฉุกเฉิน" onClick={() => setModal('help')} />
          <SettingsRow icon="lock" box="bg-gray-100 text-gray-600" title="เปลี่ยนรหัสผ่าน" onClick={() => setModal('password')} />
          <SettingsRow icon="shield" box="bg-gray-100 text-gray-600" title="อุปกรณ์ที่เข้าสู่ระบบ" sub="ดูและออกจากระบบอุปกรณ์อื่น" onClick={() => setModal('sessions')} />
          <SettingsRow icon="log-out" box="bg-red-50 text-red-600" title="ออกจากระบบ" danger onClick={() => setModal('logout')} />
        </div>

        <button onClick={() => setModal('delete')} className="w-full text-center text-xs text-gray-400 hover:text-red-600 py-2">ลบบัญชีและข้อมูลทั้งหมด</button>
      </div>

      {modal === 'profile' && <ProfileModal user={user} onClose={() => setModal(null)} onSaved={setUser} />}
      {modal === 'password' && <PasswordModal onClose={() => setModal(null)} />}
      {modal === 'install' && <InstallGuideModal onClose={() => setModal(null)} />}
      {modal === 'sessions' && <SessionsModal onClose={() => setModal(null)} onLoggedOutHere={() => onLogout({ afterServer: true })} />}
      {modal === 'delete' && <DeleteAccountModal onClose={() => setModal(null)} onDeleted={() => onLogout({ afterServer: true })} />}
      {modal === 'logout' && (
        <ConfirmModal title="ออกจากระบบ?" message="คุณต้องการออกจากระบบแอปเป๋ายาใช่หรือไม่" confirmText="ออกจากระบบ" danger
          onCancel={() => setModal(null)} onConfirm={() => onLogout()} />
      )}
      {modal === 'help' && (
        <Modal title="ช่วยเหลือ" icon="headphones" onClose={() => setModal(null)}>
          <p className="text-xs text-gray-500">กดเพื่อโทรออก (บนมือถือ)</p>
          <div className="space-y-2">
            <a href="tel:1669" className="block w-full text-center bg-red-50 hover:bg-red-100 text-red-600 py-2.5 rounded-xl font-bold text-sm border border-red-200">
              🚨 เจ็บป่วยฉุกเฉิน 1669
            </a>
            <a href="tel:1367" className="block w-full text-center bg-amber-50 hover:bg-amber-100 text-amber-700 py-2.5 rounded-xl font-bold text-sm border border-amber-200">
              ☎️ ศูนย์พิษวิทยา (ได้รับยาเกินขนาด/สารพิษ) 1367
            </a>
            {user.emergencyContact && (
              <a href={`tel:${user.emergencyContact.replace(/[^\d+]/g, '')}`} className="block w-full text-center bg-green-50 hover:bg-green-100 text-[#2D7A4C] py-2.5 rounded-xl font-bold text-sm border border-green-200">
                👤 ผู้ติดต่อฉุกเฉินของฉัน {user.emergencyContact}
              </a>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}