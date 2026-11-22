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
              <SettingsRow icon="package" box="bg-amber-50 text-amber-600" title="เตือนเมื่อยาใกล้หมด" sub="เมื่อเหลือไม่เกิน 3 วัน"
                right={<Toggle label="เตือนเมื่อยาใกล้หมด" checked={s.notifications.refillReminder} onChange={setNotif('refillReminder')} />} />
            )}
            <SettingsRow icon="type" box="bg-purple-50 text-purple-600" title="โหมดผู้สูงอายุ (ตัวอักษรใหญ่)" sub="ขยายตัวอักษรทั้งแอป"
              right={<Toggle label="ตัวอักษรใหญ่" checked={s.largeText} onChange={(v) => saveSettings({ largeText: v })} />} />
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
