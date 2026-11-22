// หน้าหลัก: ค้นหายา หมวดหมู่ ยาที่ติดดาว ประวัติการเปิดดู และการแจ้งเตือน

function MedicineRow({ item, onOpen, onToggleFavorite }) {
  return (
    <div onClick={() => onOpen(item)} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(item)}
      className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-[0.99]">
      <div className="pr-2 min-w-0">
        <h4 className="font-bold text-gray-900 text-sm">{item.genericName}</h4>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
          {item.dosageForm || '-'}{item.strength && item.strength !== 'ไม่ระบุ' ? ` • ${item.strength}` : ''}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5 truncate">{item.mainGroup}</p>
      </div>
      {onToggleFavorite && (
        <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(item); }}
          aria-label={item.isFavorite ? 'เลิกติดดาว' : 'ติดดาว'}
          className={`p-1 flex-shrink-0 ${item.isFavorite ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-500'}`}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill={item.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
          </svg>
        </button>
      )}
    </div>
  );
}

async function toggleFavorite(item) {
  try {
    const res = item.isFavorite
      ? await api.del(`/medicines/${item.id}/favorite`)
      : await api.put(`/medicines/${item.id}/favorite`);
    toast(res.isFavorite ? 'ติดดาวยานี้แล้ว' : 'เลิกติดดาวแล้ว', 'info');
    return res.isFavorite;
  } catch (err) {
    toast(err.message, 'error');
    return item.isFavorite;
  }
}

