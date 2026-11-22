// ร้านขายยาใกล้ฉัน: แผนที่ตามตำแหน่งจริง + รายการยาที่ต้องซื้อเติม

function PharmacyScreen({ go }) {
  const [pos, setPos] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState('');
  const summary = useApi('/me/summary');

  const locate = () => {
    if (!navigator.geolocation) return setLocError('อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง');
    setLocating(true);
    setLocError('');
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocating(false); },
      () => { setLocError('ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง แผนที่จะค้นหาแบบทั่วไปแทน'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  useEffect(locate, []);

  const query = encodeURIComponent('ร้านขายยา');
  const mapSrc = pos
    ? `https://maps.google.com/maps?q=${query}&ll=${pos.lat},${pos.lng}&z=15&output=embed`
    : `https://maps.google.com/maps?q=${encodeURIComponent('ร้านขายยาใกล้ฉัน')}&z=13&output=embed`;
  const openMaps = pos
    ? `https://www.google.com/maps/search/${query}/@${pos.lat},${pos.lng},15z`
    : `https://www.google.com/maps/search/${query}`;
  const low = summary.data?.lowStock || [];

  return (
    <div className="flex-1 flex flex-col pb-nav bg-white">
      <div className="bg-[#004D25] text-white px-5 py-4 font-bold text-lg shadow-sm flex justify-between items-center">
        <span>ร้านขายยาใกล้ฉัน</span>
        <button onClick={locate} disabled={locating}
          className="text-xs font-normal bg-white/15 hover:bg-white/25 border border-white/30 px-3 py-1.5 rounded-full flex items-center gap-1">
          <Icon name={locating ? 'loader' : 'navigation'} className={`w-3.5 h-3.5 ${locating ? 'animate-spin' : ''}`} />
          {locating ? 'กำลังหาตำแหน่ง' : 'ตำแหน่งของฉัน'}
        </button>
      </div>
      <div className="h-64 w-full border-b border-green-100 bg-gray-100">
        <iframe title="แผนที่ร้านขายยา" width="100%" height="100%" style={{ border: 0 }} loading="lazy" src={mapSrc} />
      </div>
      <div className="p-4 space-y-3">
        {locError && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{locError}</p>}
        <a href={openMaps} target="_blank" rel="noopener noreferrer"
          className="w-full bg-[#388E3C] hover:bg-[#2e7d32] text-white text-sm font-bold py-3 rounded-xl shadow flex items-center justify-center gap-2">
          <Icon name="external" className="w-4 h-4" /> เปิดใน Google Maps (ดูเวลาเปิด-ปิด / นำทาง)
        </a>

        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
          <h4 className="font-bold text-sm text-gray-800 flex items-center gap-1.5 mb-2">
            <Icon name="list" className="w-4 h-4 text-[#2D7A4C]" /> รายการยาที่ควรซื้อเติม
          </h4>
          {summary.loading ? <Spinner /> : low.length === 0 ? (
            <p className="text-xs text-gray-500">ยาประจำยังเหลือพอ (มากกว่า 3 วัน) ✓</p>
          ) : (
            <ul className="space-y-1.5">
              {low.map((m) => (
                <li key={m.id} className="text-xs flex justify-between bg-white rounded-xl px-3 py-2 border border-gray-100">
                  <span className="font-bold text-gray-800">{m.name}</span>
                  <span className="text-red-600">เหลือ {m.stock} เม็ด ({m.daysLeft} วัน)</span>
                </li>
              ))}
            </ul>
          )}
          <button onClick={() => go('mymeds', { tab: 'stock' })} className="text-xs text-[#2D7A4C] font-bold mt-3 hover:underline">
            จัดการสต็อกยา →
          </button>
        </div>

        <div className="bg-green-50 border border-green-100 rounded-2xl p-4 text-xs text-gray-700 space-y-1.5">
          <p className="font-bold text-[#2D7A4C]">เลือกร้านยาอย่างไรให้ปลอดภัย</p>
          <p>• ดูว่ามีเภสัชกรประจำร้านอยู่ขณะซื้อยา</p>
          <p>• แจ้งเภสัชกรเรื่องยาที่แพ้และยาที่ใช้อยู่ (เปิดบัตรแพ้ยาในแอปให้ดูได้)</p>
          <p>• ตรวจวันหมดอายุและสภาพซองยาก่อนรับ</p>
        </div>
      </div>
    </div>
  );
}
