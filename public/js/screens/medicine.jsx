// รายละเอียดยา (ข้อมูลจริงจากบัญชียาหลักแห่งชาติ) + เพิ่มเป็นยาประจำ + ถาม AI

// รหัสบัญชีย่อยแสดงตามไฟล์ข้อมูลต้นฉบับ (เช่น b, s, ex, R1, R2)
const accountText = (code) => (code ? `บัญชีย่อย ${code}` : '-');

function InfoBlock({ title, children, tone }) {
  const tones = { warn: 'bg-amber-50 border-amber-200', plain: 'bg-white border-gray-100' };
  return (
    <div className={`rounded-2xl border p-3.5 ${tones[tone || 'plain']}`}>
      <h4 className="font-bold text-gray-900 text-sm mb-1">{title}</h4>
      <div className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">{children}</div>
    </div>
  );
}

function AddToMyMedsModal({ medicine, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: medicine.genericName.split(' (')[0],
    dosage: medicine.strength && medicine.strength !== 'ไม่ระบุ' ? medicine.strength : '',
    time: '', dailyDose: '1', stock: '', totalCapacity: '30',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/meds', form);
      if (res.allergyWarnings) toast(`บันทึกแล้ว แต่คุณเคยแพ้ ${res.allergyWarnings[0].drugName} โปรดปรึกษาแพทย์`, 'error');
      else toast('เพิ่มเป็นยาประจำแล้ว');
      onSaved && onSaved();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="เพิ่มเป็นยาประจำ" icon="plus-circle" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-2.5">
        <Field label="ชื่อยา"><input className={inputCls} value={form.name} onChange={set('name')} required /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="ขนาด"><input className={inputCls} placeholder="เช่น 500 mg" value={form.dosage} onChange={set('dosage')} /></Field>
          <Field label="วิธีทาน"><input className={inputCls} placeholder="เช่น หลังอาหาร เช้า" value={form.time} onChange={set('time')} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="วันละ (เม็ด)"><input type="number" min="0" step="0.5" className={inputCls} value={form.dailyDose} onChange={set('dailyDose')} /></Field>
          <Field label="มีอยู่ (เม็ด)"><input type="number" min="0" className={inputCls} value={form.stock} onChange={set('stock')} /></Field>
          <Field label="บรรจุเต็ม"><input type="number" min="1" className={inputCls} value={form.totalCapacity} onChange={set('totalCapacity')} /></Field>
        </div>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
      </form>
    </Modal>
  );
}

function MedicineDetailScreen({ medicineId, goBack, openMedicine, askAI }) {
  const { data, loading, error, setData } = useApi(`/medicines/${medicineId}`);
  const [showAdd, setShowAdd] = useState(false);
  const m = data?.medicine;

  const onToggleFav = async () => {
    const isFavorite = await toggleFavorite(m);
    setData((d) => ({ ...d, medicine: { ...d.medicine, isFavorite } }));
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50 min-h-full pb-nav">
      <TopBar title="รายละเอียดยา" onBack={goBack}
        right={m && (
          <button onClick={onToggleFav} aria-label={m.isFavorite ? 'เลิกติดดาว' : 'ติดดาว'}
            className={`p-1 ${m.isFavorite ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}`}>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill={m.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
              <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
            </svg>
          </button>
        )} />

      {loading ? <Spinner /> : error ? <div className="p-4"><ErrorText>{error}</ErrorText></div> : m && (
        <div className="p-4 space-y-3">
          <AllergyBanner warnings={data.allergyWarnings} />

          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm">
            <h3 className="text-xl font-bold text-gray-900">{m.genericName}</h3>
            <p className="text-sm text-gray-600 mt-1">
              {m.dosageForm || '-'}{m.strength && m.strength !== 'ไม่ระบุ' ? ` • ${m.strength}` : ''}
            </p>
            <div className="mt-3">
              <SpeakButton id={`med-${m.id}`} text={() => [
                `ยา ${m.genericName}`, m.dosageForm && `รูปแบบ ${m.dosageForm}`, m.strength && m.strength !== 'ไม่ระบุ' && `ความแรง ${m.strength}`,
                m.subgroup && `กลุ่มยา ${m.subgroup}`, m.conditions && m.conditions !== 'ไม่มีเงื่อนไข' && `เงื่อนไขการใช้ ${m.conditions}`,
                m.remarks && m.remarks !== 'ไม่มี' && `คำเตือน ${m.remarks}`,
                data.allergyWarnings?.length ? 'คำเตือน คุณเคยบันทึกว่าแพ้ยานี้' : '',
              ].filter(Boolean).join('. ')} />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              <span className="text-[11px] bg-green-50 text-[#2D7A4C] border border-green-200 px-2 py-0.5 rounded-full font-medium">{m.mainGroup}</span>
              <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{accountText(m.accountNew)}</span>
            </div>
          </div>

          <InfoBlock title="กลุ่มยา">{m.subgroup || '-'}</InfoBlock>
          <InfoBlock title="เงื่อนไขการใช้ยา" tone={m.conditions && m.conditions !== 'ไม่มีเงื่อนไข' ? 'warn' : 'plain'}>
            {m.conditions || 'ไม่มีเงื่อนไข'}
          </InfoBlock>
          <InfoBlock title="คำเตือน / หมายเหตุ" tone={m.remarks && m.remarks !== 'ไม่มี' ? 'warn' : 'plain'}>
            {m.remarks || 'ไม่มี'}
          </InfoBlock>
          <InfoBlock title="ข้อมูลบัญชียาหลัก">
            {accountText(m.accountNew)}{m.accountOld ? ` (เดิม: บัญชี ${m.accountOld})` : ''}{'\n'}
            การเปลี่ยนแปลง: {m.changeDetail || '-'}{m.changeCode ? ` [${m.changeCode}]` : ''}{'\n'}
            ประกาศราชกิจจาฯ: {formatDateTH(m.announcedAt)}
          </InfoBlock>

          {data.otherForms.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-3.5">
              <h4 className="font-bold text-gray-900 text-sm mb-2">รูปแบบอื่นของยานี้</h4>
              <div className="flex flex-wrap gap-2">
                {data.otherForms.map((f) => (
                  <button key={f.id} onClick={() => openMedicine(f, { replace: true })}
                    className="text-xs bg-gray-50 text-gray-700 px-3 py-1.5 rounded-full border border-gray-200 hover:border-[#2D7A4C] hover:text-[#2D7A4C]">
                    {f.dosageForm}{f.strength && f.strength !== 'ไม่ระบุ' ? ` ${f.strength}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="primary" onClick={() => setShowAdd(true)}><Icon name="plus-circle" className="w-4 h-4" /> เพิ่มเป็นยาประจำ</Button>
            <Button variant="soft" onClick={() => askAI(`ยา ${m.genericName} (${m.dosageForm}) ใช้รักษาอะไร มีวิธีใช้และข้อควรระวังอย่างไร`)}>
              <Icon name="bot" className="w-4 h-4" /> ถามเภสัชกร AI
            </Button>
          </div>

          <p className="text-[11px] text-gray-400 text-center px-4 pt-2">
            ข้อมูลนี้มาจากบัญชียาหลักแห่งชาติ ใช้เพื่อการอ้างอิงเท่านั้น วิธีใช้และขนาดยาให้ทำตามแพทย์ เภสัชกร หรือฉลากยา
          </p>
        </div>
      )}

      {showAdd && m && <AddToMyMedsModal medicine={m} onClose={() => setShowAdd(false)} />}
    </div>
  );
}