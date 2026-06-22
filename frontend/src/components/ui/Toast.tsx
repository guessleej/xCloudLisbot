import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

export const useToast = (): ToastContextValue => useContext(ToastContext);

const TONE_STYLES: Record<ToastTone, { bar: string; icon: React.ReactNode }> = {
  success: { bar: 'text-green-600', icon: <CheckCircle2 size={17} strokeWidth={1.75} className="text-green-600" /> },
  error: { bar: 'text-red-600', icon: <AlertCircle size={17} strokeWidth={1.75} className="text-red-600" /> },
  info: { bar: 'text-teal-600', icon: <Info size={17} strokeWidth={1.75} className="text-teal-600" /> },
};

let nextId = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => setItems(s => s.filter(t => t.id !== id)), []);

  const show = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = ++nextId;
      setItems(s => [...s, { id, tone, message }]);
      setTimeout(() => remove(id), 4000);
    },
    [remove],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2" aria-live="polite">
        {items.map(t => (
          <div
            key={t.id}
            className="flex items-start gap-2.5 w-72 px-3.5 py-3 bg-white border border-stone-200 rounded-xl shadow-float fade-in"
          >
            <span className="mt-0.5 flex-shrink-0">{TONE_STYLES[t.tone].icon}</span>
            <p className="flex-1 text-sm text-stone-700 leading-snug">{t.message}</p>
            <button
              onClick={() => remove(t.id)}
              aria-label="關閉"
              className="flex-shrink-0 text-stone-400 hover:text-stone-600 transition-colors"
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
