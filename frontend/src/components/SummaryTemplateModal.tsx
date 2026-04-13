import React, { useCallback, useEffect, useState } from 'react';
import { LayoutTemplate, X, Plus, Copy, Check } from 'lucide-react';
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
  prompt: string;
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
    prompt: `你是專業的商業會議記錄專家。請分析以下會議逐字稿，產出結構化的繁體中文會議記錄，採用 Markdown 格式：

## 會議摘要
整體討論重點、背景脈絡、主要議題。

## 關鍵決策
列出會議中做出的所有決定，每項決定包含背景說明。

## 待辦事項
列出所有行動項目，包含：
- 任務內容
- 負責人
- 優先級（高/中/低）
- 截止日期（若有提及）

## 下次議題
尚未解決、需要追蹤或留到下次會議的項目。

請保持專業商業語調，重點明確。`,
  },
  action_focused: {
    sections: [
      { icon: '✅', title: '行動項目', desc: '所有待辦事項（詳細到負責人與截止日）' },
      { icon: '🏷️', title: '優先級標記', desc: '高/中/低 三級分類' },
      { icon: '👤', title: '負責人追蹤', desc: '清楚列出每項任務的執行者' },
    ],
    useCase: '執行導向的會議，重點在「誰要做什麼」，適合站立會議、衝刺規劃、專案執行。',
    prompt: `你是專業的執行型會議記錄專家。請從以下會議逐字稿中提取所有行動項目，產出繁體中文 Markdown 報告：

## 行動項目清單
為每項任務列出：
- **任務內容**：清楚描述要做什麼
- **負責人**：誰執行
- **優先級**：高 / 中 / 低
- **截止日期**：若會議中有提及
- **相依性**：是否需要其他人先完成某事

## 重點提醒
列出本週需優先處理的任務。

## 阻礙與風險
列出會議中提到會影響執行的問題。

請聚焦於「可執行的行動」，忽略純粹的討論內容。`,
  },
  decision_log: {
    sections: [
      { icon: '⚖️', title: '決策清單', desc: '所有做出的決定' },
      { icon: '💭', title: '決策背景', desc: '為什麼做這個決定' },
      { icon: '🎯', title: '影響範圍', desc: '這個決策會影響誰/什麼' },
    ],
    useCase: '需要保留決策脈絡的會議，如董事會、產品規劃、架構決策會議（ADR）。',
    prompt: `你是決策紀錄專家。請分析以下會議逐字稿，聚焦於所有決策內容，產出繁體中文 Markdown 決策紀錄：

## 決策清單
每項決策包含：
- **決策內容**：具體決定了什麼
- **決策背景**：為什麼做這個決定、討論了哪些選項
- **影響範圍**：這個決策會影響誰/哪些系統/哪些流程
- **決策者**：誰拍板或達成共識
- **預計生效時間**：什麼時候開始執行

## 待決事項
列出討論過但尚未做決定的項目。

## 決策依據
整理會議中引用的資料、先例或限制條件。

請保留決策脈絡，不只是結論。`,
  },
  brainstorm: {
    sections: [
      { icon: '💡', title: '想法分類', desc: '依主題把所有創意分組' },
      { icon: '🔖', title: '重複主題', desc: '多人提及的共通方向' },
      { icon: '⭐', title: '值得深入', desc: '高潛力的想法標記' },
    ],
    useCase: '創意討論、產品 idea 發想、設計 workshop，保留所有想法不漏接。',
    prompt: `你是創意工作坊記錄專家。請從以下腦力激盪會議的逐字稿中，整理所有想法，產出繁體中文 Markdown 報告：

## 想法分類
依主題把所有創意分組，每個想法包含：
- 想法描述
- 提議者（若能辨識）
- 相關討論

## 重複主題
列出多人提及的共通方向或關鍵字。

## 值得深入
標記出具有高潛力、需要後續探索的想法，說明原因。

## 未採納的想法
列出會議中被否決或擱置的想法（也要保留，可能未來有用）。

請盡量保留所有想法，不要過濾。發散階段重質也重量。`,
  },
  interview: {
    sections: [
      { icon: '❓', title: 'Q&A 格式', desc: '問題與回答配對整理' },
      { icon: '💬', title: '核心觀點', desc: '受訪者的關鍵看法' },
      { icon: '🔍', title: '值得關注', desc: '意料外的發現或亮點' },
    ],
    useCase: '記者採訪、人資面試、使用者訪談、客戶調研。',
    prompt: `你是訪談記錄專家。請從以下訪談逐字稿中整理內容，產出繁體中文 Markdown 訪談摘要：

## Q&A 重點
用問答配對格式整理核心對話：
- **Q**: 訪談者的問題
- **A**: 受訪者的回答重點

## 核心觀點
受訪者表達的關鍵看法、立場、主張（3-5 個重點）。

## 值得關注
意料外的發現、亮點、或令人印象深刻的回應。

## 背景資訊
受訪者提及的相關背景、經歷、案例。

## 追蹤問題
根據此次訪談，建議後續可深入追問的問題。

請保留受訪者的語氣和表達方式，不要過度改寫。`,
  },
  lecture: {
    sections: [
      { icon: '📘', title: '學習重點', desc: '課程核心概念' },
      { icon: '🔑', title: '關鍵名詞', desc: '重要術語解釋' },
      { icon: '📝', title: '例子與問答', desc: '老師舉例與學生問答' },
    ],
    useCase: '課堂筆記、線上課程、研討會演講、技術分享。',
    prompt: `你是學習筆記整理專家。請從以下課程/演講逐字稿中整理內容，產出繁體中文 Markdown 學習筆記：

## 學習重點
課程的核心概念、理論、主要論點。

## 關鍵名詞
重要術語及其解釋，適合後續複習。

## 例子與應用
老師舉的例子、實作案例、應用情境。

## 學生問答
課堂上的問答內容，整理為「問題 → 老師回答」。

## 延伸學習
老師提及的推薦資源、參考書目、相關主題。

## 我的反思
根據內容，列出 2-3 個值得思考或實踐的方向。

請以學習者視角整理，方便日後複習。`,
  },
  client: {
    sections: [
      { icon: '📋', title: '客戶需求', desc: '客戶明確表達的需求' },
      { icon: '🤝', title: '已達共識', desc: '雙方同意的事項' },
      { icon: '📅', title: '後續跟進', desc: '需要追蹤的事項與時程' },
    ],
    useCase: '對外客戶會議、業務拜訪、專案啟動會議，可作為正式會議記錄給客戶。',
    prompt: `你是客戶會議記錄專家。請從以下客戶會議的逐字稿中整理內容，產出繁體中文 Markdown 會議記錄（可直接寄給客戶）：

## 會議概要
會議日期、參與者、討論主題（開場白）。

## 客戶需求
客戶明確表達的需求，包含：
- 功能需求
- 時程期望
- 預算範圍
- 特殊要求

## 已達共識
雙方同意的事項，清楚列出。

## 待確認事項
尚未決定或需要客戶進一步確認的項目。

## 後續跟進
- **我方待辦**：我方承諾的交付物與時程
- **客戶待辦**：需要客戶提供的資料或回覆
- **下次會議**：若有約定下次會議時間

## 風險與關注
會議中提到可能影響專案的風險或需要特別關注的事項。

語氣保持專業、簡潔、正式，適合作為對外文件。`,
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
  const [copyDone, setCopyDone] = useState(false);
  const [showFullPrompt, setShowFullPrompt] = useState(false);
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

  const copyPrompt = async (prompt: string) => {
    await navigator.clipboard.writeText(prompt);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2000);
  };

  const duplicateAsCustom = (template: SummaryTemplate) => {
    const detail = BUILTIN_TEMPLATE_DETAILS[template.id];
    if (!detail) return;
    setPreview(null);
    setSelectedId(null);
    setEditing({
      name: `${template.name}（自訂）`,
      description: template.description,
      icon: template.icon,
      systemPromptOverride: detail.prompt,
      isBuiltIn: false,
    });
  };

  const ICON_OPTIONS = ['📋', '✅', '⚖️', '💡', '🎙️', '📚', '🤝', '🔍', '🏢', '📊', '🚀', '💼'];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-stone-900/40 fade-in">
      <div className="bg-white rounded-t-lg sm:rounded-lg border border-stone-200 w-full sm:max-w-2xl h-[90dvh] sm:h-auto sm:max-h-[85vh] flex flex-col modal-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <LayoutTemplate size={16} strokeWidth={1.75} className="text-stone-500" />
            <h2 className="text-base font-semibold text-stone-900">摘要範本管理</h2>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-900 transition-colors min-h-0 min-w-0">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row flex-1 min-h-0 overflow-hidden">
          {/* Template List */}
          <div className="w-full sm:w-56 border-b sm:border-b-0 sm:border-r border-stone-200 flex flex-col max-h-[30vh] sm:max-h-none">
            <div className="p-3 border-b border-stone-200">
              <button
                onClick={() => {
                  setSelectedId(null);
                  setPreview(null);
                  setEditing({ name: '', description: '', icon: '📋', systemPromptOverride: '', isBuiltIn: false });
                }}
                className="w-full h-9 px-3 text-sm bg-stone-900 text-white rounded-md hover:bg-stone-800 font-medium inline-flex items-center justify-center gap-1.5 min-h-0 min-w-0"
              >
                <Plus size={14} strokeWidth={2} />
                新增自訂範本
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              <p className="text-[10px] font-semibold text-stone-400 px-2 py-1 uppercase tracking-wider">內建範本</p>
              {BUILTIN_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setPreview(t); setEditing(null); setSelectedId(t.id); }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors min-h-0 min-w-0 ${
                    selectedId === t.id ? 'bg-stone-100 text-stone-900 font-medium' : 'text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  {t.name}
                </button>
              ))}

              {loading ? null : customTemplates.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-stone-400 px-2 py-1 mt-2 uppercase tracking-wider">自訂範本</p>
                  {customTemplates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setSelectedId(t.id!); setEditing({ ...t }); setPreview(null); }}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors min-h-0 min-w-0 ${
                        selectedId === t.id ? 'bg-stone-100 text-stone-900 font-medium' : 'text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      {t.name}
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
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-stone-900 mb-1 tracking-tight">{preview.name}</h3>
                  <p className="text-sm text-stone-500">{preview.description}</p>
                </div>

                <div className="mb-5">
                  <h4 className="text-[11px] font-semibold text-stone-500 mb-2 uppercase tracking-wide">產出內容</h4>
                  <div className="space-y-1.5">
                    {BUILTIN_TEMPLATE_DETAILS[preview.id]?.sections.map((section) => (
                      <div key={section.title} className="flex gap-3 py-2 border-b border-stone-100 last:border-b-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-900">{section.title}</p>
                          <p className="text-xs text-stone-500 mt-0.5">{section.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mb-5">
                  <h4 className="text-[11px] font-semibold text-stone-500 mb-2 uppercase tracking-wide">適用場景</h4>
                  <p className="text-sm text-stone-700 leading-relaxed">
                    {BUILTIN_TEMPLATE_DETAILS[preview.id]?.useCase}
                  </p>
                </div>

                {/* System prompt viewer */}
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide">GPT 提示詞</h4>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setShowFullPrompt(!showFullPrompt)}
                        className="text-[11px] h-6 px-2 text-stone-500 hover:text-stone-900 rounded transition-colors min-h-0 min-w-0"
                      >
                        {showFullPrompt ? '收起' : '展開'}
                      </button>
                      <button
                        onClick={() => copyPrompt(BUILTIN_TEMPLATE_DETAILS[preview.id]?.prompt || '')}
                        className={`text-[11px] h-6 px-2 rounded font-medium transition-colors inline-flex items-center gap-1 min-h-0 min-w-0 ${
                          copyDone ? 'bg-teal-50 text-teal-700 border border-teal-100' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                        }`}
                      >
                        {copyDone ? <Check size={11} strokeWidth={2} /> : <Copy size={11} strokeWidth={1.75} />}
                        {copyDone ? '已複製' : '複製'}
                      </button>
                    </div>
                  </div>
                  <div className={`bg-stone-950 text-stone-300 rounded-md p-3 text-xs font-mono leading-relaxed overflow-auto whitespace-pre-wrap border border-stone-800 ${
                    showFullPrompt ? 'max-h-96' : 'max-h-24'
                  }`}>
                    {BUILTIN_TEMPLATE_DETAILS[preview.id]?.prompt}
                  </div>
                </div>

                {/* Action buttons */}
                <button
                  onClick={() => duplicateAsCustom(preview)}
                  className="w-full h-10 bg-stone-900 text-white text-sm font-medium rounded-md hover:bg-stone-800 transition-colors inline-flex items-center justify-center gap-1.5 min-h-0"
                >
                  <Copy size={14} strokeWidth={1.75} />
                  複製為自訂範本
                </button>

                <p className="text-xs text-stone-500 mt-3 leading-relaxed">
                  點「複製為自訂範本」可在此範本基礎上修改，打造你自己的專屬版本。
                </p>
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
                        className={`w-9 h-9 text-xl rounded-md border transition-colors min-h-0 min-w-0 ${
                          editing.icon === icon
                            ? 'border-stone-900 bg-stone-50'
                            : 'border-stone-200 hover:border-stone-300'
                        }`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-stone-500 mb-1 uppercase tracking-wide">範本名稱</label>
                  <input
                    value={editing.name || ''}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="例如：技術評審記錄"
                    className="w-full h-9 px-3 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-stone-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-stone-500 mb-1 uppercase tracking-wide">說明</label>
                  <input
                    value={editing.description || ''}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    placeholder="簡短描述此範本的用途"
                    className="w-full h-9 px-3 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-stone-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-stone-500 mb-1 uppercase tracking-wide">
                    自訂 GPT 系統提示詞
                    <span className="font-normal text-stone-400 ml-1 normal-case">（留空則使用預設）</span>
                  </label>
                  <textarea
                    value={editing.systemPromptOverride || ''}
                    onChange={(e) => setEditing({ ...editing, systemPromptOverride: e.target.value })}
                    placeholder={`範例：\n你是一位專業的技術架構師，請分析此次技術評審會議的逐字稿，用繁體中文輸出：\n1. 技術議題摘要\n2. 架構決策\n3. 風險項目\n4. 技術債務\n5. 下一步行動項目`}
                    rows={8}
                    className="w-full px-3 py-2 border border-stone-300 rounded-md text-xs focus:outline-none focus:border-stone-500 transition-colors font-mono resize-none"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div>
                    {editing.id && (
                      <button
                        onClick={() => deleteTemplate(editing.id!)}
                        className="h-9 px-4 text-sm border border-red-200 text-red-700 rounded-md hover:bg-red-50 transition-colors min-h-0 min-w-0"
                      >
                        刪除範本
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditing(null); setSelectedId(null); }}
                      className="h-9 px-4 text-sm border border-stone-300 text-stone-700 rounded-md hover:bg-stone-50 transition-colors min-h-0 min-w-0"
                    >
                      取消
                    </button>
                    <button
                      onClick={saveTemplate}
                      disabled={!editing.name?.trim()}
                      className="h-9 px-4 text-sm bg-stone-900 text-white rounded-md hover:bg-stone-800 disabled:bg-stone-300 transition-colors min-h-0 min-w-0"
                    >
                      儲存範本
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!preview && !editing && (
              <div className="flex flex-1 items-center justify-center text-stone-400 h-full">
                <div className="text-center">
                  <LayoutTemplate size={28} strokeWidth={1.5} className="mx-auto mb-3" />
                  <p className="text-sm text-stone-500">選擇範本預覽<br />或建立自訂範本</p>
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
