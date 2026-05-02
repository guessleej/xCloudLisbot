import React, { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface Template {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  isBuiltin: boolean;
  systemPromptOverride: string | null;
}

interface Props {
  onClose: () => void;
  onSelect?: (templateId: string, templateName: string) => void;
  currentTemplateId?: string;
}

const API = process.env.REACT_APP_BACKEND_URL || '';

const SummaryTemplateModal: React.FC<Props> = ({ onClose, onSelect, currentTemplateId }) => {
  const { getToken } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<string>(currentTemplateId ?? 'standard');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newIcon, setNewIcon] = useState('✨');
  const [newPrompt, setNewPrompt] = useState('');
  const [error, setError] = useState('');

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.data ?? data);
      }
    } catch {
      setError('無法載入摘要範本');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const createTemplate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim() || null,
          icon: newIcon || '✨',
          system_prompt_override: newPrompt.trim() || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const item: Template = data.data ?? data;
        setTemplates(prev => [...prev, item]);
        setSelected(item.id);
        setShowCreate(false);
        setNewName(''); setNewDesc(''); setNewIcon('✨'); setNewPrompt('');
      }
    } catch {
      setError('建立範本失敗');
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const token = await getToken();
      await fetch(`${API}/api/templates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setTemplates(prev => prev.filter(t => t.id !== id));
      if (selected === id) setSelected('standard');
    } catch {
      setError('刪除失敗');
    }
  };

  const handleApply = () => {
    const tmpl = templates.find(t => t.id === selected);
    if (onSelect && tmpl) onSelect(tmpl.id, tmpl.name);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: '80vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-[15px] font-semibold text-slate-900">摘要範本</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-3 px-3 py-2 bg-red-50 text-red-600 text-[12px] rounded-lg flex-shrink-0">
            {error}
            <button className="ml-2 underline" onClick={() => setError('')}>關閉</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                {templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelected(t.id)}
                    className={`group relative text-left p-4 rounded-xl border transition-all ${
                      selected === t.id
                        ? 'border-[#00D4FF] bg-[#00D4FF]/[0.05]'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {selected === t.id && (
                      <div className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full flex items-center justify-center"
                           style={{ background: '#00D4FF' }}>
                        <Check size={9} strokeWidth={3} style={{ color: '#0A0E27' }} />
                      </div>
                    )}
                    {!t.isBuiltin && selected !== t.id && (
                      <button
                        onClick={e => deleteTemplate(t.id, e)}
                        className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all"
                      >
                        <Trash2 size={12} strokeWidth={1.75} />
                      </button>
                    )}
                    <span className="text-[18px] mb-1.5 block">{t.icon ?? '📝'}</span>
                    <p className="text-[12px] font-medium text-slate-900 leading-tight pr-5">{t.name}</p>
                    {t.description && (
                      <p className="text-[11px] text-slate-400 mt-1 leading-snug">{t.description}</p>
                    )}
                    {!t.isBuiltin && (
                      <span className="mt-1.5 inline-block text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">
                        自訂
                      </span>
                    )}
                  </button>
                ))}

                {/* Add custom template card */}
                <button
                  onClick={() => setShowCreate(true)}
                  className="text-left p-4 rounded-xl border border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-50 transition-colors flex flex-col items-center justify-center gap-1.5 min-h-[100px]"
                >
                  <Plus size={18} strokeWidth={1.75} className="text-slate-400" />
                  <p className="text-[12px] text-slate-500">建立自訂範本</p>
                </button>
              </div>

              {/* Create form */}
              {showCreate && (
                <div className="mt-4 p-4 border border-slate-200 rounded-xl space-y-3">
                  <p className="text-[13px] font-medium text-slate-800">新增自訂範本</p>
                  <div className="flex gap-2">
                    <input
                      value={newIcon}
                      onChange={e => setNewIcon(e.target.value)}
                      placeholder="圖示"
                      className="w-14 h-8 px-2 text-[14px] text-center border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                    />
                    <input
                      autoFocus
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="範本名稱*"
                      className="flex-1 h-8 px-3 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                    />
                  </div>
                  <input
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                    placeholder="描述（選填）"
                    className="w-full h-8 px-3 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                  />
                  <textarea
                    value={newPrompt}
                    onChange={e => setNewPrompt(e.target.value)}
                    placeholder="自訂 System Prompt（選填）"
                    rows={3}
                    className="w-full px-3 py-2 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowCreate(false)}
                      className="h-8 px-3 text-[12px] text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={createTemplate}
                      disabled={saving || !newName.trim()}
                      className="h-8 px-3 text-[12px] font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                      style={{ background: '#00D4FF', color: '#0A0E27' }}
                    >
                      {saving && <Loader2 size={12} className="animate-spin" />}
                      建立
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} className="h-8 px-4 text-[12px] text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            取消
          </button>
          <button
            onClick={handleApply}
            disabled={loading}
            className="h-8 px-4 text-[12px] font-semibold rounded-lg transition-colors disabled:opacity-50"
            style={{ background: '#00D4FF', color: '#0A0E27' }}
          >
            套用
          </button>
        </div>
      </div>
    </div>
  );
};

export default SummaryTemplateModal;
