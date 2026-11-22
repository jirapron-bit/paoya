// หน้าต้อนรับ / เข้าสู่ระบบ / สมัครสมาชิก / ลืมรหัสผ่าน / ตั้งรหัสใหม่

function AuthLayout({ onBack, icon = 'pill', title, subtitle, children }) {
  return (
    <div className="flex-1 flex flex-col p-6 bg-white overflow-y-auto">
      {onBack && (
        <button onClick={onBack} aria-label="ย้อนกลับ"
          className="self-start p-2 -ml-2 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-100">
          <Icon name="chevron-left" className="w-7 h-7" />
        </button>
      )}
      <div className="flex-1 flex flex-col justify-center max-w-xs mx-auto w-full py-4">
        <div className="flex justify-center mb-2"><Icon name={icon} className="w-12 h-12 text-gray-800" /></div>
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-1">{title}</h2>
        {subtitle && <p className="text-xs text-center text-gray-500 mb-4">{subtitle}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

const pillInput = 'w-full px-4 py-2.5 rounded-full border border-gray-300 focus:outline-none focus:border-[#2D7A4C] focus:ring-2 focus:ring-green-100 text-sm';

function WelcomeScreen({ go }) {
  return (
    <div className="flex-1 flex flex-col justify-between items-center p-8 bg-white">
      <div className="flex-1 flex flex-col items-center justify-center">
        <img src="icons/icon-512.png" alt="โลโก้เป๋ายา" className="w-36 h-36 md:w-44 md:h-44 object-contain rounded-full shadow-lg mb-6" />
        <h1 className="text-3xl font-bold text-[#2D7A4C] tracking-wide">เป๋ายา</h1>
        <p className="text-gray-500 text-sm mt-2">ผู้ช่วยและดูแลเรื่องยาของคุณ</p>
      </div>
      <div className="w-full max-w-sm space-y-3 mb-4 safe-bottom">
        <Button size="lg" className="w-full text-lg py-3.5" onClick={() => go('login')}>เข้าสู่ระบบ</Button>
        <Button size="lg" variant="outline" className="w-full" onClick={() => go('register')}>สร้างบัญชีใหม่</Button>
      </div>
    </div>
  );
}

function LoginScreen({ go, onLoggedIn }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api.post('/auth/login', { login, password });
      onLoggedIn(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout onBack={() => go('welcome')} title="เข้าสู่ระบบ">
      <form onSubmit={submit} className="space-y-4">
        <Field label="อีเมล หรือ ชื่อผู้ใช้">
          <input type="text" autoComplete="username" placeholder="ใส่อีเมล หรือ ชื่อผู้ใช้" value={login}
            onChange={(e) => setLogin(e.target.value)} required className={pillInput} />
        </Field>
        <Field label="รหัสผ่าน">
          <PasswordInput autoComplete="current-password" placeholder="ใส่รหัสผ่าน" value={password}
            onChange={(e) => setPassword(e.target.value)} required className={pillInput} />
        </Field>
        <div className="flex justify-between items-center text-xs pt-1">
          <button type="button" onClick={() => go('forgot_password')} className="text-[#2D7A4C] hover:underline font-medium">ลืมรหัสผ่าน</button>
          <button type="button" onClick={() => go('register')} className="text-[#2D7A4C] hover:underline font-medium">สร้างบัญชี</button>
        </div>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" size="lg" className="w-full mt-2" disabled={busy}>
          {busy ? 'กำลังเข้าสู่ระบบ...' : 'ยืนยัน'}
        </Button>
      </form>
    </AuthLayout>
  );
}

function RegisterScreen({ go, onLoggedIn }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', age: '', disease: '', email: '', username: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
    if (form.password.length < 8) return setError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
    setBusy(true);
    setError('');
    try {
      const data = await api.post('/auth/register', form);
      toast(`ยินดีต้อนรับ คุณ${data.user.firstName}`);
      onLoggedIn(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout onBack={() => go('login')} title="สร้างบัญชี">
      <form onSubmit={submit} className="space-y-3.5 pb-4">
        <div className="flex gap-2.5">
          <Field label="ชื่อ" className="flex-1 min-w-0">
            <input type="text" placeholder="ชื่อ" value={form.firstName} onChange={set('firstName')} required className={pillInput} />
          </Field>
          <Field label="นามสกุล" className="flex-1 min-w-0">
            <input type="text" placeholder="นามสกุล" value={form.lastName} onChange={set('lastName')} required className={pillInput} />
          </Field>
        </div>
        <Field label="อายุ">
          <input type="number" min="1" max="130" placeholder="อายุ (ปี)" value={form.age} onChange={set('age')} required className={pillInput} />
        </Field>
        <Field label="โรคประจำตัว (ถ้ามี)">
          <input type="text" placeholder="ระบุโรคประจำตัว หรือเว้นว่าง" value={form.disease} onChange={set('disease')} className={pillInput} />
        </Field>
        <Field label="อีเมล">
          <input type="email" autoComplete="email" placeholder="example@email.com" value={form.email} onChange={set('email')} required className={pillInput} />
        </Field>
        <Field label="ชื่อผู้ใช้" hint="ภาษาอังกฤษหรือตัวเลข 3 ตัวขึ้นไป">
          <input type="text" autoComplete="username" placeholder="ตั้งชื่อผู้ใช้" value={form.username} onChange={set('username')}
            required pattern="[a-zA-Z0-9_.\-]{3,50}" className={pillInput} />
        </Field>
        <Field label="สร้างรหัสผ่าน" hint="อย่างน้อย 8 ตัวอักษร">
          <PasswordInput autoComplete="new-password" placeholder="สร้างรหัสผ่าน" value={form.password} onChange={set('password')} required minLength={8} className={pillInput} />
        </Field>
        <Field label="ยืนยันรหัสผ่าน">
          <PasswordInput autoComplete="new-password" placeholder="ยืนยันรหัสผ่านอีกครั้ง" value={form.confirm} onChange={set('confirm')} required className={pillInput} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" size="lg" className="w-full mt-2" disabled={busy}>
          {busy ? 'กำลังสร้างบัญชี...' : 'ยืนยัน'}
        </Button>
      </form>
    </AuthLayout>
  );
}

function ForgotPasswordScreen({ go, setResetToken }) {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e && e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setResult(await api.post('/auth/forgot-password', { email }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout onBack={() => (result ? setResult(null) : go('login'))} icon="key-round" title="ลืมรหัสผ่าน"
      subtitle={!result ? 'กรอกอีเมลที่ใช้สมัคร เพื่อรับลิงก์ตั้งรหัสผ่านใหม่' : `ส่งคำขอสำหรับ ${email} แล้ว`}>
      {!result ? (
        <form onSubmit={submit} className="space-y-4">
          <input type="email" placeholder="ใส่อีเมลของคุณ" value={email} onChange={(e) => setEmail(e.target.value)} required className={pillInput} />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? 'กำลังส่ง...' : 'ส่งลิงก์ตั้งรหัสผ่านใหม่'}</Button>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 text-[#2D7A4C] text-xs text-center rounded-2xl px-4 py-4 leading-relaxed">
            {result.message}
          </div>
          {result.devResetToken && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-2xl px-4 py-3 space-y-2">
              <p><b>โหมดทดสอบ:</b> ยังไม่ได้ต่อระบบส่งอีเมล ลิงก์จะแสดงในหน้าต่าง terminal ที่รันเซิร์ฟเวอร์ หรือกดปุ่มด้านล่างได้เลย</p>
              <Button variant="dark" size="sm" className="w-full"
                onClick={() => { setResetToken(result.devResetToken); go('reset_password'); }}>
                ตั้งรหัสผ่านใหม่ตอนนี้
              </Button>
            </div>
          )}
          <Button size="lg" className="w-full" onClick={() => go('login')}>กลับไปหน้าเข้าสู่ระบบ</Button>
          <button type="button" onClick={submit} disabled={busy} className="block w-full text-center text-xs text-gray-500 hover:text-gray-700 pt-1">
            ส่งอีกครั้ง
          </button>
        </div>
      )}
    </AuthLayout>
  );
}

function ResetPasswordScreen({ go, token }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
    setBusy(true);
    setError('');
    try {
      const data = await api.post('/auth/reset-password', { token, password });
      toast(data.message);
      go('login');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout onBack={() => go('login')} icon="lock" title="ตั้งรหัสผ่านใหม่">
      {!token ? (
        <ErrorText>ลิงก์ไม่ถูกต้อง กรุณาขอลิงก์ใหม่จากหน้า "ลืมรหัสผ่าน"</ErrorText>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="รหัสผ่านใหม่" hint="อย่างน้อย 8 ตัวอักษร">
            <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className={pillInput} />
          </Field>
          <Field label="ยืนยันรหัสผ่านใหม่">
            <PasswordInput autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className={pillInput} />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}</Button>
        </form>
      )}
    </AuthLayout>
  );
}
