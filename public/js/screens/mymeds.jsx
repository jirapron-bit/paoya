// ยาของฉัน: ยาประจำ, นัดหมาย, สต็อกยา, ประวัติแพ้ยา, บันทึกสุขภาพ (ทุกอย่างบันทึกลงฐานข้อมูล)

const daysLeftOf = (m) => (m.dailyDose > 0 ? Math.floor(m.stock / m.dailyDose) : null);

// ใช้ร่วมกันทุกแท็บ: โหลดรายการ + เพิ่ม/แก้/ลบ
function useRecords(path) {
  const list = useApi(path);
  const items = list.data?.items || [];
  const save = async (id, body) => {
    const res = id ? await api.put(`${path}/${id}`, body) : await api.post(path, body);
    list.setData((d) => {
      const cur = d?.items || [];
      return { items: id ? cur.map((x) => (x.id === id ? res.item : x)) : [...cur, res.item] };
    });
    return res;
  };
  const remove = async (id) => {
    await api.del(`${path}/${id}`);
    list.setData((d) => ({ items: (d?.items || []).filter((x) => x.id !== id) }));
  };
  const replace = (item) => list.setData((d) => ({ items: (d?.items || []).map((x) => (x.id === item.id ? item : x)) }));
  return { ...list, items, save, remove, replace };
}

function RowActions({ onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {onEdit && (
        <button onClick={onEdit} aria-label="แก้ไข" className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50">
          <Icon name="pencil" className="w-4 h-4" />
        </button>
      )}
      <button onClick={onDelete} aria-label="ลบ" className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50">
        <Icon name="trash" className="w-4 h-4" />
      </button>
    </div>
  );
}

// ฟอร์มเพิ่ม/แก้ไขแบบใช้ซ้ำได้
function RecordForm({ title, editing, initial, onSubmit, onCancel, children, submitText }) {
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await onSubmit(); } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-2.5">
      <h4 className="font-bold text-sm text-[#2D7A4C] flex items-center gap-1.5">
        <Icon name={editing ? 'pencil' : 'plus-circle'} className="w-4 h-4" /> {title}
      </h4>
      {children}
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" className="flex-1 py-2" disabled={busy}>{busy ? 'กำลังบันทึก...' : submitText}</Button>
        {editing && <Button type="button" size="sm" variant="ghost" onClick={onCancel}>ยกเลิก</Button>}
      </div>
    </form>
  );
}

const smallInput = 'w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D7A4C] bg-white';

