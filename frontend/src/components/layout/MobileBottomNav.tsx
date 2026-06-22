import React from 'react';
import { NavLink } from 'react-router-dom';
import { FileText, Calendar, Mic, User, Settings } from 'lucide-react';

const tabs = [
  { to: '/',         icon: FileText,  label: '報告',     end: true },
  { to: '/calendar', icon: Calendar,  label: '日曆',     end: false },
  { to: '/record',   icon: Mic,       label: '錄音',     end: false },
  { to: '/for-you',  icon: User,      label: '我的摘要', end: false },
  { to: '/settings', icon: Settings,  label: '設定',     end: false },
];

const MobileBottomNav: React.FC = () => (
  <nav className="md:hidden flex-shrink-0 bg-white border-t border-stone-200">
    <div className="flex">
      {tabs.map(({ to, icon: Icon, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] transition-colors ${
              isActive ? 'text-teal-700' : 'text-stone-400'
            }`
          }
        >
          <Icon size={19} strokeWidth={1.75} />
          <span>{label}</span>
        </NavLink>
      ))}
    </div>
  </nav>
);

export default MobileBottomNav;
