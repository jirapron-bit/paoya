// แชทปรึกษาเภสัชกร AI (คุยผ่าน backend)

const CHAT_WELCOME = { id: 'welcome', sender: 'bot', text: 'สวัสดีครับ ผมคือเภสัชกร AI ผู้ช่วยเป๋ายา สอบถามเรื่องยา การทานยา หรือผลข้างเคียงได้เลยครับ 💊' };
const CHAT_SUGGESTIONS = ['ลืมทานยาต้องทำอย่างไร', 'ยาก่อนอาหารต้องทานตอนไหน', 'ปวดหัวมีไข้ทานยาอะไรได้บ้าง', 'ควรเก็บยาอย่างไร'];

function ChatPanel({ onClose, messages, setMessages, initialText, autoSpeak = false }) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const status = useApi('/ai/status');
  const bottomRef = useRef(null);
  const sentInitial = useRef(false);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  const send = async (text) => {
    const t = (text ?? input).trim();
    if (!t || sending) return;
    const next = [...messages, { id: Date.now(), sender: 'user', text: t }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const res = await api.post('/ai/chat', { messages: next.filter((m) => m.id !== 'welcome') });
      const botId = Date.now() + 1;
      setMessages((prev) => [...prev, { id: botId, sender: 'bot', text: res.reply }]);
      if (autoSpeak) tts.speak(res.reply, `chat-${botId}`);
    } catch (err) {
      setMessages((prev) => [...prev, { id: Date.now() + 1, sender: 'bot', text: `ขออภัย ${err.message}`, error: true }]);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (initialText && !sentInitial.current) {
      sentInitial.current = true;
      send(initialText);
    }
  }, [initialText]);

  return (
    <div className="absolute inset-0 md:left-auto md:w-[420px] md:border-l md:border-gray-200 md:shadow-2xl bg-white z-50 flex flex-col h-full pop-in safe-bottom">
      <div className="bg-[#004D25] text-white px-4 py-3 flex items-center justify-between shadow">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"><Icon name="bot" className="w-5 h-5 text-green-300" /></div>
          <div>
            <h3 className="font-bold text-sm">ปรึกษาเภสัชกร AI</h3>
            <p className="text-[10px] text-green-200">{status.data?.gemini ? 'ตอบโดย AI • รู้ประวัติแพ้ยาและยาประจำของคุณ' : 'โหมดพื้นฐาน (ตอบคำถามทั่วไป)'}</p>
          </div>
        </div>
        <button onClick={() => { tts.stop(); onClose(); }} aria-label="ปิดแชท" className="p-1 text-white/80 hover:text-white"><Icon name="x" className="w-6 h-6" /></button>
      </div>

      <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-50">
        {messages.map((m) => (
          <div key={m.id} className={`flex items-end gap-1 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm whitespace-pre-line ${
              m.sender === 'user' ? 'bg-[#388E3C] text-white rounded-br-none'
                : m.error ? 'bg-red-50 text-red-700 border border-red-100 rounded-bl-none'
                : 'bg-white text-gray-800 rounded-bl-none border border-gray-100'}`}>
              {m.text}
            </div>
            {m.sender === 'bot' && !m.error && <SpeakButton text={m.text} id={`chat-${m.id}`} label="ฟัง" compact className="flex-shrink-0 mb-1" />}
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex gap-1">
              {[0, 1, 2].map((i) => <span key={i} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
            </div>
          </div>
        )}
        {messages.length <= 1 && !sending && (
          <div className="flex flex-wrap gap-2 pt-2">
            {CHAT_SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)} className="text-xs bg-white border border-green-200 text-[#2D7A4C] px-3 py-1.5 rounded-full hover:bg-green-50">{s}</button>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <p className="text-[10px] text-gray-400 text-center px-4 py-1 bg-white border-t border-gray-100">คำแนะนำทั่วไป ไม่ใช่การวินิจฉัย • ฉุกเฉินโทร 1669</p>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-3 bg-white flex items-center gap-2">
        <input type="text" placeholder="พิมพ์คำถามเรื่องยา..." value={input} onChange={(e) => setInput(e.target.value)} aria-label="ข้อความ"
          className="flex-1 px-4 py-2.5 text-sm bg-gray-100 rounded-full focus:outline-none focus:bg-white border border-transparent focus:border-[#2D7A4C]" />
        <button type="submit" disabled={sending || !input.trim()} aria-label="ส่ง"
          className="p-2.5 bg-[#388E3C] text-white rounded-full hover:bg-[#2e7d32] active:scale-95 shadow disabled:opacity-50">
          <Icon name="send" className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}