// ---------- ยาประจำ ----------
// เลือกเวลาเตือนกินยา: ปุ่มลัด เช้า/กลางวัน/เย็น/ก่อนนอน + เพิ่มเวลาเอง
function ReminderTimePicker({ value, onChange }) {
  const [custom, setCustom] = useState('');
  const toggle = (t) => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t].sort());
  const addCustom = () => {
    if (/^\d{2}:\d{2}$/.test(custom) && !value.includes(custom)) onChange([...value, custom].sort());
    setCustom('');
  };
  return (
    <div className="space-y-2">
      <span className="text-xs text-gray-600 font-medium flex items-center gap-1"><Icon name="alarm" className="w-3.5 h-3.5" /> เวลาเตือนกินยา</span>
      <div className="grid grid-cols-4 gap-1.5">
        {TIME_PRESETS.map((p) => {
          const on = value.includes(p.time);
          return (
            <button type="button" key={p.time} onClick={() => toggle(p.time)} aria-pressed={on}
              className={`flex flex-col items-center py-2 rounded-xl border text-[11px] font-bold transition-all ${on ? 'bg-[#388E3C] text-white border-[#388E3C]' : 'bg-white text-gray-600 border-gray-200'}`}>
              <Icon name={p.icon} className="w-4 h-4 mb-0.5" />{p.label}<span className="font-normal opacity-80">{p.time}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5 items-center">
        {value.filter((t) => !TIME_PRESETS.some((p) => p.time === t)).map((t) => (
          <span key={t} className="text-[11px] bg-green-50 text-[#2D7A4C] border border-green-200 pl-2 pr-1 py-0.5 rounded-lg font-bold flex items-center gap-1">
            {t} <button type="button" onClick={() => toggle(t)} aria-label={`ลบเวลา ${t}`} className="text-red-400"><Icon name="x" className="w-3 h-3" /></button>
          </span>
        ))}
        <input type="time" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="เวลาอื่น" className={`${smallInput} w-28 py-1`} />
        <button type="button" onClick={addCustom} disabled={!custom} className="text-[11px] font-bold text-[#2D7A4C] disabled:opacity-40">+ เพิ่มเวลา</button>
      </div>
    </div>
  );
}

function MedsTab({ records }) {
  const empty = { name: '', dosage: '', time: '', dailyDose: '1', doseAmount: '1', reminderTimes: [], totalCapacity: '30', stock: '' };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const hasTimes = form.reminderTimes.length > 0;

  const submit = async () => {
    const res = await records.save(editing?.id, form);
    if (res.allergyWarnings) toast(`ระวัง! คุณเคยบันทึกว่าแพ้ ${res.allergyWarnings[0].drugName}`, 'error');
    else toast(editing ? 'บันทึกการแก้ไขแล้ว' : hasTimes ? 'เพิ่มยาประจำและตั้งเวลาเตือนแล้ว' : 'เพิ่มยาประจำแล้ว');
    window.dispatchEvent(new Event('paoya:doses-changed'));
    setEditing(null);
    setForm(empty);
  };

  const withReminders = records.items.filter((m) => m.reminderTimes?.length);

  return (
    <div className="p-4 space-y-4">
      <RecordForm title={editing ? 'แก้ไขยาประจำ' : 'เพิ่มยาประจำใหม่'} editing={editing} onSubmit={submit}
        onCancel={() => { setEditing(null); setForm(empty); }} submitText={editing ? 'บันทึกการแก้ไข' : 'เพิ่มรายการ'}>
        <input placeholder="ชื่อยา (เช่น Paracetamol)" value={form.name} onChange={set('name')} required className={smallInput} aria-label="ชื่อยา" />
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="ขนาด (เช่น 500 mg)" value={form.dosage} onChange={set('dosage')} className={smallInput} aria-label="ขนาด" />
          <input placeholder="วิธีทาน (เช่น หลังอาหาร)" value={form.time} onChange={set('time')} className={smallInput} aria-label="วิธีทาน" />
        </div>
        <ReminderTimePicker value={form.reminderTimes} onChange={(reminderTimes) => setForm({ ...form, reminderTimes })} />
        <div className="grid grid-cols-3 gap-2">
          {hasTimes ? (
            <Field label="ครั้งละ (เม็ด)" hint={`วันละ ${(Number(form.doseAmount) || 1) * form.reminderTimes.length} เม็ด`}>
              <input type="number" min="0.25" step="0.25" value={form.doseAmount} onChange={set('doseAmount')} className={smallInput} />
            </Field>
          ) : (
            <Field label="ทานวันละ (เม็ด)"><input type="number" min="0" step="0.5" value={form.dailyDose} onChange={set('dailyDose')} className={smallInput} /></Field>
          )}
          <Field label="มีอยู่ (เม็ด)"><input type="number" min="0" value={form.stock} onChange={set('stock')} className={smallInput} /></Field>
          <Field label="บรรจุเต็ม"><input type="number" min="1" value={form.totalCapacity} onChange={set('totalCapacity')} className={smallInput} /></Field>
        </div>
      </RecordForm>

      {withReminders.length > 0 && <CalendarReminderCard />}

      <div className="space-y-2">
        <h4 className="font-bold text-xs text-gray-500 px-1">รายการยาประจำของคุณ</h4>
        {records.loading ? <Spinner /> : records.items.length === 0 ? (
          <EmptyState icon="pill" title="ยังไม่มีรายการยาประจำ" subtitle="เพิ่มจากฟอร์มด้านบน หรือจากหน้ารายละเอียดยา" />
        ) : records.items.map((item) => (
          <div key={item.id} className="bg-white p-3.5 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-center">
            <div className="min-w-0">
              <h5 className="font-bold text-sm text-gray-900">{item.name}</h5>
              <p className="text-xs text-gray-500 mt-0.5">ขนาด: {item.dosage || '-'} | วิธีทาน: {item.time || '-'} | วันละ {item.dailyDose} เม็ด</p>
              {item.reminderTimes?.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {item.reminderTimes.map((t) => (
                    <span key={t} className="text-[10px] bg-green-50 text-[#2D7A4C] border border-green-200 px-1.5 py-0.5 rounded-md font-bold flex items-center gap-0.5">
                      <Icon name="alarm" className="w-3 h-3" />{timeLabel(t) ? `${timeLabel(t)} ` : ''}{t}
                    </span>
                  ))}
                </div>
              ) : <p className="text-[10px] text-gray-400 mt-1">ยังไม่ได้ตั้งเวลาเตือน</p>}
            </div>
            <RowActions
              onEdit={() => { setEditing(item); setForm({ name: item.name, dosage: item.dosage, time: item.time, dailyDose: String(item.dailyDose), doseAmount: String(item.doseAmount ?? 1), reminderTimes: item.reminderTimes || [], totalCapacity: String(item.totalCapacity), stock: String(item.stock) }); }}
              onDelete={() => setConfirmDel(item)} />
          </div>
        ))}
      </div>

      {confirmDel && (
        <ConfirmModal title="ลบยาประจำ?" message={`ต้องการลบ ${confirmDel.name} ออกจากรายการใช่หรือไม่`} confirmText="ลบ" danger
          onCancel={() => setConfirmDel(null)}
          onConfirm={async () => { try { await records.remove(confirmDel.id); toast('ลบแล้ว', 'info'); window.dispatchEvent(new Event('paoya:doses-changed')); } catch (e) { toast(e.message, 'error'); } setConfirmDel(null); }} />
      )}
    </div>
  );
}

// ส่งการเตือนเข้าปฏิทินมือถือ (เตือนได้แม้ปิดแอป)
function CalendarReminderCard() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 space-y-2">
      <p className="text-sm font-bold text-blue-800 flex items-center gap-1.5"><Icon name="bell-ring" className="w-4 h-4" /> ให้มือถือเตือนแม้ปิดแอป</p>
      <p className="text-xs text-blue-700">แอปจะเตือนเมื่อเปิดอยู่ ถ้าอยากให้เตือนตลอด ให้เพิ่มเวลากินยาลงปฏิทินของมือถือ (ทำครั้งเดียว ถ้าเปลี่ยนเวลาค่อยเพิ่มใหม่)</p>
      <button onClick={() => api.download(`/meds/reminders.ics?from=${todayISO()}`, 'paoya-reminders.ics').then(() => toast('ดาวน์โหลดแล้ว เปิดไฟล์เพื่อเพิ่มลงปฏิทิน')).catch((e) => toast(e.message, 'error'))}
        className="w-full bg-white hover:bg-blue-100 text-blue-700 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-blue-200 active:scale-95">
        <Icon name="calendar-plus" className="w-4 h-4" /> เพิ่มการเตือนกินยาลงปฏิทิน
      </button>
    </div>
  );
}

