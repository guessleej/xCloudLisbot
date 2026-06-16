import React, {
  useState, useRef, useEffect, useCallback,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send, Bot, User, Clock, ChevronDown,
  RotateCcw, X, Maximize2, Minimize2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// ── Types ──────────────────────────────────────────────────────
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

const LANG_OPTIONS = [
  { value: 'zh-TW', label: '繁中' },
  { value: 'en-US', label: 'EN' },
  { value: 'ja-JP', label: '日本語' },
];

const QUICK_QUESTIONS = [
  '本週有哪些行動事項？',
  '幫我準備下一場會議',
  '總結這個月的重點決策',
  '有哪些待辦事項還未完成？',
];

const LS_KEY = 'lisbot_copilot_history';

const genId = () => Math.random().toString(36).slice(2);

function loadHistory(): Conversation[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw).map((c: any) => ({
      ...c,
      createdAt: new Date(c.createdAt),
      messages: c.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })),
    }));
  } catch { return []; }
}

function saveHistory(convs: Conversation[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(convs.slice(0, 20))); } catch {}
}

// ── Markdown-lite renderer ─────────────────────────────────────
// Renders bold, bullet lists, and meeting ID links
const RenderMessage: React.FC<{ text: string; onMeetingClick: (id: string) => void }> = ({ text, onMeetingClick }) => {
  const lines = text.split('\n');

  const renderInline = (line: string, key: number) => {
    // Replace [meetingId] with clickable chip
    const parts = line.split(/(\[[a-z0-9]+\])/gi);
    return (
      <span key={key}>
        {parts.map((part, i) => {
          const match = part.match(/^\[([a-z0-9]+)\]$/i);
          if (match) {
            return (
              <button
                key={i}
                onClick={() => onMeetingClick(match[1])}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium mx-0.5 transition-colors hover:opacity-80"
                style={{ background: 'rgba(0,212,255,0.15)', color: '#00D4FF', border: '1px solid rgba(0,212,255,0.2)' }}
              >
                {match[1]}
              </button>
            );
          }
          // Bold **text**
          const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
          return boldParts.map((bp, j) =>
            bp.startsWith('**') && bp.endsWith('**')
              ? <strong key={j} className="font-semibold text-white">{bp.slice(2, -2)}</strong>
              : <span key={j}>{bp}</span>
          );
        })}
      </span>
    );
  };

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith('• ') || line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={i} className="flex gap-2">
              <span className="flex-shrink-0 mt-0.5 text-slate-500">•</span>
              <span>{renderInline(line.slice(2), i)}</span>
            </div>
          );
        }
        if (/^\d+\.\s/.test(line)) {
          const num = line.match(/^(\d+)\.\s/)![1];
          return (
            <div key={i} className="flex gap-2">
              <span className="flex-shrink-0 mt-0.5 text-slate-500 w-4 text-right">{num}.</span>
              <span>{renderInline(line.replace(/^\d+\.\s/, ''), i)}</span>
            </div>
          );
        }
        if (line === '') return <div key={i} className="h-1" />;
        return <div key={i}>{renderInline(line, i)}</div>;
      })}
    </div>
  );
};

// ── Bubble ─────────────────────────────────────────────────────
const Bubble: React.FC<{
  msg: Message;
  onMeetingClick: (id: string) => void;
  isStreaming?: boolean;
}> = ({ msg, onMeetingClick, isStreaming }) => {
  const isUser = msg.role === 'user';
  const hhmm = `${String(msg.timestamp.getHours()).padStart(2,'0')}:${String(msg.timestamp.getMinutes()).padStart(2,'0')}`;

  if (isUser) {
    return (
      <div className="flex justify-end gap-2 mb-3">
        <div className="max-w-[80%]">
          <div className="px-3 py-2 rounded-2xl rounded-tr-sm text-[13px] leading-relaxed text-white"
               style={{ background: '#00D4FF', color: '#0A0E27' }}>
            {msg.content}
          </div>
          <p className="text-[10px] text-slate-600 text-right mt-1">{hhmm}</p>
        </div>
        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
             style={{ background: 'rgba(0,212,255,0.15)' }}>
          <User size={13} strokeWidth={1.75} className="text-[#00D4FF]" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 mb-3">
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
           style={{ background: 'rgba(123,47,255,0.2)' }}>
        <Bot size={13} strokeWidth={1.75} className="text-purple-400" />
      </div>
      <div className="max-w-[85%]">
        <div className="px-3 py-2.5 rounded-2xl rounded-tl-sm text-[13px] leading-relaxed text-slate-200"
             style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <RenderMessage text={msg.content} onMeetingClick={onMeetingClick} />
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 ml-0.5 rounded-sm animate-pulse"
                  style={{ background: '#7B2FFF', verticalAlign: 'text-bottom' }} />
          )}
        </div>
        <p className="text-[10px] text-slate-600 mt-1">{hhmm}</p>
      </div>
    </div>
  );
};

