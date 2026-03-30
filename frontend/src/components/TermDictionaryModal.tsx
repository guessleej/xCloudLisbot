import React, { useCallback, useEffect, useState } from 'react';
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
  }, [backendUrl, getToken]);

  useEffect(() => {
    if (isOpen) fetchDicts();
  }, [isOpen]);

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
    if (!confirm('確定刪除此辭典？')) return;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-xl">📚</span>
            <h2 className="text-lg font-bold text-gray-800">專業術語辭典</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Dict List */}
          <div className="w-52 border-r border-gray-100 flex flex-col">
            <div className="p-3 border-b border-gray-100">
              <button
                onClick={startCreate}
                className="w-full px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium"
              >
                + 新增辭典
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {loading ? (
                <div className="flex justify-center py-4">
                  <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                </div>
              ) : dicts.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">尚無辭典</p>
              ) : (
                dicts.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => startEdit(d)}
                    className={`px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                      selectedId === d.id ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${d.isActive ? 'text-gray-800' : 'text-gray-400'}`}>
                        {d.name}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleActive(d); }}
                        className={`w-5 h-5 rounded-full transition-colors flex-shrink-0 ${
                          d.isActive ? 'bg-green-400' : 'bg-gray-200'
                        }`}
                        title={d.isActive ? '停用' : '啟用'}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{d.terms.length} 個術語</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Edit Panel */}
          <div className="flex-1 flex flex-col min-w-0 p-4">
            {editing ? (
              <>
                <div className="space-y-3 mb-4">
                  <input
                    type="text"
                    placeholder="辭典名稱"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <input
                    type="text"
                    placeholder="說明（選填）"
                    value={editing.description || ''}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>

                {/* Terms Table */}
                <div className="flex-1 overflow-y-auto border border-gray-100 rounded-xl mb-3">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">原始詞</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">偏好詞</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">分類</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {editing.terms.map((t, i) => (
                        <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-700">{t.original}</td>
                          <td className="px-3 py-2 font-medium text-indigo-700">{t.preferred}</td>
                          <td className="px-3 py-2 text-gray-400 text-xs">{t.category}</td>
                          <td className="px-2">
                            <button onClick={() => removeTerm(i)} className="text-red-300 hover:text-red-500 text-xs">×</button>
                          </td>
                        </tr>
                      ))}
                      {/* Add row */}
                      <tr className="border-t border-gray-100 bg-indigo-50/30">
                        <td className="px-2 py-1.5">
                          <input
                            placeholder="原始詞"
                            value={newTerm.original}
                            onChange={(e) => setNewTerm({ ...newTerm, original: e.target.value })}
                            className="w-full px-2 py-1 text-xs border border-gray-200 rounded"
                            onKeyDown={(e) => e.key === 'Enter' && addTerm()}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            placeholder="偏好詞"
                            value={newTerm.preferred}
                            onChange={(e) => setNewTerm({ ...newTerm, preferred: e.target.value })}
                            className="w-full px-2 py-1 text-xs border border-gray-200 rounded"
                            onKeyDown={(e) => e.key === 'Enter' && addTerm()}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            placeholder="分類（選填）"
                            value={newTerm.category || ''}
                            onChange={(e) => setNewTerm({ ...newTerm, category: e.target.value })}
                            className="w-full px-2 py-1 text-xs border border-gray-200 rounded"
                            onKeyDown={(e) => e.key === 'Enter' && addTerm()}
                          />
                        </td>
                        <td className="px-2">
                          <button onClick={addTerm} className="text-indigo-500 hover:text-indigo-700 font-bold text-sm">+</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg cursor-pointer hover:border-indigo-300 text-gray-600">
                      <input type="file" accept=".csv" onChange={importCSV} className="hidden" />
                      📥 匯入 CSV
                    </label>
                    {editing.id && (
                      <button
                        onClick={() => deleteDict(editing.id!)}
                        className="px-3 py-1.5 text-xs border border-red-200 text-red-500 rounded-lg hover:bg-red-50"
                      >
                        刪除辭典
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditing(null); setIsCreating(false); setSelectedId(null); }}
                      className="px-4 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={!editing.name.trim()}
                      className="px-4 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40"
                    >
                      儲存
                    </button>
                  </div>
                </div>

                <p className="text-xs text-gray-400 mt-2">
                  CSV 格式：原始詞,偏好詞,分類（第一行為標題，將自動跳過）
                </p>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <div className="text-4xl mb-3">📖</div>
                  <p className="text-sm">選擇左側辭典進行編輯<br />或點擊「新增辭典」</p>
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
