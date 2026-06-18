import React, { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Modal from './ui/Modal';

interface TermSet {
  id: string;
  name: string;
  description: string | null;
  terms: string[];
  isActive: boolean;
}

interface Props {
  onClose: () => void;
}

const API = process.env.REACT_APP_BACKEND_URL || '';

const TermDictionaryModal: React.FC<Props> = ({ onClose }) => {
  const { getToken } = useAuth();
  const [sets, setSets] = useState<TermSet[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newTerm, setNewTerm] = useState('');
  const [newSetName, setNewSetName] = useState('');
  const [showNewSet, setShowNewSet] = useState(false);
  const [error, setError] = useState('');

  const selected = sets.find(s => s.id === selectedId) ?? null;

  const fetchSets = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/terminology`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const items: TermSet[] = data.data ?? data;
        setSets(items);
        if (items.length > 0 && !selectedId) setSelectedId(items[0].id);
      }
    } catch {
      setError('無法載入術語辭典');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken]);

  useEffect(() => { fetchSets(); }, [fetchSets]);

  const createSet = async () => {
    if (!newSetName.trim()) return;
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/terminology`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newSetName.trim(), terms: [] }),
      });
      if (res.ok) {
        const data = await res.json();
        const item: TermSet = data.data ?? data;
        setSets(prev => [item, ...prev]);
        setSelectedId(item.id);
        setNewSetName('');
        setShowNewSet(false);
      }
    } catch {
      setError('建立失敗');
    } finally {
      setSaving(false);
    }
  };

  const deleteSet = async (id: string) => {
    try {
      const token = await getToken();
      await fetch(`${API}/api/terminology/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setSets(prev => prev.filter(s => s.id !== id));
      if (selectedId === id) setSelectedId(sets.find(s => s.id !== id)?.id ?? null);
    } catch {
      setError('刪除失敗');
    }
  };

  const addTerm = async () => {
    if (!newTerm.trim() || !selected) return;
    const updatedTerms = [...selected.terms, newTerm.trim()];
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/terminology/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: selected.name, description: selected.description, terms: updatedTerms }),
      });
      if (res.ok) {
        setSets(prev => prev.map(s => s.id === selected.id ? { ...s, terms: updatedTerms } : s));
        setNewTerm('');
      }
    } catch {
      setError('新增失敗');
    } finally {
      setSaving(false);
    }
  };

  const removeTerm = async (term: string) => {
    if (!selected) return;
    const updatedTerms = selected.terms.filter(t => t !== term);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/terminology/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: selected.name, description: selected.description, terms: updatedTerms }),
      });
      if (res.ok) {
        setSets(prev => prev.map(s => s.id === selected.id ? { ...s, terms: updatedTerms } : s));
      }
    } catch {
      setError('移除失敗');
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="term-title" maxWidth="max-w-2xl" className="overflow-hidden flex flex-col" panelStyle={{ maxHeight: '80vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 id="term-title" className="text-[15px] font-semibold text-slate-900">術語辭典</h2>
          <button onClick={onClose} aria-label="關閉" className="text-slate-400 hover:text-slate-700 transition-colors">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-3 px-3 py-2 bg-red-50 text-red-600 text-[12px] rounded-lg flex-shrink-0">
            {error}
            <button className="ml-2 underline" onClick={() => setError('')}>關閉</button>
          </div>
        )}

        <div className="flex flex-1 min-h-0">
          {/* Left panel — set list */}
          <div className="w-44 border-r border-slate-100 flex flex-col flex-shrink-0">
            <div className="p-3 border-b border-slate-100">
              {showNewSet ? (
                <div className="flex gap-1">
                  <input
                    autoFocus
                    value={newSetName}
                    onChange={e => setNewSetName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') createSet(); if (e.key === 'Escape') setShowNewSet(false); }}
                    placeholder="名稱"
                    className="flex-1 h-7 px-2 text-[11px] border border-slate-200 rounded focus:outline-none focus:border-slate-400"
                  />
                  <button
                    onClick={createSet}
                    disabled={saving || !newSetName.trim()}
                    className="h-7 w-7 flex items-center justify-center rounded text-white disabled:opacity-50 flex-shrink-0"
                    style={{ background: '#00D4FF', color: '#0A0E27' }}
                  >
                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} strokeWidth={2.5} />}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewSet(true)}
                  className="w-full h-7 flex items-center justify-center gap-1.5 text-[11px] text-slate-600 border border-dashed border-slate-300 rounded hover:border-slate-400 hover:bg-slate-50 transition-colors"
                >
                  <Plus size={11} strokeWidth={2.5} />
                  新增辭典集
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-6">
                  <Loader2 size={16} className="animate-spin text-slate-400" />
                </div>
              ) : sets.length === 0 ? (
                <p className="text-[11px] text-slate-400 text-center py-6 px-3">尚未建立辭典集</p>
              ) : (
                sets.map(s => (
                  <div
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={`group flex items-center gap-1.5 px-3 py-2.5 cursor-pointer transition-colors ${
                      selectedId === s.id ? 'bg-cyan-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <ChevronRight
                      size={11}
                      strokeWidth={2}
                      className={`flex-shrink-0 transition-colors ${selectedId === s.id ? 'text-cyan-500' : 'text-slate-300'}`}
                    />
                    <span className={`flex-1 text-[12px] truncate ${selectedId === s.id ? 'text-cyan-700 font-medium' : 'text-slate-700'}`}>
                      {s.name}
                    </span>
                    <span className="text-[10px] text-slate-400 flex-shrink-0">{s.terms.length}</span>
                    <button
                      onClick={e => { e.stopPropagation(); deleteSet(s.id); }}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all flex-shrink-0"
                    >
                      <Trash2 size={11} strokeWidth={1.75} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right panel — terms */}
          <div className="flex-1 flex flex-col min-w-0">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[12px] text-slate-400">請選擇或建立辭典集</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
                  <p className="text-[13px] font-medium text-slate-800">{selected.name}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    術語注入 Azure Speech 識別引擎，提升專業詞彙識別準確度
                  </p>
                </div>

                {/* Add term input */}
                <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
                  <div className="flex gap-2">
                    <input
                      value={newTerm}
                      onChange={e => setNewTerm(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addTerm(); }}
                      placeholder="輸入術語後按 Enter 或點擊新增"
                      className="flex-1 h-8 px-3 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                    />
                    <button
                      onClick={addTerm}
                      disabled={saving || !newTerm.trim()}
                      className="h-8 px-3 flex items-center gap-1.5 rounded-lg text-[12px] font-medium disabled:opacity-50 transition-colors flex-shrink-0"
                      style={{ background: '#00D4FF', color: '#0A0E27' }}
                    >
                      {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} strokeWidth={2.5} />}
                      新增
                    </button>
                  </div>
                </div>

                {/* Terms list */}
                <div className="flex-1 overflow-y-auto px-4 py-3">
                  {selected.terms.length === 0 ? (
                    <p className="text-[12px] text-slate-400 text-center py-6">尚未新增術語</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {selected.terms.map((term, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 rounded-full text-[12px] text-slate-700"
                        >
                          {term}
                          <button
                            onClick={() => removeTerm(term)}
                            className="text-slate-400 hover:text-red-500 transition-colors ml-0.5"
                          >
                            <X size={10} strokeWidth={2.5} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="h-8 px-4 text-[12px] font-semibold rounded-lg transition-colors"
            style={{ background: '#00D4FF', color: '#0A0E27' }}
          >
            完成
          </button>
        </div>
    </Modal>
  );
};

export default TermDictionaryModal;
