import React from 'react';
import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import MobileBottomNav from './MobileBottomNav';
import { useAuth } from '../../contexts/AuthContext';

const AppShell: React.FC = () => {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex flex-col">
      <TopBar />
      <main className="flex-1 overflow-auto main-content">
        <Outlet />
      </main>
      {/* Unified bottom navigation for all screen sizes */}
      <MobileBottomNav />
    </div>
  );
};

export default AppShell;
