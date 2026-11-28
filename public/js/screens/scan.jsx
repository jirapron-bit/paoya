// สแกนฉลากยา: กล้อง + อ่านตัวหนังสือสด (Tesseract.js) + ให้ AI สรุปฉลากผ่าน backend

let tesseractLoading = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tesseractLoading) {
    tesseractLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = () => resolve(window.Tesseract);
      s.onerror = () => { tesseractLoading = null; reject(new Error('โหลดระบบอ่านตัวหนังสือไม่สำเร็จ')); };
      document.head.appendChild(s);
    });
  }
  return tesseractLoading;
}

// ย่อรูปให้ไม่เกิน maxSize px แล้วแปลงเป็น base64 (jpeg)
function canvasFrom(source, maxSize = 1280) {
  const w = source.videoWidth || source.naturalWidth || source.width;
  const h = source.videoHeight || source.naturalHeight || source.height;
  const scale = Math.min(1, maxSize / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return c;
}

function matchNames(text, names) {
  const lower = text.toLowerCase();
  return names.find((n) => {
    const first = n.name.toLowerCase().split(/[\s(,]/)[0];
    return first.length >= 4 && new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(lower);
  }) || null;
}

function ScanScreen({ openMedicine, isActive, askAI }) {
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const [hasCamera, setHasCamera] = useState(null); // null = กำลังเปิด
  const [live, setLive] = useState(true);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [rawText, setRawText] = useState('');
  const [liveMatch, setLiveMatch] = useState(null);
  const [step, setStep] = useState('camera'); // camera | analyzing | result
  const [result, setResult] = useState(null);
  const names = useApi('/medicines/names');
  const status = useApi('/ai/status');
  const nameList = names.data?.items || [];

  // เปิดกล้อง
  useEffect(() => {
    if (step !== 'camera' || !isActive) return;
    let stream;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setHasCamera(false); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      } catch {
        try { stream = await navigator.mediaDevices.getUserMedia({ video: true }); } catch { stream = null; }
      }
      if (cancelled) { stream && stream.getTracks().forEach((t) => t.stop()); return; }
      if (stream && videoRef.current) {
        videoRef.current.srcObject = stream;
        setHasCamera(true);
      } else {
        setHasCamera(false);
      }
    })();
    return () => { cancelled = true; stream && stream.getTracks().forEach((t) => t.stop()); };
  }, [step, isActive]);

  // อ่านตัวหนังสือจากกล้องเป็นระยะ
  useEffect(() => {
    if (!hasCamera || !live || step !== 'camera' || !isActive) return;
    let cancelled = false;
    let worker = null;
    (async () => {
      try {
        const T = await loadTesseract();
        worker = await T.createWorker('eng');
      } catch (err) {
        setOcrError(err.message);
        return;
      }
      while (!cancelled) {
        const video = videoRef.current;
        if (video && video.readyState === 4) {
          setOcrBusy(true);
          try {
            const canvas = canvasFrom(video, 640);
            const { data } = await worker.recognize(canvas);
            if (cancelled) break;
            const words = (data.words || [])
              .filter((w) => w.confidence > 55 && w.text.trim().length >= 2)
              .map((w) => ({
                text: w.text.trim(),
                x: (w.bbox.x0 / canvas.width) * 100,
                y: (w.bbox.y0 / canvas.height) * 100,
                w: ((w.bbox.x1 - w.bbox.x0) / canvas.width) * 100,
                h: ((w.bbox.y1 - w.bbox.y0) / canvas.height) * 100,
              }));
            setBlocks(words);
            const text = words.map((w) => w.text).join(' ');
            setRawText(text);
            const found = text.length >= 3 ? matchNames(text, nameList) : null;
            if (found) setLiveMatch(found);
          } catch { /* ข้ามเฟรมนี้ */ }
          setOcrBusy(false);
        }
        await new Promise((r) => setTimeout(r, 900));
      }
      worker && worker.terminate();
    })();
    return () => { cancelled = true; };
  }, [hasCamera, live, step, isActive, nameList.length]);

  const analyze = async (imageSource, ocrText) => {
    setLive(false);
    setStep('analyzing');
    try {
      const image = imageSource ? canvasFrom(imageSource).toDataURL('image/jpeg', 0.85).split(',')[1] : '';
      const res = await api.post('/ai/scan', { image, ocrText });
      setResult(res);
      setStep('result');
    } catch (err) {
      toast(err.message, 'error');
      setStep('camera');
      setLive(true);
    }
  };

  // อัปโหลดรูปฉลากจากเครื่อง
  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode().catch(() => null);
    setLive(false);
    setStep('analyzing');
    let text = '';
    try {
      const T = await loadTesseract();
      const { data } = await T.recognize(canvasFrom(img), 'eng');
      text = data.text || '';
    } catch { /* ถ้า OCR ไม่ได้ ให้ AI อ่านจากรูปอย่างเดียว */ }
    await analyze(img, text);
    URL.revokeObjectURL(img.src);
  };

  const closeResult = () => { setResult(null); setStep('camera'); setLive(true); };

  return (
    <div className="flex-1 bg-black h-full flex flex-col justify-between relative overflow-hidden">
      <div className="w-full px-4 pt-4 pb-6 flex items-center justify-between z-30 text-white absolute top-0 left-0 bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center gap-2 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/15">
          <span className={`w-2 h-2 rounded-full ${live && hasCamera ? 'bg-green-400 animate-pulse' : 'bg-amber-400'}`} />
          <span className="text-[11px] font-medium">
            {!hasCamera ? 'ไม่มีกล้อง' : live ? (ocrBusy ? 'กำลังอ่านตัวหนังสือ...' : 'อ่านฉลากสด') : 'หยุดภาพ'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-1 rounded-full border ${status.data?.gemini ? 'border-green-400 text-green-300' : 'border-white/30 text-white/70'}`}>
            AI: {status.data?.gemini ? 'เปิด' : 'โหมดพื้นฐาน'}
          </span>
          {hasCamera && (
            <button onClick={() => setLive(!live)}
              className="px-3 py-1.5 bg-black/50 hover:bg-black/70 backdrop-blur-md rounded-full border border-white/20 text-xs font-medium flex items-center gap-1">
              <Icon name={live ? 'pause' : 'play'} className="w-3.5 h-3.5" /> {live ? 'หยุด' : 'สแกนต่อ'}
            </button>
          )}
        </div>
      </div>

      <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover ${hasCamera ? 'block' : 'hidden'}`} />

        {hasCamera && step === 'camera' && (
          <div className="absolute inset-0 pointer-events-none z-20">
            {blocks.map((b, i) => (
              <div key={i} style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${Math.max(b.w, 6)}%`, height: `${Math.max(b.h, 3)}%` }}
                className="absolute border border-yellow-400 bg-yellow-400/20 rounded" />
            ))}
          </div>
        )}

        {hasCamera === false && (
          <div className="text-center text-white/80 px-8 z-10">
            <Icon name="camera" className="w-12 h-12 mx-auto mb-3 text-yellow-400" />
            <p className="text-sm font-bold">เปิดกล้องไม่ได้</p>
            <p className="text-xs text-white/60 mt-1">อนุญาตการใช้กล้องในเบราว์เซอร์ (ต้องเปิดผ่าน https หรือ localhost) หรืออัปโหลดรูปฉลากยาแทน</p>
          </div>
        )}

        {hasCamera && (
          <div className="w-[82%] h-[42%] border border-white/30 rounded-2xl pointer-events-none relative z-10">
            {['-top-0.5 -left-0.5 border-t-2 border-l-2 rounded-tl-lg', '-top-0.5 -right-0.5 border-t-2 border-r-2 rounded-tr-lg',
              '-bottom-0.5 -left-0.5 border-b-2 border-l-2 rounded-bl-lg', '-bottom-0.5 -right-0.5 border-b-2 border-r-2 rounded-br-lg'].map((c) => (
              <div key={c} className={`absolute w-5 h-5 border-yellow-400 ${c}`} />
            ))}
          </div>
        )}
      </div>

      {step === 'camera' && (
        <div className="w-full p-4 pb-nav bg-gradient-to-t from-black/95 via-black/80 to-transparent z-30 space-y-3 absolute bottom-0">
          {ocrError && <p className="text-xs text-amber-300 text-center">{ocrError}</p>}
          {rawText && (
            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-xl px-3 py-2 text-white">
              <span className="text-[10px] text-yellow-300 font-bold block">ข้อความที่กล้องอ่านได้:</span>
              <p className="text-xs truncate text-white/90">{rawText}</p>
            </div>
          )}
          {liveMatch ? (
            <div className="bg-white rounded-2xl p-3.5 shadow-xl border-2 border-[#388E3C] flex items-center justify-between pop-in">
              <div className="pr-2 min-w-0">
                <span className="text-[10px] bg-green-100 text-[#2D7A4C] font-bold px-2 py-0.5 rounded-full">พบยาในบัญชียาหลัก</span>
                <h4 className="font-bold text-gray-900 text-sm mt-1 truncate">{liveMatch.name}</h4>
              </div>
              <button onClick={() => openMedicine({ id: liveMatch.id })}
                className="bg-[#388E3C] text-white text-xs font-bold px-3.5 py-2.5 rounded-xl shadow whitespace-nowrap active:scale-95">ดูข้อมูลยา</button>
            </div>
          ) : hasCamera && (
            <p className="text-center text-white/75 text-xs">ให้เห็นชื่อยาบนแผง ซอง หรือกล่องชัด ๆ (เอียงได้ ไม่ต้องตรง) แล้วกดปุ่มด้านล่าง</p>
          )}
          <div className="flex gap-2">
            <button onClick={() => fileRef.current?.click()}
              className="flex-1 bg-white/15 hover:bg-white/25 text-white font-bold py-3 rounded-full text-xs flex items-center justify-center gap-1.5 border border-white/20">
              <Icon name="image" className="w-4 h-4" /> อัปโหลดรูป
            </button>
            {hasCamera && (
              <button onClick={() => analyze(videoRef.current, rawText)}
                className="flex-[2] bg-[#388E3C] hover:bg-[#2e7d32] text-white font-bold py-3 rounded-full text-xs shadow-lg flex items-center justify-center gap-2 active:scale-95">
                <Icon name="sparkles" className="w-4 h-4" /> ถ่ายแล้วให้ AI บอกว่าเป็นยาอะไร
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickFile} />
        </div>
      )}

      {step === 'analyzing' && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-md z-50 flex flex-col items-center justify-center text-white p-6">
          <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mb-4" />
          <h4 className="font-bold text-base mb-1">กำลังอ่านฉลากยา...</h4>
          <p className="text-xs text-gray-300 text-center max-w-xs">อาจใช้เวลาสักครู่</p>
        </div>
      )}

      {step === 'result' && result && (
        <ScanResult result={result} onClose={closeResult} openMedicine={openMedicine} askAI={askAI} />
      )}
    </div>
  );
}

// ---------- ผลการสแกน ----------
const CONFIDENCE_TH = { high: 'สูง', medium: 'ปานกลาง', low: 'ต่ำ' };

function ResultSection({ icon, title, children, tone = 'plain' }) {
  if (!children) return null;
  const tones = {
    plain: 'bg-white border-gray-100',
    green: 'bg-green-50 border-green-100',
    amber: 'bg-amber-50 border-amber-200',
    blue: 'bg-blue-50 border-blue-100',
  };
  return (
    <div className={`p-3.5 rounded-2xl border ${tones[tone]}`}>
      <p className="text-xs font-bold text-gray-800 flex items-center gap-1.5 mb-1">
        <Icon name={icon} className="w-4 h-4 text-[#2D7A4C]" /> {title}
      </p>
      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{children}</p>
    </div>
  );
}

function ScanResult({ result, onClose, openMedicine, askAI }) {
  const r = result.result || {};
  const [showAdd, setShowAdd] = useState(false);
  const found = Boolean(r.drugName) && r.confidence !== 'low';
  const title = r.brandName && r.drugName ? r.brandName : r.drugName;

  return (
    <div className="absolute inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-3 pb-nav md:pb-3">
      <div className="pop-in bg-gray-50 w-full max-w-lg rounded-3xl shadow-2xl max-h-[88%] flex flex-col overflow-hidden">
        <div className="bg-white px-5 pt-4 pb-3 border-b border-gray-100 flex justify-between items-start">
          <div className="min-w-0">
            <p className="text-[11px] text-gray-500">
              {result.mode !== 'ocr' ? `AI อ่านจากภาพ • ความมั่นใจ${CONFIDENCE_TH[r.confidence] || '-'}` : 'อ่านจากตัวหนังสือบนฉลาก (โหมดพื้นฐาน)'}
            </p>
            {found ? (
              <>
                <h3 className="font-bold text-gray-900 text-xl leading-tight mt-0.5">{title}</h3>
                <p className="text-sm text-gray-600">
                  {[r.brandName && r.drugName ? r.drugName : '', r.strength, r.dosageForm].filter(Boolean).join(' • ')}
                </p>
              </>
            ) : (
              <h3 className="font-bold text-gray-900 text-base mt-0.5">ยังระบุยาไม่ได้</h3>
            )}
          </div>
          <button onClick={() => { tts.stop(); onClose(); }} aria-label="ปิด" className="text-gray-400 p-1"><Icon name="x" className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <AllergyBanner warnings={result.allergyWarnings} />

          {found && (
            <div className="flex justify-end">
              <SpeakButton id="scan-result" label="อ่านผลให้ฟัง" text={() => [
                result.allergyWarnings?.length ? 'คำเตือน คุณเคยบันทึกว่าแพ้ยานี้ ห้ามใช้โดยไม่ปรึกษาแพทย์' : '',
                `ยา ${title}`, r.strength, r.usedFor && `ใช้รักษา ${r.usedFor}`, r.howToUse && `วิธีใช้ ${r.howToUse}`,
                r.labelInstruction && `วิธีใช้บนฉลาก ${r.labelInstruction}`, r.cautions && `ข้อควรระวัง ${r.cautions}`,
              ].filter(Boolean).join('. ')} />
            </div>
          )}

          {!found && (
            <div className="bg-white p-4 rounded-2xl border border-gray-100 text-sm text-gray-600 space-y-2">
              <p>{r.aiAdvice || 'อ่านชื่อยาจากภาพไม่ชัด'}</p>
              <p className="text-xs text-gray-500">ลองใหม่: ถ่ายให้เห็นชื่อยาเต็ม ๆ ไม่ให้แสงสะท้อนบนแผงฟอยล์ และถือกล้องให้นิ่ง</p>
              {r.drugName && <p className="text-xs text-amber-700">AI คิดว่าอาจเป็น "{r.drugName}" แต่ไม่มั่นใจ จึงไม่แสดงวิธีใช้</p>}
            </div>
          )}

          {found && (
            <>
              <ResultSection icon="pill" title="ใช้รักษา" tone="green">{r.usedFor}</ResultSection>
              <ResultSection icon="clock" title="วิธีใช้ทั่วไป (ผู้ใหญ่)" tone="blue">{r.howToUse}</ResultSection>
              <ResultSection icon="list" title="วิธีใช้ที่พิมพ์บนฉลาก">{r.labelInstruction}</ResultSection>
              <ResultSection icon="info" title="ผลข้างเคียงที่พบบ่อย">{r.sideEffects}</ResultSection>
              <ResultSection icon="alert-triangle" title="ข้อควรระวัง" tone="amber">{r.cautions}</ResultSection>
              {result.mode === 'ocr' && r.aiAdvice && <p className="text-xs text-gray-500 px-1">{r.aiAdvice}</p>}
            </>
          )}

          {result.matches?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-500 px-1">ข้อมูลในบัญชียาหลักแห่งชาติ</p>
              {result.matches.map((m) => (
                <button key={m.id} onClick={() => { onClose(); openMedicine(m); }}
                  className="w-full text-left p-3 rounded-xl border border-gray-200 bg-white hover:border-[#2D7A4C] flex justify-between items-center">
                  <span className="text-sm font-bold text-gray-800">{m.genericName} <span className="font-normal text-gray-500">{m.dosageForm}</span></span>
                  <Icon name="chevron-right" className="w-4 h-4 text-gray-400" />
                </button>
              ))}
            </div>
          )}

          <p className="text-[11px] text-gray-500 bg-white rounded-xl p-3 border border-gray-100">
            {result.disclaimer} ถ้าแพทย์สั่งวิธีใช้ไว้ต่างจากนี้ ให้ทำตามแพทย์
          </p>
        </div>

        <div className="bg-white border-t border-gray-100 p-3 grid grid-cols-2 gap-2">
          {found ? (
            <>
              <Button onClick={() => setShowAdd(true)}><Icon name="plus-circle" className="w-4 h-4" /> เพิ่มเป็นยาประจำ</Button>
              <Button variant="soft" onClick={() => askAI(`ยา ${title}${r.strength ? ` ${r.strength}` : ''} (${r.drugName}) ใช้อย่างไร ต้องระวังอะไรบ้าง`)}>
                <Icon name="bot" className="w-4 h-4" /> ถามเภสัชกร AI ต่อ
              </Button>
            </>
          ) : null}
          <Button variant="ghost" className={found ? 'col-span-2' : 'col-span-2'} onClick={onClose}>สแกนใหม่</Button>
        </div>
      </div>

      {showAdd && (
        <AddToMyMedsModal
          medicine={{ genericName: r.brandName ? `${r.drugName} (${r.brandName})` : r.drugName, strength: r.strength }}
          onClose={() => setShowAdd(false)} />
      )}
    </div>
  );
}