// ตัวควบคุมหลัก: สถานะเข้าสู่ระบบ การสลับหน้า แถบเมนูล่าง และแชท

const MAIN_TABS = [
  { key: 'home', icon: 'home', label: 'หน้าหลัก' },
  { key: 'mymeds', icon: 'shopping-bag', label: 'ยาของฉัน' },
  { key: 'scan', icon: 'scan', label: 'สแกน', center: true },
  { key: 'pharmacy', icon: 'map-pin', label: 'ร้านยา' },
  { key: 'settings', icon: 'settings', label: 'ตั้งค่า' },
];

function BottomNav({ screen, go }) {
  const activeKey = screen === 'med_detail' ? 'home' : screen;
  return (
    <nav className="md:hidden bg-[#E8F8F0] border-t border-[#D0EBE0] absolute bottom-0 left-0 right-0 z-40 safe-bottom">
      <div className="h-16 flex items-center justify-around px-2">
      {MAIN_TABS.map((t) => t.center ? (
        <button key={t.key} onClick={() => go(t.key)} className="flex flex-col items-center -mt-6 group" aria-label={t.label}>
          <div className="w-14 h-14 rounded-2xl bg-[#004D25] flex items-center justify-center shadow-lg text-white group-active:scale-95 transition-all border-4 border-white">
            <Icon name={t.icon} className="w-6 h-6" />
          </div>
          <span className="text-[10px] text-[#1B5E20] font-bold mt-0.5">{t.label}</span>
        </button>
      ) : (
        <button key={t.key} onClick={() => go(t.key)} aria-current={activeKey === t.key ? 'page' : undefined}
          className={`flex flex-col items-center flex-1 py-1 ${activeKey === t.key ? 'text-[#1B5E20]' : 'text-gray-400'}`}>
          <Icon name={t.icon} className="w-5 h-5" />
          <span className={`text-[10px] mt-1 ${activeKey === t.key ? 'font-bold' : ''}`}>{t.label}</span>
        </button>
      ))}
      </div>
    </nav>
  );
}

