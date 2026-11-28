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

// ข้อมูลการใช้ยา (สรุปโดย AI) — บัญชียาหลักไม่มีข้อมูลว่าใช้รักษาอะไร/กินอย่างไร จึงให้ AI สรุปให้
function useMedicineAIInfo(id) {
  const [state, setState] = useState({ loading: true, info: null, error: '', enabled: true, disclaimer: '' });
  const load = useCallback(async () => {
    if (!id) return;
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const data = await api.get(`/ai/medicine-info/${id}`);
      setState({ loading: false, info: data.info, error: '', enabled: data.enabled !== false, disclaimer: data.disclaimer || '' });
    } catch (err) {
      setState({ loading: false, info: null, error: err.message, enabled: true, disclaimer: '' });
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const info = state.info && state.info.known ? state.info : null;
  return { ...state, info, reload: load };
}

// ข้อความหลายบรรทัด → แสดงเป็นข้อ ๆ
function InfoText({ text }) {
  const lines = String(text || '').split('\n').map((l) => l.replace(/^\s*[-•*\d.)]+\s*/, '').trim()).filter(Boolean);
  if (lines.length <= 1) return <p className="text-sm text-gray-700 leading-relaxed">{lines[0]}</p>;
  return (
    <ul className="space-y-1">
      {lines.map((l, i) => (
        <li key={i} className="text-sm text-gray-700 leading-relaxed flex gap-2"><span className="text-[#2D7A4C] font-bold">•</span><span>{l}</span></li>
      ))}
    </ul>
  );
}

const SECTION_TONES = {
  plain: 'bg-white border-gray-100',
  green: 'bg-green-50 border-green-100',
  blue: 'bg-blue-50 border-blue-100',
  warn: 'bg-amber-50 border-amber-200',
  danger: 'bg-red-50 border-red-200',
};
function DrugSection({ icon, title, text, tone = 'plain', badge, children }) {
  if (!text && !children) return null;
  return (
    <div className={`rounded-2xl border p-3.5 ${SECTION_TONES[tone]}`}>
      <h4 className="font-bold text-gray-900 text-sm mb-1.5 flex items-center gap-1.5">
        {icon && <Icon name={icon} className="w-4 h-4 text-[#2D7A4C]" />} {title}
        {badge && <span className="ml-auto text-[10px] font-medium text-gray-500 bg-white/70 border border-gray-200 px-1.5 py-0.5 rounded-full">{badge}</span>}
      </h4>
      {text && <InfoText text={text} />}
      {children}
    </div>
  );
}

// การ์ดชื่อยา: ชื่อสามัญ / ชื่อไทย / ชื่อวิทยาศาสตร์ / ชื่อการค้า / กลุ่มยา
function DrugNamesCard({ m, ai }) {
  const rows = [
    ['ชื่อเรียกทั่วไป', ai.info?.commonName],
    ['ชื่อสามัญ', m.genericName],
    ['ชื่อภาษาไทย', ai.info?.thaiName],
    ['ชื่อวิทยาศาสตร์', ai.info?.scientificName],
    ['ชื่อการค้า', ai.info?.brandNames],
    ['กลุ่มยา', [ai.info?.drugClass, m.subgroup].filter(Boolean).join('\n')],
  ].filter(([, v]) => v);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-3 px-3.5 py-2.5">
          <span className="text-xs font-bold text-gray-500 flex-shrink-0 pt-0.5" style={{ width: '6.5rem' }}>{k}</span>
          <span className="text-sm text-gray-800 leading-relaxed whitespace-pre-line break-words min-w-0">{v}</span>
        </div>
      ))}
    </div>
  );
}

function AIStatusNote({ ai }) {
  if (ai.loading) {
    return (
      <div className="rounded-2xl border border-green-100 bg-green-50/50 p-4 space-y-2 animate-pulse">
        <p className="text-sm font-bold text-[#2D7A4C] flex items-center gap-1.5"><Icon name="sparkles" className="w-4 h-4" /> กำลังสรุปข้อมูลยา (สรรพคุณ ข้อบ่งใช้ ข้อควรระวัง)...</p>
        <div className="h-3 bg-green-100 rounded w-3/4" /><div className="h-3 bg-green-100 rounded w-1/2" />
      </div>
    );
  }
  if (ai.error) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 space-y-2">
        <p className="text-sm text-amber-800">{ai.error}</p>
        <Button size="sm" variant="outline" onClick={ai.reload}>ลองใหม่</Button>
      </div>
    );
  }
  if (!ai.enabled) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-3.5 text-sm text-gray-600">ยังไม่ได้เปิดใช้ AI จึงแสดงได้เฉพาะข้อมูลจากบัญชียาหลัก ถามเภสัชกรประจำร้านยาเพิ่มเติมได้</div>;
  }
  if (!ai.info) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-3.5 text-sm text-gray-600">AI ยังไม่มีข้อมูลที่มั่นใจสำหรับยานี้ แนะนำให้สอบถามแพทย์หรือเภสัชกร</div>;
  }
  return null;
}

