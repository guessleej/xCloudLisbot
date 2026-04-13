import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, X, Plus, Upload } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { TermDictionary, TermEntry } from '../types';

interface TermDictionaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDictsChange: (dicts: TermDictionary[]) => void;
}

const emptyDict = (): TermDictionary => ({
  name: '', description: '', terms: [], isActive: true,
});

const TermDictionaryModal: React.FC<TermDictionaryModalProps> = ({ isOpen, onClose, onDictsChange }) => {
  const { getToken } = useAuth();
  const [dicts, setDicts] = useState<TermDictionary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TermDictionary | null>(null);
  const [loading, setLoading] = useState(false);
  const [newTerm, setNewTerm] = useState<TermEntry>({ original: '', preferred: '', category: '' });
  const [isCreating, setIsCreating] = useState(false);

  const backendUrl = process.env.REACT_APP_BACKEND_URL!;

  const fetchDicts = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${backendUrl}/api/terminology`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDicts(data.dicts || []);
        onDictsChange(data.dicts || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, getToken]);

  useEffect(() => {
    if (isOpen) fetchDicts();
  }, [isOpen, fetchDicts]);

  const saveDict = async (d: TermDictionary) => {
    const token = await getToken();
    const url = d.id ? `${backendUrl}/api/terminology/${d.id}` : `${backendUrl}/api/terminology`;
    const method = d.id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(d),
    });
    if (res.ok) await fetchDicts();
  };

  const deleteDict = async (id: string) => {
    if (!window.confirm('確定刪除此辭典？')) return;
    const token = await getToken();
    await fetch(`${backendUrl}/api/terminology/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setSelectedId(null);
    setEditing(null);
    await fetchDicts();
  };

  const toggleActive = async (d: TermDictionary) => {
    await saveDict({ ...d, isActive: !d.isActive });
  };

  const startEdit = (d: TermDictionary) => {
    setSelectedId(d.id!);
    setEditing({ ...d, terms: [...d.terms] });
    setIsCreating(false);
  };

  const startCreate = () => {
    setSelectedId(null);
    setEditing(emptyDict());
    setIsCreating(true);
  };

  const addTerm = () => {
    if (!editing || !newTerm.original.trim() || !newTerm.preferred.trim()) return;
    setEditing({ ...editing, terms: [...editing.terms, { ...newTerm }] });
    setNewTerm({ original: '', preferred: '', category: '' });
  };

  const removeTerm = (idx: number) => {
    if (!editing) return;
    setEditing({ ...editing, terms: editing.terms.filter((_, i) => i !== idx) });
  };

  const handleSave = async () => {
    if (!editing) return;
    await saveDict(editing);
    setEditing(null);
    setIsCreating(false);
    setSelectedId(null);
  };

  const importCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = (ev.target?.result as string).split('\n').slice(1); // skip header
      const terms = lines
        .map((l) => {
          const [original, preferred, category] = l.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
          return original && preferred ? { original, preferred, category: category || '' } : null;
        })
        .filter(Boolean) as TermEntry[];
      setEditing({ ...editing, terms: [...editing.terms, ...terms] });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-stone-900/40 fade-in">
      <div className="bg-white rounded-t-lg sm:rounded-lg border border-stone-200 w-full sm:max-w-3xl h-[90dvh] sm:h-auto sm:max-h-[85vh] flex flex-col modal-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <BookOpen size={16} strokeWidth={1.75} className="text-stone-500" />
            <h2 className="text-base font-semibold text-stone-900">專業術語辭典</h2>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-900 transition-colors min-h-0 min-w-0">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row flex-1 min-h-0">
          {/* Dict List */}
          <div className="w-full sm:w-52 border-b sm:border-b-0 sm:border-r border-stone-200 flex flex-col max-h-[30vh] sm:max-h-none">
            <div className="p-3 border-b border-stone-200">
              <button
                onClick={startCreate}
                className="w-full h-9 px-3 text-sm bg-stone-900 text-white rounded-md hover:bg-stone-800 transition-colors font-medium inline-flex items-center justify-center gap-1.5 min-h-0 min-w-0"
              >
                <Plus size={14} strokeWidth={2} />
                新增辭典
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {loading ? (
                <div className="flex justify-center py-4">
                  <div className="w-5 h-5 border-2 border-stone-200 border-t-stone-700 rounded-full animate-spin" />
                </div>
              ) : dicts.length === 0 ? (
                <p className="text-xs text-stone-400 text-center py-4">尚無辭典</p>
              ) : (
                dicts.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => startEdit(d)}
                    className={`px-3 py-2 rounded-md cursor-pointer transition-colors ${
                      selectedId === d.id ? 'bg-stone-100' : 'hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-medium truncate ${d.isActive ? 'text-stone-900' : 'text-stone-400'}`}>
                        {d.name}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleActive(d); }}
                        className={`w-4 h-4 rounded-full transition-colors flex-shrink-0 min-h-0 min-w-0 ${
                          d.isActive ? 'bg-teal-600' : 'bg-stone-300'
                        }`}
                        title={d.isActive ? '停用' : '啟用'}
                      />
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5">{d.terms.length} 個術語</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Edit Panel */}
          <div className="flex-1 flex flex-col min-w-0 p-5">
            {editing ? (
              <>
                <div className="space-y-2 mb-4">
                  <input
                    type="text"
                    placeholder="辭典名稱"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="w-full h-9 px-3 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-stone-500 transition-colors"
                  />
                  <input
                    type="text"
                    placeholder="說明（選填）"
                    value={editing.description || ''}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    className="w-full h-9 px-3 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-stone-500 transition-colors"
                  />
                </div>

                {/* Terms Table */}
                <div className="flex-1 overflow-y-auto border border-stone-200 rounded-md mb-3">
                  <table className="w-full text-sm">
                    <thead className="bg-stone-50 sticky top-0 border-b border-stone-200">
                      <tr>
                        <th className="text-left px-3 py-2 text-[10px] font-semibold text-stone-500 uppercase tracking-wide">原始詞</th>
                        <th className="text-left px-3 py-2 text-[10px] font-semibold text-stone-500 uppercase tracking-wide">偏好詞</th>
                        <th className="text-left px-3 py-2 text-[10px] font-semibold text-stone-500 uppercase tracking-wide">分類</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {editing.terms.map((t, i) => (
                        <tr key={i} className="border-t border-stone-100 hover:bg-stone-50">
                          <td className="px-3 py-2 text-stone-700">{t.original}</td>
                          <td className="px-3 py-2 font-medium text-stone-900">{t.preferred}</td>
                          <td className="px-3 py-2 text-stone-500 text-xs">{t.category}</td>
                          <td className="px-2">
                            <button onClick={() => removeTerm(i)} className="text-stone-400 hover:text-red-700 transition-colors min-h-0 min-w-0" title="移除">
                              <X size={12} strokeWidth={1.75} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {/* Add row */}
                      <tr className="border-t border-stone-200 bg-stone-50">
                        <td className="px-2 py-1.5">
                          <input
                            placeholder="原始詞"
                            value={newTerm.original}
                            onChange={(e) => setNewTerm({ ...newTerm, original: e.target.value })}
                            className="w-full h-7 px-2 text-xs bg-white border border-stone-200 rounded focus:outline-none focus:border-stone-400"
                            onKeyDown={(e) => e.key === 'Enter' && addTerm()}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            placeholder="偏好詞"
                            value={newTerm.preferred}
                            onChange={(e) => setNewTerm({ ...newTerm, preferred: e.target.value })}
                            className="w-full h-7 px-2 text-xs bg-white border border-stone-200 rounded focus:outline-none focus:border-stone-400"
                            onKeyDown={(e) => e.key === 'Enter' && addTerm()}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            placeholder="分類（選填）"
                            value={newTerm.category || ''}
                            onChange={(e) => setNewTerm({ ...newTerm, category: e.target.value })}
                            className="w-full h-7 px-2 text-xs bg-white border border-stone-200 rounded focus:outline-none focus:border-stone-400"
                            onKeyDown={(e) => e.key === 'Enter' && addTerm()}
                          />
                        </td>
                        <td className="px-2">
                          <button onClick={addTerm} className="text-stone-900 font-bold min-h-0 min-w-0" title="新增">
                            <Plus size={14} strokeWidth={2} />
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <label className="inline-flex items-center gap-1.5 h-8 px-3 text-xs border border-stone-300 rounded-md cursor-pointer hover:bg-stone-50 text-stone-700 transition-colors min-h-0 min-w-0">
                      <input type="file" accept=".csv" onChange={importCSV} className="hidden" />
                      <Upload size={12} strokeWidth={1.75} />
                      匯入 CSV
                    </label>
                    {editing.id && (
                      <button
                        onClick={() => deleteDict(editing.id!)}
                        className="h-8 px-3 text-xs border border-red-200 text-red-700 rounded-md hover:bg-red-50 transition-colors min-h-0 min-w-0"
                      >
                        刪除辭典
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditing(null); setIsCreating(false); setSelectedId(null); }}
                      className="h-8 px-4 text-xs border border-stone-300 rounded-md text-stone-700 hover:bg-stone-50 transition-colors min-h-0 min-w-0"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={!editing.name.trim()}
                      className="h-8 px-4 text-xs bg-stone-900 text-white rounded-md hover:bg-stone-800 disabled:bg-stone-300 transition-colors min-h-0 min-w-0"
                    >
                      儲存
                    </button>
                  </div>
                </div>

                <p className="text-xs text-stone-500 mt-2">
                  CSV 格式：原始詞,偏好詞,分類（第一行為標題，將自動跳過）
                </p>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-stone-400">
                <div className="text-center">
                  <BookOpen size={28} strokeWidth={1.5} className="mx-auto mb-3" />
                  <p className="text-sm text-stone-500">選擇左側辭典進行編輯<br />或點擊「新增辭典」</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermDictionaryModal;