function HomeScreen({ user, go, openMedicine, searchState, setSearchState }) {
  const { query, category } = searchState;
  const setQuery = (q) => setSearchState((s) => ({ ...s, query: q }));
  const setCategory = (c) => setSearchState((s) => ({ ...s, category: c }));

  const [results, setResults] = useState({ items: [], total: 0, loading: false, error: '' });
  const categories = useApi('/medicines/categories');
  const recent = useApi('/medicines/recent');
  const favorites = useApi('/medicines/favorites');
  const summary = useApi('/me/summary');

  const searching = query.trim() !== '' || category !== '';

  // ค้นหาเมื่อพิมพ์หยุด 300ms
  useEffect(() => {
    if (!searching) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setResults((r) => ({ ...r, loading: true, error: '' }));
      try {
        const params = new URLSearchParams({ q: query.trim(), category, limit: 30 });
        const data = await api.get(`/medicines?${params}`);
        if (!cancelled) setResults({ items: data.items, total: data.total, loading: false, error: '' });
      } catch (err) {
        if (!cancelled) setResults({ items: [], total: 0, loading: false, error: err.message });
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, category]);

  const loadMore = async () => {
    const params = new URLSearchParams({ q: query.trim(), category, limit: 30, offset: results.items.length });
    try {
      const data = await api.get(`/medicines?${params}`);
      setResults((r) => ({ ...r, items: [...r.items, ...data.items] }));
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const onToggleFav = async (item) => {
    const isFavorite = await toggleFavorite(item);
    const patch = (list) => list.map((m) => (m.id === item.id ? { ...m, isFavorite } : m));
    setResults((r) => ({ ...r, items: patch(r.items) }));
    favorites.reload();
  };

  const clearRecent = async () => {
    try {
      await api.del('/medicines/recent');
      recent.setData({ items: [] });
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const notif = user.settings.notifications;
  const showRefill = notif.enableAll && notif.refillReminder && summary.data?.lowStock?.length > 0;
  const nextAppt = summary.data?.nextAppointment;

  return (
    <div className="flex-1 flex flex-col pb-nav">
      <div className="bg-[#004D25] text-white px-5 pt-4 pb-5 shadow-sm">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-xs text-green-200">สวัสดี</p>
            <h1 className="font-bold text-lg">คุณ{user.firstName}</h1>
          </div>
          <img src="icons/icon-192.png" alt="" className="w-10 h-10 rounded-full bg-white object-contain" />
        </div>
        <div className="flex items-center rounded-full px-4 py-2.5 mt-4 bg-white text-gray-800 focus-within:ring-2 focus-within:ring-green-300 relative">
          <Icon name="search" className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
          <input type="text" inputMode="search" enterKeyHint="search" placeholder="ค้นหาชื่อยา หรือกลุ่มยา (ภาษาอังกฤษ)" value={query} aria-label="ค้นหาชื่อยา"
            onChange={(e) => setQuery(e.target.value)} className="w-full bg-transparent text-sm focus:outline-none pr-6" />
          {query && (
            <button onClick={() => setQuery('')} aria-label="ล้างคำค้นหา" className="absolute right-3 text-gray-400 hover:text-gray-600">
              <Icon name="x-circle" className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* หมวดหมู่ */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-3 bg-white border-b border-gray-100">
        <button onClick={() => setCategory('')}
          className={`text-xs whitespace-nowrap px-3 py-1.5 rounded-full border font-medium ${category === '' ? 'bg-[#388E3C] text-white border-[#388E3C]' : 'bg-white text-gray-600 border-gray-200'}`}>
          ทั้งหมด
        </button>
        {(categories.data?.categories || []).map((c) => (
          <button key={c.name} onClick={() => setCategory(category === c.name ? '' : c.name)}
            className={`text-xs whitespace-nowrap px-3 py-1.5 rounded-full border font-medium ${category === c.name ? 'bg-[#388E3C] text-white border-[#388E3C]' : 'bg-white text-gray-600 border-gray-200'}`}>
            {c.name.replace(/^\d+\.\s*/, '')}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-4">
        {!searching && <InstallBanner />}
        {!searching && showRefill && (
          <button onClick={() => go('mymeds', { tab: 'stock' })}
            className="w-full text-left bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-center gap-3">
            <div className="p-2 bg-amber-100 text-amber-600 rounded-xl"><Icon name="package" /></div>
            <div className="flex-1">
              <p className="font-bold text-sm text-amber-800">ยาใกล้หมด {summary.data.lowStock.length} รายการ</p>
              <p className="text-xs text-amber-700">{summary.data.lowStock.map((m) => `${m.name} (เหลือ ${m.daysLeft} วัน)`).join(', ')}</p>
            </div>
            <Icon name="chevron-right" className="w-4 h-4 text-amber-500" />
          </button>
        )}

        {!searching && nextAppt && (
          <button onClick={() => go('mymeds', { tab: 'appointments' })}
            className="w-full text-left bg-blue-50 border border-blue-200 rounded-2xl p-3.5 flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-xl"><Icon name="calendar" /></div>
            <div className="flex-1">
              <p className="font-bold text-sm text-blue-800">
                นัดถัดไป{daysUntil(nextAppt.date) === 0 ? ' (วันนี้)' : daysUntil(nextAppt.date) === 1 ? ' (พรุ่งนี้)' : ` (อีก ${daysUntil(nextAppt.date)} วัน)`}
              </p>
              <p className="text-xs text-blue-700">{nextAppt.hospital} • {formatDateTH(nextAppt.date)}{nextAppt.time ? ` ${nextAppt.time} น.` : ''}</p>
            </div>
            <Icon name="chevron-right" className="w-4 h-4 text-blue-500" />
          </button>
        )}

        {searching ? (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-base text-gray-800">ผลการค้นหา</h3>
              {!results.loading && <span className="text-xs text-gray-400">พบ {results.total} รายการ</span>}
            </div>
            {results.loading && results.items.length === 0 ? <Spinner label="กำลังค้นหา..." />
              : results.error ? <ErrorText>{results.error}</ErrorText>
              : results.items.length === 0 ? <EmptyState title={`ไม่พบยาที่ตรงกับ "${query}"`} subtitle="ลองพิมพ์ชื่อสามัญภาษาอังกฤษ เช่น paracetamol, amlodipine" />
              : (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    {results.items.map((item) => (
                      <MedicineRow key={item.id} item={item} onOpen={openMedicine} onToggleFavorite={onToggleFav} />
                    ))}
                  </div>
                  {results.items.length < results.total && (
                    <Button variant="outline" className="w-full" onClick={loadMore}>แสดงเพิ่มเติม</Button>
                  )}
                </>
              )}
          </div>
        ) : (
          <>
            {recent.data?.items?.length > 0 && (
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <div className="flex justify-between items-center mb-2.5">
                  <span className="text-xs font-bold text-gray-600 flex items-center gap-1.5">
                    <Icon name="history" className="w-3.5 h-3.5 text-gray-400" /> ยาที่เคยเปิดดู
                  </span>
                  <button onClick={clearRecent} className="text-xs text-red-500 hover:underline flex items-center gap-1">
                    <Icon name="trash" className="w-3 h-3" /> ล้างประวัติ
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recent.data.items.map((m) => (
                    <button key={m.id} onClick={() => openMedicine(m)}
                      className="text-xs bg-white text-gray-700 px-3 py-1.5 rounded-full border border-gray-200 hover:border-[#2D7A4C] hover:text-[#2D7A4C] shadow-sm font-medium">
                      {m.genericName.split(' (')[0]} <span className="text-gray-400">{m.dosageForm}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {favorites.data?.items?.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-bold text-sm text-gray-700 flex items-center gap-1.5">
                  <Icon name="star" className="w-4 h-4 text-yellow-500" /> ยาที่ติดดาวไว้
                </h3>
                <div className="grid gap-2 md:grid-cols-2">
                  {favorites.data.items.map((item) => (
                    <MedicineRow key={item.id} item={item} onOpen={openMedicine}
                      onToggleFavorite={async (m) => { await toggleFavorite(m); favorites.reload(); }} />
                  ))}
                </div>
              </div>
            )}

            <EmptyState title="พิมพ์ชื่อยาเพื่อค้นหา หรือเลือกหมวดหมู่ด้านบน"
              subtitle={<>ข้อมูลจากบัญชียาหลักแห่งชาติ • หรือกดเมนู <b className="text-[#004D25]">"สแกน"</b> เพื่อค้นหาจากฉลากยา</>} />
          </>
        )}
      </div>
    </div>
  );
}
