import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { SummaryTemplate, BUILTIN_TEMPLATES } from '../types';

interface SummaryTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTemplatesChange: (custom: SummaryTemplate[]) => void;
}

const SummaryTemplateModal: React.FC<SummaryTemplateModalProps> = ({
  isOpen, onClose, onTemplatesChange,
}) => {
  const { getToken } = useAuth();
  const [customTemplates, setCustomTemplates] = useState<SummaryTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<SummaryTemplate> | null>(null);
  const [preview, setPreview] = useState<SummaryTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const backendUrl = process.env.REACT_APP_BACKEND_URL!;

  const fetchCustom = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${backendUrl}/api/templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const custom = data.templates || [];
        setCustomTemplates(custom);
        onTemplatesChange(custom);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [backendUrl, getToken]);

  useEffect(() => {
    if (isOpen) fetchCustom();
  }, [isOpen]);

  const saveTemplate = async () => {
    if (!editing?.name?.trim()) return;
    const token = await getToken();
    const url = editing.id ? `${backendUrl}/api/templates/${editing.id}` : `${backendUrl}/api/templates`;
    const method = editing.id ? 'PUT' : 'POST';
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...editing, isBuiltIn: false }),
    });
    setEditing(null);
    setSelectedId(null);
    await fetchCustom();
  };

  const deleteTemplate = async (id: string) => {
    if (!window.confirm('確定刪除此範本？')) return;
    const token = await getToken();
    await fetch(`${backendUrl}/api/templates/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setEditing(null);
    setSelectedId(null);
    await fetchCustom();
  };

  const ICON_OPTIONS = ['📋', '✅', '⚖️', '💡', '🎙️', '📚', '🤝', '🔍', '🏢', '📊', '🚀', '💼'];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-xl">📋</span>
            <h2 className="text-lg font-bold text-gray-800">摘要範本管理</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Template List */}
          <div className="w-56 border-r border-gray-100 flex flex-col">
            <div className="p-3 border-b border-gray-100">
              <button
                onClick={() => {
                  setSelectedId(null);
                  setPreview(null);
                  setEditing({ name: '', description: '', icon: '📋', systemPromptOverride: '', isBuiltIn: false });
                }}
                className="w-full px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
              >
                + 新增自訂範本
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              <p className="text-xs font-semibold text-gray-400 px-2 py-1">內建範本</p>
              {BUILTIN_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setPreview(t); setEditing(null); setSelectedId(t.id); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                    selectedId === t.id ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className="mr-1.5">{t.icon}</span>{t.name}
                  <span className="ml-1 text-xs text-gray-400">（唯讀）</span>
                </button>
              ))}

              {loading ? null : customTemplates.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 px-2 py-1 mt-1">自訂範本</p>
                  {customTemplates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setSelectedId(t.id!); setEditing({ ...t }); setPreview(null); }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                        selectedId === t.id ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span className="mr-1.5">{t.icon}</span>{t.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Right Panel */}
          <div className="flex-1 p-5 overflow-y-auto">
            {/* Built-in preview */}
            {preview && !editing && (
              <div>
                <div className="text-4xl mb-3">{preview.icon}</div>
                <h3 className="text-lg font-bold text-gray-800 mb-1">{preview.name}</h3>
                <p className="text-sm text-gray-500 mb-4">{preview.description}</p>
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-500">
                  <p className="font-semibold mb-2">此為內建範本（唯讀）</p>
                  <p>內建範本由系統優化，不可修改。您可以新增自訂範本並覆寫提示詞。</p>
                </div>
              </div>
            )}

            {/* Edit / Create */}
            {editing && (
              <div className="space-y-4">
                {/* Icon picker */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2">圖示</label>
                  <div className="flex flex-wrap gap-2">
                    {ICON_OPTIONS.map((icon) => (
                      <button
                        key={icon}
                        onClick={() => setEditing({ ...editing, icon })}
                        className={`w-9 h-9 text-xl rounded-lg border transition-all ${
                          editing.icon === icon
                            ? 'border-indigo-400 bg-indigo-50'
                            : 'border-gray-200 hover:border-indigo-200'
                        }`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">範本名稱</label>
                  <input
                    value={editing.name || ''}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="例如：技術評審記錄"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">說明</label>
                  <input
                    value={editing.description || ''}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    placeholder="簡短描述此範本的用途"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    自訂 GPT 系統提示詞
                    <span className="font-normal text-gray-400 ml-1">（留空則使用對應模式的預設提示）</span>
                  </label>
                  <textarea
                    value={editing.systemPromptOverride || ''}
                    onChange={(e) => setEditing({ ...editing, systemPromptOverride: e.target.value })}
                    placeholder={`範例：\n你是一位專業的技術架構師，請分析此次技術評審會議的逐字稿，用繁體中文輸出：\n1. 技術議題摘要\n2. 架構決策\n3. 風險項目\n4. 技術債務\n5. 下一步行動項目`}
                    rows={8}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono text-xs resize-none"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div>
                    {editing.id && (
                      <button
                        onClick={() => deleteTemplate(editing.id!)}
                        className="px-4 py-2 text-sm border border-red-200 text-red-500 rounded-lg hover:bg-red-50"
                      >
                        刪除範本
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditing(null); setSelectedId(null); }}
                      className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
                    >
                      取消
                    </button>
                    <button
                      onClick={saveTemplate}
                      disabled={!editing.name?.trim()}
                      className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40"
                    >
                      儲存範本
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!preview && !editing && (
              <div className="flex flex-1 items-center justify-center text-gray-400 h-full">
                <div className="text-center">
                  <div className="text-4xl mb-3">📋</div>
                  <p className="text-sm">選擇範本預覽<br />或建立自訂範本</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SummaryTemplateModal;