// ---------- นัดหมาย ----------
function AppointmentsTab() {
  const records = useRecords('/appointments');
  const empty = { hospital: '', doctor: '', date: '', time: '', note: '' };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const today = todayISO();
  const upcoming = records.items.filter((a) => a.date >= today);
  const past = records.items.filter((a) => a.date < today).reverse();

  const submit = async () => {
    await records.save(editing?.id, form);
    toast(editing ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มนัดหมายแล้ว');
    setEditing(null);
    setForm(empty);
  };

  const Card = ({ item, faded }) => (
    <div className={`bg-white p-3.5 rounded-2xl border border-gray-100 shadow-sm space-y-2 ${faded ? 'opacity-60' : ''}`}>
      <div className="flex justify-between items-start">
        <div className="min-w-0">
          <h5 className="font-bold text-sm text-gray-900">{item.hospital}</h5>
          <p className="text-xs text-gray-600 mt-0.5">{item.doctor || 'ไม่ระบุชื่อแพทย์'}</p>
          <p className="text-xs text-[#2D7A4C] font-semibold mt-1 flex items-center gap-1">
            <Icon name="clock" className="w-3.5 h-3.5" />
            {formatDateTH(item.date)}{item.time ? ` เวลา ${item.time} น.` : ''}
            {!faded && daysUntil(item.date) <= 7 && (
              <span className="ml-1 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                {daysUntil(item.date) === 0 ? 'วันนี้' : `อีก ${daysUntil(item.date)} วัน`}
              </span>
            )}
          </p>
          {item.note && <p className="text-[11px] text-gray-500 mt-1">หมายเหตุ: {item.note}</p>}
        </div>
        <RowActions onEdit={() => { setEditing(item); setForm({ ...empty, ...item }); }} onDelete={() => setConfirmDel(item)} />
      </div>
      {!faded && (
        <button onClick={() => api.download(`/appointments/${item.id}/calendar.ics`, `appointment-${item.date}.ics`).catch((e) => toast(e.message, 'error'))}
          className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-blue-200 active:scale-95">
          <Icon name="calendar-plus" className="w-3.5 h-3.5" /> บันทึกลงปฏิทิน (เตือนล่วงหน้า 1 วัน)
        </button>
      )}
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      <RecordForm title={editing ? 'แก้ไขวันนัดหมาย' : 'เพิ่มนัดหมายใหม่'} editing={editing} onSubmit={submit}
        onCancel={() => { setEditing(null); setForm(empty); }} submitText={editing ? 'บันทึกการแก้ไข' : 'เพิ่มนัดหมาย'}>
        <input placeholder="ชื่อโรงพยาบาล / คลินิก" value={form.hospital} onChange={set('hospital')} required className={smallInput} aria-label="โรงพยาบาล" />
        <input placeholder="ชื่อแพทย์ / แผนก" value={form.doctor} onChange={set('doctor')} className={smallInput} aria-label="แพทย์" />
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={form.date} onChange={set('date')} required className={smallInput} aria-label="วันที่" />
          <input type="time" value={form.time} onChange={set('time')} className={smallInput} aria-label="เวลา" />
        </div>
        <input placeholder="หมายเหตุ (เช่น งดน้ำงดอาหาร)" value={form.note} onChange={set('note')} className={smallInput} aria-label="หมายเหตุ" />
      </RecordForm>

      <div className="space-y-2">
        <h4 className="font-bold text-xs text-gray-500 px-1">นัดที่กำลังจะถึง</h4>
        {records.loading ? <Spinner /> : upcoming.length === 0
          ? <EmptyState icon="calendar" title="ไม่มีนัดหมายที่กำลังจะถึง" />
          : upcoming.map((a) => <Card key={a.id} item={a} />)}
      </div>
      {past.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-bold text-xs text-gray-500 px-1">นัดที่ผ่านมาแล้ว</h4>
          {past.map((a) => <Card key={a.id} item={a} faded />)}
        </div>
      )}

      {confirmDel && (
        <ConfirmModal title="ลบนัดหมาย?" message={`${confirmDel.hospital} • ${formatDateTH(confirmDel.date)}`} confirmText="ลบ" danger
          onCancel={() => setConfirmDel(null)}
          onConfirm={async () => { try { await records.remove(confirmDel.id); toast('ลบแล้ว', 'info'); } catch (e) { toast(e.message, 'error'); } setConfirmDel(null); }} />
      )}
    </div>
  );
}

