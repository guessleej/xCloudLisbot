import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { SummaryTemplate, BUILTIN_TEMPLATES } from '../types';

interface TemplateSection {
  icon: string;
  title: string;
  desc: string;
}

interface TemplateDetail {
  sections: TemplateSection[];
  useCase: string;
}

const BUILTIN_TEMPLATE_DETAILS: Record<string, TemplateDetail> = {
  standard: {
    sections: [
      { icon: '📄', title: '會議摘要', desc: '整體討論重點與脈絡' },
      { icon: '⚖️', title: '關鍵決策', desc: '會議中做出的決定' },
      { icon: '✅', title: '待辦事項', desc: '含負責人、優先級、截止日期' },
      { icon: '📌', title: '下次議題', desc: '尚未解決或需追蹤的項目' },
    ],
    useCase: '通用型範本，適合大部分企業會議、部門會議、專案會議。預設選項。',
  },
  action_focused: {
    sections: [
      { icon: '✅', title: '行動項目', desc: '所有待辦事項（詳細到負責人與截止日）' },
      { icon: '🏷️', title: '優先級標記', desc: '高/中/低 三級分類' },
      { icon: '👤', title: '負責人追蹤', desc: '清楚列出每項任務的執行者' },
    ],
    useCase: '執行導向的會議，重點在「誰要做什麼」，適合站立會議、衝刺規劃、專案執行。',
  },
  decision_log: {
    sections: [
      { icon: '⚖️', title: '決策清單', desc: '所有做出的決定' },
      { icon: '💭', title: '決策背景', desc: '為什麼做這個決定' },
      { icon: '🎯', title: '影響範圍', desc: '這個決策會影響誰/什麼' },
    ],
    useCase: '需要保留決策脈絡的會議，如董事會、產品規劃、架構決策會議（ADR）。',
  },
  brainstorm: {
    sections: [
      { icon: '💡', title: '想法分類', desc: '依主題把所有創意分組' },
      { icon: '🔖', title: '重複主題', desc: '多人提及的共通方向' },
      { icon: '⭐', title: '值得深入', desc: '高潛力的想法標記' },
    ],
    useCase: '創意討論、產品 idea 發想、設計 workshop，保留所有想法不漏接。',
  },
  interview: {
    sections: [
      { icon: '❓', title: 'Q&A 格式', desc: '問題與回答配對整理' },
      { icon: '💬', title: '核心觀點', desc: '受訪者的關鍵看法' },
      { icon: '🔍', title: '值得關注', desc: '意料外的發現或亮點' },
    ],
    useCase: '記者採訪、人資面試、使用者訪談、客戶調研。',
  },
  lecture: {
    sections: [
      { icon: '📘', title: '學習重點', desc: '課程核心概念' },
      { icon: '🔑', title: '關鍵名詞', desc: '重要術語解釋' },
      { icon: '📝', title: '例子與問答', desc: '老師舉例與學生問答' },
    ],
    useCase: '課堂筆記、線上課程、研討會演講、技術分享。',
  },
  client: {
    sections: [
      { icon: '📋', title: '客戶需求', desc: '客戶明確表達的需求' },
      { icon: '🤝', title: '已達共識', desc: '雙方同意的事項' },
      { icon: '📅', title: '後續跟進', desc: '需要追蹤的事項與時程' },
    ],
    useCase: '對外客戶會議、業務拜訪、專案啟動會議，可作為正式會議記錄給客戶。',
  },
};

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, getToken]);

  useEffect(() => {
    if (isOpen) fetchCustom();
  }, [isOpen, fetchCustom]);

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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 fade-in">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl h-[90dvh] sm:h-auto sm:max-h-[85vh] flex flex-col modal-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-xl">📋</span>
            <h2 className="text-lg font-bold text-gray-800">摘要範本管理</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="flex flex-col sm:flex-row flex-1 min-h-0 overflow-hidden">
          {/* Template List */}
          <div className="w-full sm:w-56 border-b sm:border-b-0 sm:border-r border-gray-100 flex flex-col max-h-[30vh] sm:max-h-none">
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

                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-gray-700 mb-2">產出內容</h4>
                  <div className="space-y-2">
                    {BUILTIN_TEMPLATE_DETAILS[preview.id]?.sections.map((section) => (
                      <div key={section.title} className="flex gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <span className="text-lg flex-shrink-0">{section.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{section.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{section.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-gray-700 mb-2">適用場景</h4>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {BUILTIN_TEMPLATE_DETAILS[preview.id]?.useCase}
                  </p>
                </div>

                <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100 text-xs text-indigo-700">
                  <p>💡 此為系統內建範本，經過優化不可修改。若需客製化，請新增自訂範本並覆寫提示詞。</p>
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
