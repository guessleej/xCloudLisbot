import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, BookOpen, LayoutTemplate, ChevronRight } from 'lucide-react';
import TermDictionaryModal from '../components/TermDictionaryModal';
import SummaryTemplateModal from '../components/SummaryTemplateModal';
import CalendarPanel from '../components/CalendarPanel';
import { MeetingConfig } from '../types';

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [showTermModal, setShowTermModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const handleCalendarStart = (config: Partial<MeetingConfig>) => {
    const params = new URLSearchParams();
    if (config.title) params.set('title', config.title);
    if (config.mode) params.set('mode', config.mode);
    navigate(`/record?${params.toString()}`);
    setShowCalendar(false);
  };

  const settingsItems = [
    {
      label: '行事曆',
      Icon: Calendar,
      desc: '連結 Outlook 行事曆，快速從行程開始錄音',
      action: () => setShowCalendar(true),
    },
    {
      label: '術語辭典',
      Icon: BookOpen,
      desc: '管理專業術語對照表，提升辨識準確度',
      action: () => setShowTermModal(true),
    },
    {
      label: '摘要範本',
      Icon: LayoutTemplate,
      desc: '自訂 GPT 摘要範本，依場景生成專業摘要',
      action: () => setShowTemplateModal(true),
    },
  ];

  return (
    <div className="max-w-[640px] mx-auto px-4 py-6">
      <h1 className="text-[22px] font-semibold text-stone-900 tracking-tight mb-6">設定</h1>

      {/* Dense list style */}
      <div className="bg-white rounded-md border border-stone-200 overflow-hidden">
        {settingsItems.map((item, idx) => (
          <button
            key={item.label}
            onClick={item.action}
            className={`w-full flex items-center gap-3 px-4 py-4 hover:bg-stone-50 transition-colors text-left min-h-0 min-w-0 ${
              idx !== settingsItems.length - 1 ? 'border-b border-stone-200' : ''
            }`}
          >
            <div className="w-9 h-9 flex items-center justify-center bg-stone-100 rounded-md flex-shrink-0">
              <item.Icon size={16} strokeWidth={1.75} className="text-stone-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-stone-900 text-sm">{item.label}</p>
              <p className="text-xs text-stone-500 mt-0.5">{item.desc}</p>
            </div>
            <ChevronRight size={16} strokeWidth={1.75} className="text-stone-400 flex-shrink-0" />
          </button>
        ))}
      </div>

      {/* Modals */}
      <CalendarPanel isOpen={showCalendar} onClose={() => setShowCalendar(false)} onStartMeeting={handleCalendarStart} />
      <TermDictionaryModal isOpen={showTermModal} onClose={() => setShowTermModal(false)} onDictsChange={() => {}} />
      <SummaryTemplateModal isOpen={showTemplateModal} onClose={() => setShowTemplateModal(false)} onTemplatesChange={() => {}} />
    </div>
  );
};

export default SettingsPage;