// ---------- สต็อกยา ----------
function StockTab({ records, go }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ stock: '', dailyDose: '', totalCapacity: '' });
  const low = records.items.filter((m) => { const d = daysLeftOf(m); return d !== null && d <= 3; });

  const refill = async (item, amount) => {
    try {
      const res = await api.post(`/meds/${item.id}/refill`, { amount });
      records.replace(res.item);
      toast(`เติม ${item.name} +${amount} เม็ด`);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    try {
      await records.save(editing.id, { ...editing, ...form });
      toast('บันทึกการตั้งค่าสต็อกแล้ว');
      setEditing(null);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="bg-[#004D25] text-white p-4 rounded-3xl shadow-lg">
        <span className="text-xs text-green-200 font-medium">ภาพรวมสต็อกยาในบ้าน</span>
        <div className="flex justify-between items-end mt-2">
          <div>
            <h3 className="text-2xl font-bold">{records.items.length} <span className="text-xs font-normal">รายการ</span></h3>
            <p className="text-xs text-green-100 mt-1">ใกล้หมด (ไม่เกิน 3 วัน): <span className="font-bold text-yellow-300">{low.length} รายการ</span></p>
          </div>
          <button onClick={() => go('pharmacy')}
            className="bg-white text-[#004D25] px-3.5 py-2 rounded-xl text-xs font-bold shadow hover:bg-green-50 active:scale-95 flex items-center gap-1.5">
            <Icon name="map-pin" className="w-4 h-4" /> หาร้านยา
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {records.loading ? <Spinner /> : records.items.length === 0 ? (
          <EmptyState icon="package" title="ยังไม่มียาในสต็อก" subtitle="เพิ่มยาประจำก่อน แล้วระบบจะคำนวณวันที่ยาจะหมดให้" />
        ) : records.items.map((item) => {
          const daysLeft = daysLeftOf(item);
          const percent = Math.min(100, Math.round((item.stock / (item.totalCapacity || 30)) * 100));
          let bar = 'bg-green-500', badge = 'bg-green-50 text-green-700 border-green-200';
          let text = daysLeft === null ? 'ไม่ได้ตั้งจำนวนต่อวัน' : `เหลืออีก ${daysLeft} วัน`;
          if (daysLeft !== null && daysLeft <= 3) { bar = 'bg-red-500'; badge = 'bg-red-50 text-red-700 border-red-200'; text = `เหลือ ${daysLeft} วัน!`; }
          else if (daysLeft !== null && daysLeft <= 7) { bar = 'bg-amber-500'; badge = 'bg-amber-50 text-amber-700 border-amber-200'; }
          return (
            <div key={item.id} className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm space-y-3">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h5 className="font-bold text-gray-900 text-base">{item.name}</h5>
                    {item.dosage && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-medium">{item.dosage}</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">ทานวันละ {item.dailyDose} เม็ด{item.time ? ` (${item.time})` : ''}</p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${badge}`}>{text}</span>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-500 font-medium">คงเหลือ {percent}%</span>
                  <span className="font-bold text-gray-800">{item.stock} / {item.totalCapacity} เม็ด</span>
                </div>
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                  <div className={`h-full ${bar} transition-all duration-500 rounded-full`} style={{ width: `${percent}%` }} />
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                <div className="flex items-center gap-1">
                  {[10, 30].map((n) => (
                    <button key={n} onClick={() => refill(item, n)}
                      className="text-[11px] bg-gray-100 hover:bg-green-100 hover:text-green-700 text-gray-700 font-bold px-2.5 py-1 rounded-xl active:scale-95">
                      +{n} เม็ด
                    </button>
                  ))}
                </div>
                <button onClick={() => { setEditing(item); setForm({ stock: String(item.stock), dailyDose: String(item.dailyDose), totalCapacity: String(item.totalCapacity) }); }}
                  className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-blue-50">
                  <Icon name="sliders" className="w-4 h-4" /> ตั้งค่า
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <Modal title={`ตั้งค่าสต็อก: ${editing.name}`} icon="package" onClose={() => setEditing(null)}>
          <form onSubmit={saveSettings} className="space-y-3">
            <Field label="จำนวนเม็ดคงเหลือตอนนี้"><input type="number" min="0" className={inputCls} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} required /></Field>
            <Field label="จำนวนที่ทานต่อวัน"><input type="number" min="0" step="0.5" className={inputCls} value={form.dailyDose} onChange={(e) => setForm({ ...form, dailyDose: e.target.value })} required /></Field>
            <Field label="ขนาดบรรจุเต็ม (เม็ด)"><input type="number" min="1" className={inputCls} value={form.totalCapacity} onChange={(e) => setForm({ ...form, totalCapacity: e.target.value })} required /></Field>
            <div className="flex gap-2 pt-1">
              <Button type="submit" className="flex-1">บันทึก</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>ยกเลิก</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ---------- ประวัติแพ้ยา ----------
const SEVERITIES = ['เล็กน้อย', 'รุนแรงปานกลาง', 'รุนแรงมาก'];
function AllergiesTab({ user }) {
  const records = useRecords('/allergies');
  const empty = { drugName: '', symptom: '', severity: 'รุนแรงปานกลาง' };
  const [form, setForm] = useState(empty);
  const [confirmDel, setConfirmDel] = useState(null);
  const sevColor = { 'เล็กน้อย': 'bg-yellow-100 text-yellow-800', 'รุนแรงปานกลาง': 'bg-orange-100 text-orange-800', 'รุนแรงมาก': 'bg-red-600 text-white' };

  const submit = async () => {
    await records.save(null, form);
    toast('บันทึกประวัติแพ้ยาแล้ว');
    setForm(empty);
  };

  return (
    <div className="p-4 space-y-3">
      {/* บัตรแพ้ยา: ยื่นให้แพทย์/เภสัชกรดู */}
      <div className="bg-white border-2 border-red-300 rounded-3xl overflow-hidden shadow-sm">
        <div className="bg-red-600 text-white px-4 py-2.5 flex items-center gap-2">
          <Icon name="alert-triangle" className="w-5 h-5" />
          <div>
            <p className="font-bold text-sm">บัตรแพ้ยา (Drug Allergy Card)</p>
            <p className="text-[10px] text-red-100">โปรดแสดงหน้านี้แก่แพทย์หรือเภสัชกรทุกครั้งก่อนรับยา</p>
          </div>
        </div>
        <div className="p-4 space-y-2">
          <p className="text-xs text-gray-600">
            ชื่อ: <b>{user.firstName} {user.lastName}</b>{user.age ? ` • อายุ ${user.age} ปี` : ''}{user.bloodType ? ` • กรุ๊ปเลือด ${user.bloodType}` : ''}
          </p>
          {records.loading ? <Spinner /> : records.items.length === 0 ? (
            <p className="text-xs text-gray-400 italic">ยังไม่มีประวัติแพ้ยา</p>
          ) : records.items.map((a) => (
            <div key={a.id} className="flex justify-between items-center p-2.5 bg-red-50/60 rounded-xl border border-red-100">
              <div className="min-w-0">
                <p className="font-bold text-red-700 text-sm flex items-center gap-2 flex-wrap">
                  {a.drugName}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${sevColor[a.severity] || sevColor['รุนแรงปานกลาง']}`}>{a.severity}</span>
                </p>
                <p className="text-xs text-gray-600 mt-0.5">อาการ: {a.symptom || 'ไม่ระบุ'}</p>
              </div>
              <RowActions onDelete={() => setConfirmDel(a)} />
            </div>
          ))}
          {user.emergencyContact && <p className="text-xs text-red-600 font-bold pt-1">ติดต่อฉุกเฉิน: {user.emergencyContact}</p>}
        </div>
      </div>

      <RecordForm title="เพิ่มยาที่แพ้" onSubmit={submit} submitText="บันทึกประวัติแพ้ยา">
        <input placeholder="ชื่อยาที่แพ้ (เช่น Penicillin)" value={form.drugName} onChange={(e) => setForm({ ...form, drugName: e.target.value })} required className={smallInput} aria-label="ชื่อยาที่แพ้" />
        <input placeholder="อาการที่พบ (เช่น ผื่นคัน, ตาบวม)" value={form.symptom} onChange={(e) => setForm({ ...form, symptom: e.target.value })} className={smallInput} aria-label="อาการ" />
        <div className="flex gap-1.5">
          {SEVERITIES.map((s) => (
            <button type="button" key={s} onClick={() => setForm({ ...form, severity: s })}
              className={`flex-1 text-[11px] py-1.5 rounded-lg border font-medium ${form.severity === s ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200'}`}>
              {s}
            </button>
          ))}
        </div>
      </RecordForm>
      <p className="text-[11px] text-gray-400 px-1">ระบบจะเตือนอัตโนมัติเมื่อคุณเปิดดูหรือเพิ่มยาที่มีชื่อตรงกับยาที่แพ้</p>

      {confirmDel && (
        <ConfirmModal title="ลบประวัติแพ้ยา?" message={`ลบ ${confirmDel.drugName} ออกจากประวัติแพ้ยาใช่หรือไม่ ระบบจะไม่เตือนยานี้อีก`} confirmText="ลบ" danger
          onCancel={() => setConfirmDel(null)}
          onConfirm={async () => { try { await records.remove(confirmDel.id); toast('ลบแล้ว', 'info'); } catch (e) { toast(e.message, 'error'); } setConfirmDel(null); }} />
      )}
    </div>
  );
}

// ---------- บันทึกสุขภาพ ----------
// เกณฑ์ความดันโลหิตแบบทั่วไปสำหรับผู้ใหญ่ ใช้เพื่อแสดงสีเท่านั้น
function bpLevel(sys, dia) {
  if (!sys || !dia) return null;
  if (sys >= 180 || dia >= 110) return { text: 'สูงมาก ควรพบแพทย์', cls: 'bg-red-600 text-white' };
  if (sys >= 140 || dia >= 90) return { text: 'สูง', cls: 'bg-red-100 text-red-700' };
  if (sys >= 130 || dia >= 85) return { text: 'ค่อนข้างสูง', cls: 'bg-amber-100 text-amber-700' };
  if (sys < 90 || dia < 60) return { text: 'ต่ำ', cls: 'bg-blue-100 text-blue-700' };
  return { text: 'ปกติ', cls: 'bg-green-100 text-green-700' };
}

function VitalsTab() {
  const records = useRecords('/vitals');
  const empty = { date: todayISO(), systolic: '', diastolic: '', pulse: '', sugar: '', note: '' };
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    if (!form.systolic && !form.pulse && !form.sugar && !form.note) throw new Error('กรุณากรอกอย่างน้อย 1 ค่า');
    await records.save(null, form);
    // เรียงใหม่ให้ล่าสุดอยู่บน
    records.reload();
    toast('บันทึกค่าสุขภาพแล้ว');
    setForm(empty);
    setShowForm(false);
  };

  return (
    <div className="p-4 space-y-3">
      {!showForm ? (
        <Button className="w-full" onClick={() => setShowForm(true)}><Icon name="plus" className="w-4 h-4" /> บันทึกค่าความดัน / ชีพจร / น้ำตาล</Button>
      ) : (
        <RecordForm title="บันทึกค่าสุขภาพ" editing onCancel={() => setShowForm(false)} onSubmit={submit} submitText="บันทึก">
          <Field label="วันที่"><input type="date" value={form.date} onChange={set('date')} required className={smallInput} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="ความดันตัวบน (mmHg)"><input type="number" inputMode="numeric" placeholder="120" value={form.systolic} onChange={set('systolic')} className={smallInput} /></Field>
            <Field label="ความดันตัวล่าง (mmHg)"><input type="number" inputMode="numeric" placeholder="80" value={form.diastolic} onChange={set('diastolic')} className={smallInput} /></Field>
            <Field label="ชีพจร (ครั้ง/นาที)"><input type="number" inputMode="numeric" placeholder="72" value={form.pulse} onChange={set('pulse')} className={smallInput} /></Field>
            <Field label="น้ำตาล (mg/dL)"><input type="number" inputMode="numeric" placeholder="100" value={form.sugar} onChange={set('sugar')} className={smallInput} /></Field>
          </div>
          <input placeholder="หมายเหตุ / ผลข้างเคียงที่พบ" value={form.note} onChange={set('note')} className={smallInput} aria-label="หมายเหตุ" />
        </RecordForm>
      )}

      {records.loading ? <Spinner /> : records.items.length === 0 ? (
        <EmptyState icon="activity" title="ยังไม่มีบันทึกสุขภาพ" subtitle="จดค่าความดันหรือน้ำตาลไว้ ให้แพทย์ดูตอนไปตามนัด" />
      ) : records.items.map((v) => {
        const lv = bpLevel(v.systolic, v.diastolic);
        return (
          <div key={v.id} className="p-3.5 bg-white rounded-2xl border border-gray-100 shadow-sm flex justify-between items-start">
            <div className="min-w-0 space-y-1">
              <p className="font-bold text-gray-800 text-xs">{formatDateTH(v.date)}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {v.systolic && v.diastolic && (
                  <span className="text-[#2D7A4C] font-semibold">ความดัน {v.systolic}/{v.diastolic}</span>
                )}
                {lv && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${lv.cls}`}>{lv.text}</span>}
                {v.pulse && <span className="text-gray-600">ชีพจร {v.pulse}</span>}
                {v.sugar && <span className="text-gray-600">น้ำตาล {v.sugar} mg/dL</span>}
              </div>
              {v.note && <p className="text-[11px] text-gray-500">หมายเหตุ: {v.note}</p>}
            </div>
            <RowActions onDelete={() => setConfirmDel(v)} />
          </div>
        );
      })}
      <p className="text-[11px] text-gray-400 px-1">สีบอกระดับความดันเป็นเกณฑ์ทั่วไปสำหรับผู้ใหญ่ ไม่ใช่การวินิจฉัย</p>

      {confirmDel && (
        <ConfirmModal title="ลบบันทึกนี้?" message={formatDateTH(confirmDel.date)} confirmText="ลบ" danger
          onCancel={() => setConfirmDel(null)}
          onConfirm={async () => { try { await records.remove(confirmDel.id); toast('ลบแล้ว', 'info'); } catch (e) { toast(e.message, 'error'); } setConfirmDel(null); }} />
      )}
    </div>
  );
}

// ---------- หน้ารวม ----------
function MyMedsScreen({ user, go, initialTab }) {
  const [tab, setTab] = useState(initialTab || null);
  useEffect(() => { setTab(initialTab || null); }, [initialTab]);
  const meds = useRecords('/meds');
  const summary = useApi('/me/summary', [tab]);
  const counts = summary.data?.counts || {};
  const hasLow = meds.items.some((m) => { const d = daysLeftOf(m); return d !== null && d <= 3; });

  const titles = { meds: 'ยาประจำ', appointments: 'วันนัดหมาย', stock: 'สต็อกยา & เตือนเติมยา', allergies: 'ประวัติแพ้ยา', vitals: 'บันทึกสุขภาพ' };
  const menu = [
    { key: 'meds', icon: 'heart', box: 'bg-red-50 text-red-500', title: 'ยาประจำ', sub: `จัดการรายการยาที่ทานประจำ (${meds.items.length} รายการ)` },
    { key: 'appointments', icon: 'calendar', box: 'bg-blue-50 text-blue-500', title: 'วันนัดหมาย & ปฏิทิน', sub: `บันทึกวันนัดแพทย์ และส่งไปยังปฏิทิน (${counts.appointments ?? 0} รายการ)` },
    { key: 'stock', icon: 'package', box: 'bg-amber-100 text-amber-600', title: 'จำนวนยาคงเหลือ & เตือนเติมยา', sub: 'ติดตามว่ายาจะหมดเมื่อไร', card: 'border-amber-200 bg-amber-50/40', badge: hasLow },
    { key: 'allergies', icon: 'alert-triangle', box: 'bg-red-100 text-red-600', title: 'ประวัติการแพ้ยา', sub: `บัตรแพ้ยาสำหรับยื่นให้เภสัชกร (${counts.allergies ?? 0} รายการ)`, card: 'border-red-200 bg-red-50/40', red: true },
    { key: 'vitals', icon: 'activity', box: 'bg-purple-50 text-purple-600', title: 'บันทึกสุขภาพ & ความดัน', sub: `ความดัน ชีพจร น้ำตาล (${counts.vitals ?? 0} รายการ)` },
  ];

  return (
    <div className="flex-1 flex flex-col pb-nav bg-gray-50 min-h-full">
      <TopBar title={tab ? titles[tab] : 'ยาของฉัน'} onBack={tab ? () => setTab(null) : null} />

      {!tab && (
        <div className="p-4 grid gap-3 md:grid-cols-2">
          {menu.map((m) => (
            <button key={m.key} onClick={() => setTab(m.key)}
              className={`w-full text-left flex items-center p-4 border rounded-2xl shadow-sm hover:shadow-md transition-all ${m.card || 'border-gray-200 bg-white'}`}>
              <div className={`p-3 rounded-xl mr-4 ${m.box}`}><Icon name={m.icon} className="w-7 h-7" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center gap-2">
                  <h4 className={`font-bold text-base ${m.red ? 'text-red-600' : 'text-gray-800'}`}>{m.title}</h4>
                  {m.badge && <span className="text-[10px] bg-red-500 text-white font-bold px-2 py-0.5 rounded-full animate-pulse whitespace-nowrap">เติมด่วน</span>}
                </div>
                <p className={`text-xs mt-0.5 ${m.red ? 'text-red-500' : 'text-gray-500'}`}>{m.sub}</p>
              </div>
              <Icon name="chevron-right" className="w-5 h-5 text-gray-400 ml-1" />
            </button>
          ))}
        </div>
      )}

      {tab === 'meds' && <MedsTab records={meds} />}
      {tab === 'appointments' && <AppointmentsTab />}
      {tab === 'stock' && <StockTab records={meds} go={go} />}
      {tab === 'allergies' && <AllergiesTab user={user} />}
      {tab === 'vitals' && <VitalsTab />}
    </div>
  );
}