// เมนูด้านซ้ายสำหรับจอใหญ่ (iPad / คอมพิวเตอร์)
function SideNav({ screen, go, user, onOpenChat }) {
  const activeKey = screen === 'med_detail' ? 'home' : screen;
  return (
    <aside className="hidden md:flex w-60 lg:w-64 flex-shrink-0 flex-col bg-[#F3FAF6] border-r border-[#D0EBE0] safe-bottom">
      <div className="flex items-center gap-3 px-5 py-5">
        <img src="icons/icon-192.png" alt="" className="w-11 h-11 rounded-full bg-white shadow-sm" />
        <div className="min-w-0">
          <p className="font-bold text-lg text-[#004D25] leading-tight">เป๋ายา</p>
          <p className="text-xs text-gray-500 truncate">คุณ{user.firstName}</p>
        </div>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {MAIN_TABS.map((t) => (
          <button key={t.key} onClick={() => go(t.key)} aria-current={activeKey === t.key ? 'page' : undefined}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all ${activeKey === t.key ? 'bg-[#004D25] text-white font-bold shadow' : 'text-gray-600 hover:bg-white hover:text-[#004D25]'}`}>
            <Icon name={t.icon} className="w-5 h-5" /> {t.key === 'scan' ? 'สแกนฉลากยา' : t.label}
          </button>
        ))}
      </nav>
      <div className="p-3">
        <button onClick={onOpenChat}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold bg-white border border-green-200 text-[#2D7A4C] hover:bg-green-50 shadow-sm">
          <Icon name="message-square" className="w-5 h-5" /> ปรึกษาเภสัชกร AI
        </button>
      </div>
    </aside>
  );
}

function App() {
  const urlParams = new URLSearchParams(location.search);
  const urlReset = urlParams.get('reset');
  const urlScreen = MAIN_TABS.some((t) => t.key === urlParams.get('screen')) ? urlParams.get('screen') : null;
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState(urlReset ? 'reset_password' : 'welcome');
  const [screenParams, setScreenParams] = useState({});
  const [resetToken, setResetToken] = useState(urlReset || '');
  const [medicineId, setMedicineId] = useState(null);
  const [prevScreen, setPrevScreen] = useState('home');
  const [searchState, setSearchState] = useState({ query: '', category: '' });
  const [chat, setChat] = useState({ open: false, initialText: '', key: 0 });
  const [chatMessages, setChatMessages] = useState([CHAT_WELCOME]);
  const scrollRef = useRef(null);

  const go = (name, params = {}) => {
    setScreenParams(params);
    setScreen(name);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  // ลบ ?reset=... ออกจาก URL หลังอ่านแล้ว
  useEffect(() => { if (location.search) history.replaceState(null, '', location.pathname); }, []);

  // เปิดแอป: ถ้ายังเข้าสู่ระบบอยู่ (มี cookie) ไปหน้าแรกเลย
  useEffect(() => {
    api.currentUser()
      .then((u) => { if (u) { setUser(u); if (!urlReset) setScreen(urlScreen || 'home'); } })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setBooting(false));
  }, []);

  // token หมดอายุ → กลับหน้าเข้าสู่ระบบ
  useEffect(() => {
    const onLogout = () => { setUser(null); setScreen('login'); toast('กรุณาเข้าสู่ระบบอีกครั้ง', 'info'); };
    window.addEventListener('paoya:logout', onLogout);
    return () => window.removeEventListener('paoya:logout', onLogout);
  }, []);

  // ความเร็วเสียงอ่าน
  useEffect(() => { tts.setRate(user?.settings?.tts?.rate || 'normal'); }, [user?.settings?.tts?.rate]);

  // โหมดตัวอักษรใหญ่
  useEffect(() => {
    // ทุกขนาดในแอปใช้หน่วย rem จึงขยายตามขนาดตัวอักษรของ <html> ทั้งหมด
    document.documentElement.classList.remove('large-text');
    document.documentElement.style.fontSize = `${user?.settings?.textSize || 16}px`;
  }, [user?.settings?.textSize]);

  const onLoggedIn = ({ user: u }) => {
    api.setLoggedIn(true);
    setUser(u);
    setChatMessages([CHAT_WELCOME]);
    go(urlScreen || 'home');
  };

  // afterServer: true = เซิร์ฟเวอร์ลบเซสชันไปแล้ว (เช่น ลบบัญชี) ไม่ต้องเรียก /auth/logout ซ้ำ
  const logout = async ({ afterServer = false } = {}) => {
    tts.stop();
    if (!afterServer) await api.post('/auth/logout').catch(() => {});
    api.setLoggedIn(false);
    setUser(null);
    setSearchState({ query: '', category: '' });
    setChatMessages([CHAT_WELCOME]);
    go('welcome');
  };

  const openMedicine = (m, { replace = false } = {}) => {
    if (!replace && screen !== 'med_detail') setPrevScreen(screen);
    setMedicineId(m.id);
    go('med_detail');
  };

  const askAI = (text) => setChat((c) => ({ open: true, initialText: text, key: c.key + 1 }));

  if (booting) {
    return <div className="flex-1 flex items-center justify-center"><Spinner /></div>;
  }

  const authScreens = {
    welcome: <WelcomeScreen go={go} />,
    login: <LoginScreen go={go} onLoggedIn={onLoggedIn} />,
    register: <RegisterScreen go={go} onLoggedIn={onLoggedIn} />,
    forgot_password: <ForgotPasswordScreen go={go} setResetToken={setResetToken} />,
    reset_password: <ResetPasswordScreen go={go} token={resetToken} />,
  };

  if (!user || authScreens[screen]) {
    return (
      <div className="flex-1 flex flex-col h-full w-full bg-white relative overflow-hidden">
        <ToastHost />
        {authScreens[screen] || authScreens.welcome}
      </div>
    );
  }

  const openChat = () => setChat((c) => ({ open: true, initialText: '', key: c.key + 1 }));

  return (
    <div className="flex-1 flex h-full w-full bg-white relative overflow-hidden">
      <SideNav screen={screen} go={go} user={user} onOpenChat={openChat} />

      <div className="flex-1 flex flex-col relative min-w-0">
        <ToastHost />
        <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar relative flex flex-col bg-white md:bg-gray-50">
          <div className={screen === 'scan' ? 'flex-1 flex flex-col' : 'flex-1 flex flex-col w-full max-w-3xl mx-auto bg-white md:shadow-sm'}>
            {screen === 'home' && (
              <HomeScreen user={user} go={go} openMedicine={openMedicine} searchState={searchState} setSearchState={setSearchState} />
            )}
            {screen === 'med_detail' && medicineId && (
              <MedicineDetailScreen key={medicineId} medicineId={medicineId} goBack={() => go(prevScreen)} openMedicine={openMedicine} askAI={askAI} />
            )}
            {screen === 'mymeds' && <MyMedsScreen user={user} go={go} initialTab={screenParams.tab} />}
            {screen === 'scan' && <ScanScreen openMedicine={openMedicine} isActive={screen === 'scan'} askAI={askAI} />}
            {screen === 'pharmacy' && <PharmacyScreen go={go} />}
            {screen === 'settings' && <SettingsScreen user={user} setUser={setUser} go={go} onLogout={logout} />}
          </div>
        </div>

        {!['scan', 'med_detail'].includes(screen) && !chat.open && (
          <button onClick={openChat} aria-label="ปรึกษาเภสัชกร AI"
            className="md:hidden absolute fab-offset right-4 bg-[#E8F5E9] p-3 rounded-full shadow-lg text-[#2D7A4C] hover:bg-green-100 border border-green-200 active:scale-95 z-30">
            <Icon name="message-square" className="w-6 h-6" />
          </button>
        )}

        <BottomNav screen={screen} go={go} />
      </div>

      <ReminderCenter user={user} />

      {chat.open && (
        <ChatPanel key={chat.key} initialText={chat.initialText} messages={chatMessages} setMessages={setChatMessages}
          autoSpeak={Boolean(user.settings.tts?.autoSpeak)}
          onClose={() => setChat((c) => ({ ...c, open: false }))} />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);