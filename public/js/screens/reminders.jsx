// เตือนกินยา: รายการยาวันนี้ (หน้าแรก) + ตัวเตือนเมื่อถึงเวลา (เสียง สั่น อ่านออกเสียง แจ้งเตือนของระบบ)

// โหลดรายการยาที่ต้องกินวันนี้ และโหลดใหม่เมื่อมีการเปลี่ยนแปลง / ทุก 5 นาที / ข้ามวัน
function useTodayDoses(enabled = true) {
  const [state, setState] = useState({ date: todayISO(), doses: [], loading: true });
  const load = useCallback(async () => {
    const date = todayISO();
    try {
      const data = await api.get(`/meds/today?date=${date}`);
      setState({ date, doses: data.doses, loading: false });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);
  useEffect(() => {
    if (!enabled) return undefined;
    load();
    const onChange = () => load();
    window.addEventListener('paoya:doses-changed', onChange);
    const timer = setInterval(() => { if (todayISO() !== state.date) load(); }, 60 * 1000);
    const refresh = setInterval(load, 5 * 60 * 1000);
    return () => { window.removeEventListener('paoya:doses-changed', onChange); clearInterval(timer); clearInterval(refresh); };
  }, [enabled, load, state.date]);
  return { ...state, reload: load };
}

async function markDose(dose, status, date = todayISO()) {
  try {
    if (status === 'pending') await api.del(`/meds/${dose.medId}/doses`, { date, time: dose.time });
    else await api.post(`/meds/${dose.medId}/doses`, { date, time: dose.time, status });
    window.dispatchEvent(new Event('paoya:doses-changed'));
    return true;
  } catch (err) {
    toast(err.message, 'error');
    return false;
  }
}

const doseText = (d) => `${d.name}${d.dosage ? ` ${d.dosage}` : ''} ${d.amount} เม็ด`;

// ---------- การ์ด "ยาวันนี้" ในหน้าแรก ----------
function TodayDosesCard({ go }) {
  const { doses, loading } = useTodayDoses();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 60 * 1000); return () => clearInterval(t); }, []);

  if (loading) return null;
  if (!doses.length) {
    return (
      <button onClick={() => go('mymeds', { tab: 'meds' })}
        className="w-full text-left bg-white border border-dashed border-green-300 rounded-2xl p-3.5 flex items-center gap-3">
        <div className="p-2 bg-green-50 text-[#2D7A4C] rounded-xl"><Icon name="alarm" /></div>
        <div className="flex-1">
          <p className="font-bold text-sm text-gray-800">ตั้งเวลาเตือนกินยา</p>
          <p className="text-xs text-gray-500">เลือกเวลา เช้า กลางวัน เย็น ก่อนนอน ให้แอปเตือนและนับยาให้</p>
        </div>
        <Icon name="chevron-right" className="w-4 h-4 text-gray-400" />
      </button>
    );
  }

  const now = minutesOf(nowHHMM());
  const taken = doses.filter((d) => d.status === 'taken').length;
  const groups = [...new Set(doses.map((d) => d.time))].map((time) => ({ time, items: doses.filter((d) => d.time === time) }));
  const summaryForSpeech = () => {
    const pending = doses.filter((d) => d.status === 'pending');
    if (!pending.length) return 'วันนี้กินยาครบทุกมื้อแล้ว เยี่ยมมาก';
    return `ยาที่ยังไม่ได้กินวันนี้ ${pending.map((d) => `เวลา ${d.time} ${doseText(d)}`).join(' ')}`;
  };

  return (
    <div className="bg-white border border-green-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 bg-green-50 flex items-center justify-between gap-2">
        <div>
          <p className="font-bold text-sm text-[#004D25] flex items-center gap-1.5"><Icon name="alarm" className="w-4 h-4" /> ยาวันนี้</p>
          <p className="text-xs text-gray-600">กินแล้ว {taken} จาก {doses.length} มื้อ</p>
        </div>
        <div className="flex items-center gap-2">
          <SpeakButton text={summaryForSpeech} id="today-doses" label="ฟัง" />
          <div className="w-10 h-10 rounded-full border-4 border-green-200 flex items-center justify-center text-[11px] font-bold text-[#2D7A4C]"
            style={{ borderTopColor: taken ? '#388E3C' : undefined }}>
            {Math.round((taken / doses.length) * 100)}%
          </div>
        </div>
      </div>
      <div className="divide-y divide-gray-100">
        {groups.map((g) => {
          const overdue = now > minutesOf(g.time) + 30;
          return (
            <div key={g.time} className="px-4 py-2.5">
              <p className="text-[11px] font-bold text-gray-500 mb-1.5">{timeLabel(g.time) ? `${timeLabel(g.time)} • ` : ''}{g.time} น.</p>
              <div className="space-y-1.5">
                {g.items.map((d) => (
                  <div key={`${d.medId}-${d.time}`} className={`flex items-center gap-2 p-2 rounded-xl ${d.status === 'taken' ? 'bg-green-50' : d.status === 'skipped' ? 'bg-gray-50' : overdue ? 'bg-red-50' : 'bg-white border border-gray-100'}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${d.status !== 'pending' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{d.name}</p>
                      <p className="text-[11px] text-gray-500 truncate">{d.amount} เม็ด{d.dosage ? ` • ${d.dosage}` : ''}{d.note ? ` • ${d.note}` : ''}
                        {d.status === 'pending' && overdue && <span className="text-red-600 font-bold"> • เลยเวลาแล้ว</span>}
                      </p>
                    </div>
                    {d.status === 'pending' ? (
                      <>
                        <button onClick={() => markDose(d, 'skipped')} className="text-[11px] text-gray-500 px-2 py-1.5 rounded-lg hover:bg-gray-100">ข้าม</button>
                        <button onClick={async () => { if (await markDose(d, 'taken')) toast(`บันทึกแล้ว: ${d.name}`); }}
                          className="text-xs font-bold bg-[#388E3C] text-white px-3 py-1.5 rounded-lg flex items-center gap-1 active:scale-95">
                          <Icon name="check" className="w-3.5 h-3.5" /> กินแล้ว
                        </button>
                      </>
                    ) : (
                      <button onClick={() => markDose(d, 'pending')} className="text-[11px] text-gray-500 px-2 py-1.5 rounded-lg hover:bg-gray-100 flex items-center gap-1" aria-label="ยกเลิก">
                        <Icon name={d.status === 'taken' ? 'check-circle' : 'x-circle'} className={`w-4 h-4 ${d.status === 'taken' ? 'text-green-600' : 'text-gray-400'}`} />
                        {d.status === 'taken' ? 'กินแล้ว' : 'ข้าม'} <Icon name="undo" className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- ตัวเตือนเมื่อถึงเวลา (ทำงานตลอดขณะเปิดแอป) ----------
const REMIND_WINDOW_MIN = 120; // เตือนได้ถึง 2 ชั่วโมงหลังเวลา
const SNOOZE_MIN = 10;

function remindedKey(date, time) { return `paoya_reminded_${date}_${time}`; }
function readStore(key) { try { return localStorage.getItem(key); } catch { return null; } }
function writeStore(key, v) { try { localStorage.setItem(key, v); } catch { /* ignore */ } }

async function showSystemNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification(title, { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: 'paoya-reminder', renotify: true, requireInteraction: true });
    else new Notification(title, { body, icon: '/icons/icon-192.png' });
  } catch { /* ignore */ }
}

function ReminderCenter({ user }) {
  const n = user.settings.notifications;
  const enabled = n.enableAll && n.medReminder;
  const { doses, date } = useTodayDoses(enabled);
  const [active, setActive] = useState(null); // { time, items }

  useEffect(() => {
    if (!enabled) return undefined;
    const check = () => {
      if (active) return;
      const now = minutesOf(nowHHMM());
      const dueTimes = [...new Set(doses.filter((d) => d.status === 'pending').map((d) => d.time))]
        .filter((t) => now >= minutesOf(t) && now - minutesOf(t) <= REMIND_WINDOW_MIN);
      for (const t of dueTimes) {
        const mark = readStore(remindedKey(date, t));
        if (mark === 'done') continue;
        if (mark && Date.now() < Number(mark)) continue; // ยังอยู่ในช่วงเลื่อนเตือน
        const items = doses.filter((d) => d.time === t && d.status === 'pending');
        setActive({ time: t, items });
        const text = `ถึงเวลากินยาแล้ว ${items.map(doseText).join(' และ ')}`;
        playAlarm({ sound: n.sound, vibrate: n.vibrate });
        if (n.speakReminders) setTimeout(() => tts.speak(text, 'reminder'), 1200);
        if (document.hidden) showSystemNotification(`ถึงเวลากินยา ${t} น.`, items.map(doseText).join(', '));
        break;
      }
    };
    check();
    const t = setInterval(check, 20 * 1000);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [enabled, doses, date, active, n.sound, n.vibrate, n.speakReminders]);

  if (!active) return null;
  const close = (mark) => { writeStore(remindedKey(date, active.time), mark); tts.stop(); setActive(null); };
  const takeAll = async () => {
    for (const d of active.items) await markDose(d, 'taken', date);
    toast('บันทึกว่ากินยาแล้ว');
    close('done');
  };

  return (
    <Modal title={`ถึงเวลากินยา ${active.time} น.`} icon="bell-ring" onClose={() => close(String(Date.now() + SNOOZE_MIN * 60000))} wide>
      <div className="space-y-2">
        {active.items.map((d) => (
          <div key={d.medId} className="p-3 rounded-2xl bg-green-50 border border-green-100">
            <p className="text-lg font-bold text-gray-900">{d.name}</p>
            <p className="text-sm text-gray-700">{d.amount} เม็ด{d.dosage ? ` • ${d.dosage}` : ''}{d.note ? ` • ${d.note}` : ''}</p>
            {d.stock <= d.amount * 3 && <p className="text-xs text-amber-700 mt-1">ยาใกล้หมด เหลือ {d.stock} เม็ด</p>}
          </div>
        ))}
      </div>
      <div className="flex justify-center">
        <SpeakButton text={`ถึงเวลากินยาแล้ว ${active.items.map(doseText).join(' และ ')}`} id="reminder" label="ฟังอีกครั้ง" />
      </div>
      <Button size="lg" className="w-full text-lg" onClick={takeAll}><Icon name="check" className="w-5 h-5" /> กินแล้ว</Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={() => close(String(Date.now() + SNOOZE_MIN * 60000))}>เตือนอีก {SNOOZE_MIN} นาที</Button>
        <Button variant="ghost" onClick={async () => { for (const d of active.items) await markDose(d, 'skipped', date); close('done'); }}>ข้ามมื้อนี้</Button>
      </div>
    </Modal>
  );
}