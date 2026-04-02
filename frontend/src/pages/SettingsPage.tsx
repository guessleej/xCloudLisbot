import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
      icon: '📅',
      desc: '連結 Google / Outlook 行事曆，快速從行程開始錄音',
      action: () => setShowCalendar(true),
    },
    {
      label: '術語辭典',
      icon: '📚',
      desc: '管理專業術語對照表，提升辨識準確度',
      action: () => setShowTermModal(true),
    },
    {
      label: '摘要範本',
      icon: '📋',
      desc: '自訂 GPT 摘要範本，依場景生成專業摘要',
      action: () => setShowTemplateModal(true),
    },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-800 mb-6">設定</h1>

      <div className="space-y-3">
        {settingsItems.map(item => (
          <button key={item.label} onClick={item.action}
            className="w-full flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all text-left active:scale-[0.99]">
            <span className="text-2xl w-12 h-12 flex items-center justify-center bg-gray-50 rounded-xl flex-shrink-0">
              {item.icon}
            </span>
            <div>
              <p className="font-semibold text-gray-800">{item.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
            </div>
            <svg className="ml-auto text-gray-300 flex-shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
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
