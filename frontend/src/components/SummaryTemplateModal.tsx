import React, { useCallback, useEffect, useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Badge, Button, IconButton, Input, Spinner, Textarea } from './ui';
import Modal from './ui/Modal';

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
    <Modal onClose={onClose} labelledBy="tmpl-title" maxWidth="max-w-xl" className="overflow-hidden flex flex-col" panelStyle={{ maxHeight: '80vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 flex-shrink-0">
          <h2 id="tmpl-title" className="text-base font-semibold text-stone-900">摘要範本</h2>
          <IconButton aria-label="關閉" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </IconButton>
        </div>

        {error && (
          <div className="mx-5 mt-3 px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg flex-shrink-0">
            {error}
            <button className="ml-2 underline" onClick={() => setError('')}>關閉</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner size={20} />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                {templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelected(t.id)}
                    className={`group relative text-left p-4 rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40 ${
                      selected === t.id
                        ? 'border-teal-600 bg-teal-50'
                        : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                    }`}
                  >
                    {selected === t.id && (
                      <div className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full flex items-center justify-center bg-teal-700">
                        <Check size={9} strokeWidth={1.75} className="text-white" />
                      </div>
                    )}
                    {!t.isBuiltin && selected !== t.id && (
                      <button
                        onClick={e => deleteTemplate(t.id, e)}
                        aria-label={`刪除範本 ${t.name}`}
                        className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 text-stone-400 hover:text-red-600 transition-all"
                      >
                        <Trash2 size={12} strokeWidth={1.75} />
                      </button>
                    )}
                    <span className="text-lg mb-1.5 block">{t.icon ?? '📝'}</span>
                    <p className="text-xs font-medium text-stone-900 leading-tight pr-5">{t.name}</p>
                    {t.description && (
                      <p className="text-xs text-stone-400 mt-1 leading-snug">{t.description}</p>
                    )}
                    {!t.isBuiltin && (
                      <Badge tone="accent" className="mt-1.5">自訂</Badge>
                    )}
                  </button>
                ))}

                {/* Add custom template card */}
                <button
                  onClick={() => setShowCreate(true)}
                  className="text-left p-4 rounded-xl border border-dashed border-stone-300 hover:border-stone-400 hover:bg-stone-50 transition-colors flex flex-col items-center justify-center gap-1.5 min-h-[100px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40"
                >
                  <Plus size={18} strokeWidth={1.75} className="text-stone-400" />
                  <p className="text-xs text-stone-500">建立自訂範本</p>
                </button>
              </div>

              {/* Create form */}
              {showCreate && (
                <div className="mt-4 p-4 border border-stone-200 rounded-xl space-y-3">
                  <p className="text-sm font-medium text-stone-800">新增自訂範本</p>
                  <div className="flex gap-2">
                    <Input
                      value={newIcon}
                      onChange={e => setNewIcon(e.target.value)}
                      placeholder="圖示"
                      aria-label="圖示"
                      className="w-14 text-center"
                    />
                    <Input
                      autoFocus
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="範本名稱*"
                      aria-label="範本名稱"
                      className="flex-1"
                    />
                  </div>
                  <Input
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                    placeholder="描述（選填）"
                    aria-label="描述"
                  />
                  <Textarea
                    value={newPrompt}
                    onChange={e => setNewPrompt(e.target.value)}
                    placeholder="自訂 System Prompt（選填）"
                    aria-label="自訂 System Prompt"
                    rows={3}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setShowCreate(false)}>
                      取消
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={createTemplate}
                      loading={saving}
                      disabled={!newName.trim()}
                    >
                      建立
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-stone-200 flex justify-end gap-2 flex-shrink-0">
          <Button variant="secondary" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" size="sm" onClick={handleApply} disabled={loading}>
            套用
          </Button>
        </div>
    </Modal>
  );
};

export default SummaryTemplateModal;
