import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Share2, FolderClosed, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Meeting, MEETING_MODES } from '../types';
import TranscriptView from '../components/TranscriptView';
import SummaryPanel from '../components/SummaryPanel';
import ShareMeetingModal from '../components/ShareMeetingModal';

type Tab = 'summary' | 'transcript';

const FOLDERS = ['計劃會議', '客戶會議', '銷售討論'];

const MeetingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('summary');
  const [showShare, setShowShare] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);

  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${backendUrl}/api/meetings/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) { const body = await res.json(); setMeeting(body.data ?? body); }
      } catch {}
      finally { setLoading(false); }
    })();
  }, [id]); // eslint-disable-line

  const assignFolder = async (folder: string) => {
    setShowFolderMenu(false);
    if (!meeting) return;
    setMeeting(m => m ? { ...m, folder } : m);
    try {
      const token = await getToken();
      await fetch(`${backendUrl}/api/meetings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ folder }),
      });
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 rounded-full border-2 border-slate-200 animate-spin" style={{ borderTopColor: '#00D4FF' }} />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="px-6 py-6">
        <p className="text-[13px] text-slate-500">找不到會議記錄</p>
      </div>
    );
  }

  const modeLabel = MEETING_MODES.find(m => m.id === meeting.mode)?.label;
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate('/')}
            className="mt-0.5 text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0"
          >
            <ArrowLeft size={18} strokeWidth={1.75} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[18px] font-semibold text-slate-900 truncate leading-tight">
              {meeting.title || '未命名會議'}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {modeLabel && (
                <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{modeLabel}</span>
              )}
              {meeting.startTime && (
                <span className="text-[11px] text-slate-400">{fmtDate(meeting.startTime)}</span>
              )}
              {meeting.folder && (
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  <FolderClosed size={10} strokeWidth={1.75} />{meeting.folder}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Folder assign */}
            <div className="relative">
              <button
                onClick={() => setShowFolderMenu(o => !o)}
                className="h-8 px-3 flex items-center gap-1.5 rounded-lg border border-slate-200 text-[12px] text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <FolderClosed size={13} strokeWidth={1.75} />
                <span className="hidden sm:block">{meeting.folder || '文件夾'}</span>
                <ChevronDown size={11} strokeWidth={2} />
              </button>
              {showFolderMenu && (
                <div className="absolute right-0 top-[calc(100%+4px)] w-36 bg-white border border-slate-200 rounded-lg shadow-md z-20 py-1 fade-in">
                  {FOLDERS.map(f => (
                    <button
                      key={f}
                      onClick={() => assignFolder(f)}
                      className={`w-full px-3 py-1.5 text-[12px] text-left hover:bg-slate-50 transition-colors ${
                        meeting.folder === f ? 'text-[#00D4FF] font-medium' : 'text-slate-700'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowShare(true)}
              className="h-8 px-3 flex items-center gap-1.5 rounded-lg text-[12px] font-semibold transition-colors"
              style={{ background: '#00D4FF', color: '#0A0E27' }}
            >
              <Share2 size={13} strokeWidth={2} />
              <span className="hidden sm:block">分享</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mt-4 -mb-[1px]">
          {(['summary', 'transcript'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-1 pb-2.5 mr-5 text-[13px] font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-[#00D4FF] text-[#00D4FF]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'summary' ? '摘要' : '逐字稿'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-5">
        {tab === 'summary' ? (
          <SummaryPanel summary={meeting.summary || null} meetingId={meeting.id} />
        ) : (
          <TranscriptView segments={meeting.transcripts || []} />
        )}
      </div>

      {showShare && (
        <ShareMeetingModal meetingId={meeting.id} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
};

export default MeetingDetailPage;