function MedicineDetailScreen({ medicineId, goBack, openMedicine, askAI }) {
  const { data, loading, error, setData } = useApi(`/medicines/${medicineId}`);
  const ai = useMedicineAIInfo(data?.medicine?.id);
  const aiInfo = ai.info;
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
            {/* หัวข้อใหญ่ = ชื่อที่คนทั่วไปเข้าใจ (จาก AI) ถ้ายังไม่มีใช้ชื่อสามัญ */}
            {aiInfo?.commonName || aiInfo?.thaiName ? (
              <>
                <h3 className="text-2xl font-bold text-gray-900 leading-tight">{aiInfo.commonName || aiInfo.thaiName}</h3>
                {aiInfo.oneLine && (
                  <p className="text-base text-[#2D7A4C] font-bold mt-1.5 leading-snug flex gap-1.5">
                    <Icon name="pill" className="w-5 h-5 flex-shrink-0 mt-0.5" /> <span>{aiInfo.oneLine}</span>
                  </p>
                )}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-sm font-bold text-gray-800">
                    {aiInfo.thaiName && aiInfo.thaiName !== aiInfo.commonName ? `${aiInfo.thaiName} · ` : ''}{m.genericName}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {m.dosageForm || '-'}{m.strength && m.strength !== 'ไม่ระบุ' ? ` • ${m.strength}` : ''}
                  </p>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold text-gray-900">{m.genericName}</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {m.dosageForm || '-'}{m.strength && m.strength !== 'ไม่ระบุ' ? ` • ${m.strength}` : ''}
                </p>
              </>
            )}
            <div className="mt-3">
              <SpeakButton id={`med-${m.id}`} text={() => [
                aiInfo?.commonName, aiInfo?.oneLine, `ชื่อยา ${aiInfo?.thaiName || m.genericName}`, m.dosageForm && `รูปแบบ ${m.dosageForm}`, m.strength && m.strength !== 'ไม่ระบุ' && `ความแรง ${m.strength}`,
                data.allergyWarnings?.length ? 'คำเตือน คุณเคยบันทึกว่าแพ้ยานี้' : '',
                aiInfo?.drugClass && `กลุ่มยา ${aiInfo.drugClass}`,
                aiInfo?.properties && `สรรพคุณ ${aiInfo.properties}`,
                aiInfo?.indications && `ข้อบ่งใช้ ${aiInfo.indications}`,
                aiInfo?.howToUse && `วิธีใช้ ${aiInfo.howToUse}`,
                m.conditions && m.conditions !== 'ไม่มีเงื่อนไข' && `เงื่อนไขการใช้ยา ${m.conditions}`,
                aiInfo?.contraindications && `ข้อห้ามใช้ ${aiInfo.contraindications}`,
                aiInfo?.cautions && `ข้อควรระวัง ${aiInfo.cautions}`,
                m.remarks && m.remarks !== 'ไม่มี' && `หมายเหตุ ${m.remarks}`,
              ].filter(Boolean).join('. ')} />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              <span className="text-[11px] bg-green-50 text-[#2D7A4C] border border-green-200 px-2 py-0.5 rounded-full font-medium">{m.mainGroup}</span>
              <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{accountText(m.accountNew)}</span>
            </div>
          </div>

          <DrugNamesCard m={m} ai={ai} />
          <AIStatusNote ai={ai} />

          <DrugSection icon="sparkles" title="สรรพคุณยา" text={aiInfo?.properties} tone="green" />
          <DrugSection icon="pill" title="ข้อบ่งใช้" text={aiInfo?.indications} tone="green" />
          <DrugSection icon="clock" title="วิธีใช้ / ขนาดยาทั่วไป (ผู้ใหญ่)" text={aiInfo?.howToUse} tone="blue" />
          <DrugSection icon="check-circle" title="เงื่อนไขการใช้ยา" badge="บัญชียาหลัก"
            text={m.conditions || 'ไม่มีเงื่อนไข'} tone={m.conditions && m.conditions !== 'ไม่มีเงื่อนไข' ? 'warn' : 'plain'} />
          <DrugSection icon="x" title="ข้อห้ามใช้" text={aiInfo?.contraindications} tone="danger" />
          <DrugSection icon="alert-triangle" title="ข้อควรระวัง / คำเตือน" text={aiInfo?.cautions} tone="warn">
            {m.remarks && m.remarks !== 'ไม่มี' && (
              <p className={`text-sm text-gray-700 leading-relaxed ${aiInfo?.cautions ? 'mt-2 pt-2 border-t border-amber-200' : ''}`}>
                <span className="font-bold">หมายเหตุจากบัญชียาหลัก:</span> {m.remarks.replace(/^\s*หมายเหตุ\s*:\s*/, '')}
              </p>
            )}
          </DrugSection>
          <DrugSection icon="info" title="ผลข้างเคียง" text={aiInfo?.sideEffects} />
          <DrugSection icon="alert-circle" title="ยา/อาหารที่ไม่ควรใช้ร่วมกัน" text={aiInfo?.interactions} />
          <DrugSection icon="heart" title="หญิงตั้งครรภ์และให้นมบุตร" text={aiInfo?.pregnancy} />
          <DrugSection icon="package" title="การเก็บรักษา" text={aiInfo?.storage} />
          <DrugSection icon="sparkles" title="คำแนะนำเพิ่มเติม" text={aiInfo?.tips} />
          {aiInfo && (
            <p className="text-[11px] text-gray-400 px-1 flex gap-1">
              <Icon name="sparkles" className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span>ชื่อภาษาไทย ชื่อวิทยาศาสตร์ ชื่อการค้า สรรพคุณ ข้อบ่งใช้ วิธีใช้ ข้อห้ามใช้ และข้อควรระวัง สรุปโดย AI จากข้อมูลยามาตรฐาน {ai.disclaimer} ถ้าแพทย์สั่งวิธีใช้ต่างจากนี้ ให้ทำตามแพทย์</span>
            </p>
          )}

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