// ── History sidebar ────────────────────────────────────────────
const HistoryList: React.FC<{
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({ conversations, activeId, onSelect, onDelete }) => {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-center px-4">
        <Clock size={22} strokeWidth={1.25} className="text-slate-600 mb-2" />
        <p className="text-[12px] text-slate-600">尚無歷史記錄</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto flex-1 py-2">
      {conversations.map(c => {
        const preview = c.messages.find(m => m.role === 'user')?.content || '空對話';
        const dateStr = c.createdAt.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
        return (
          <div
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`group flex items-start gap-2 px-3 py-2.5 cursor-pointer transition-colors ${
              activeId === c.id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
            }`}
          >
            <img src="/xcloud-lisbot-logo.svg" alt="" className="w-4 h-4 rounded flex-shrink-0 mt-0.5 opacity-70" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-slate-300 truncate">{preview}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">{dateStr} · {c.messages.length} 則</p>
            </div>
            <button
              onClick={e => { e.stopPropagation(); onDelete(c.id); }}
              className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all flex-shrink-0"
            >
              <X size={12} strokeWidth={2} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

// ── Main panel ─────────────────────────────────────────────────
interface CopilotPanelProps {
  expanded?: boolean;
  onToggleExpand?: () => void;
  onClose?: () => void;
}

const CopilotPanel: React.FC<CopilotPanelProps> = ({ expanded, onToggleExpand, onClose }) => {
  const navigate = useNavigate();
  const { getToken, user } = useAuth();
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

  const [tab, setTab] = useState<'chat' | 'history'>('chat');
  const [language, setLanguage] = useState('zh-TW');
  const [showLang, setShowLang] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>(loadHistory);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeConv = conversations.find(c => c.id === activeConvId) ?? null;
  const messages = activeConv?.messages ?? [];

  useEffect(() => {
    saveHistory(conversations);
  }, [conversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const startNewConv = useCallback(() => {
    setActiveConvId(null);
    setInput('');
    setTab('chat');
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setInput('');
    setIsLoading(true);

    const userMsg: Message = {
      id: genId(), role: 'user', content: trimmed, timestamp: new Date(),
    };

    // Create or get conversation
    let convId = activeConvId;
    let convHistory: Message[] = [];

    if (!convId) {
      convId = genId();
      const newConv: Conversation = {
        id: convId,
        title: trimmed.slice(0, 40),
        messages: [userMsg],
        createdAt: new Date(),
      };
      setConversations(prev => [newConv, ...prev]);
      setActiveConvId(convId);
    } else {
      setConversations(prev =>
        prev.map(c => c.id === convId ? { ...c, messages: [...c.messages, userMsg] } : c)
      );
      convHistory = activeConv?.messages ?? [];
    }

    // Add placeholder assistant message
    const assistantId = genId();
    const assistantMsg: Message = {
      id: assistantId, role: 'assistant', content: '', timestamp: new Date(),
    };
    setConversations(prev =>
      prev.map(c => c.id === convId ? { ...c, messages: [...c.messages, assistantMsg] } : c)
    );

    // Stream from backend
    try {
      const token = await getToken();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const history = convHistory.map(m => ({ role: m.role, content: m.content }));

      const res = await fetch(`${backendUrl}/api/copilot/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: trimmed, history, language }),
        signal: ctrl.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let full = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.delta) {
              full += parsed.delta;
              setConversations(prev =>
                prev.map(c =>
                  c.id === convId
                    ? { ...c, messages: c.messages.map(m => m.id === assistantId ? { ...m, content: full } : m) }
                    : c
                )
              );
            }
            if (parsed.error) {
              full = `❌ 發生錯誤：${parsed.error}`;
              setConversations(prev =>
                prev.map(c =>
                  c.id === convId
                    ? { ...c, messages: c.messages.map(m => m.id === assistantId ? { ...m, content: full } : m) }
                    : c
                )
              );
            }
          } catch {}
        }
      }

      if (!full) {
        full = '（未收到回應，請確認後端連線）';
        setConversations(prev =>
          prev.map(c =>
            c.id === convId
              ? { ...c, messages: c.messages.map(m => m.id === assistantId ? { ...m, content: full } : m) }
              : c
          )
        );
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      const errMsg = '（無法連線至後端，請確認服務是否啟動）';
      setConversations(prev =>
        prev.map(c =>
          c.id === convId
            ? { ...c, messages: c.messages.map(m => m.id === assistantId ? { ...m, content: errMsg } : m) }
            : c
        )
      );
    } finally {
      setIsLoading(false);
      abortRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [activeConvId, activeConv, backendUrl, getToken, isLoading, language]);

  const handleMeetingClick = useCallback((id: string) => {
    navigate(`/meeting/${id}`);
  }, [navigate]);

  const deleteConv = useCallback((id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConvId === id) setActiveConvId(null);
  }, [activeConvId]);

  // streaming indicator: last message is assistant with empty/partial content
  const streamingMsgId = isLoading && messages.length > 0 && messages[messages.length - 1].role === 'assistant'
    ? messages[messages.length - 1].id : null;

  return (
    <div className="flex flex-col h-full" style={{ background: '#0B0F23' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 flex-shrink-0"
           style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2">
          <img src="/xcloud-lisbot-logo.svg" alt="xCloud Lisbot" className="w-6 h-6 rounded-md flex-shrink-0" />
          <span className="text-[13px] font-semibold text-white">搜尋助手</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={startNewConv}
            title="新對話"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <RotateCcw size={11} strokeWidth={2} /> 新對話
          </button>
          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              className="w-6 h-6 flex items-center justify-center rounded text-slate-600 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
            >
              {expanded ? <Minimize2 size={12} strokeWidth={2} /> : <Maximize2 size={12} strokeWidth={2} />}
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              title="隱藏助手"
              className="w-6 h-6 flex items-center justify-center rounded text-slate-600 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
            >
              <X size={12} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-4 gap-4 flex-shrink-0"
           style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        {(['chat', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`py-2.5 text-[12px] border-b-2 transition-colors -mb-px ${
              tab === t
                ? 'border-[#00D4FF] text-[#00D4FF] font-medium'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {t === 'chat' ? '對話' : '歷史記錄'}
          </button>
        ))}
      </div>

      {/* Body */}
      {tab === 'history' ? (
        <HistoryList
          conversations={conversations}
          activeId={activeConvId}
          onSelect={id => { setActiveConvId(id); setTab('chat'); }}
          onDelete={deleteConv}
        />
      ) : (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-5 px-4 py-6">
                {/* Welcome */}
                <div className="text-center">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
                       style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.15)' }}>
                    <img src="/xcloud-lisbot-logo.svg" alt="xCloud Lisbot" className="w-8 h-8 rounded-lg" />
                  </div>
                  <p className="text-[14px] font-semibold text-white mb-1">
                    嗨，{user?.name?.split(' ')[0] || '您好'} 👋
                  </p>
                  <p className="text-[12px] text-slate-500 leading-relaxed">
                    我可以幫您查詢會議記錄、<br />整理行動事項、準備下一場會議。
                  </p>
                </div>

                {/* Quick questions */}
                <div className="w-full space-y-2">
                  {QUICK_QUESTIONS.map(q => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="w-full text-left px-3 py-2.5 rounded-xl text-[12px] text-slate-300 transition-colors"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map(msg => (
                  <Bubble
                    key={msg.id}
                    msg={msg}
                    onMeetingClick={handleMeetingClick}
                    isStreaming={msg.id === streamingMsgId}
                  />
                ))}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 px-3 pb-3 pt-2"
               style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="relative rounded-xl overflow-hidden"
                 style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input);
                  }
                }}
                placeholder="詢問任何關於您的會議..."
                rows={2}
                className="w-full bg-transparent text-[13px] text-slate-200 placeholder:text-slate-600 px-3 pt-3 pb-1 resize-none outline-none leading-relaxed"
              />
              <div className="flex items-center justify-between px-3 pb-2">
                {/* Language selector */}
                <div className="relative">
                  <button
                    onClick={() => setShowLang(o => !o)}
                    className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    🌐 {LANG_OPTIONS.find(l => l.value === language)?.label}
                    <ChevronDown size={10} strokeWidth={2} />
                  </button>
                  {showLang && (
                    <div className="absolute bottom-full mb-1 left-0 w-28 rounded-lg py-1 shadow-xl z-10"
                         style={{ background: '#1A2035', border: '1px solid rgba(255,255,255,0.1)' }}>
                      {LANG_OPTIONS.map(l => (
                        <button
                          key={l.value}
                          onClick={() => { setLanguage(l.value); setShowLang(false); }}
                          className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-white/[0.06] transition-colors ${
                            language === l.value ? 'text-[#00D4FF]' : 'text-slate-300'
                          }`}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Send button */}
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isLoading}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
                  style={{ background: input.trim() && !isLoading ? '#00D4FF' : 'rgba(0,212,255,0.2)' }}
                >
                  {isLoading
                    ? <div className="w-3 h-3 rounded-full border border-slate-500 animate-spin" style={{ borderTopColor: '#00D4FF' }} />
                    : <Send size={12} strokeWidth={2.5} style={{ color: input.trim() ? '#0A0E27' : '#00D4FF' }} />
                  }
                </button>
              </div>
            </div>
            <p className="text-[10px] text-slate-700 text-center mt-1.5">Enter 送出 · Shift+Enter 換行</p>
          </div>
        </>
      )}
    </div>
  );
};

export default CopilotPanel;
