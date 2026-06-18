import React, { useEffect, useRef } from 'react';

/**
 * Accessible modal shell: backdrop-click to close, Esc to close, role=dialog +
 * aria-modal, focus the first focusable element on open, restore focus on close,
 * and a simple Tab focus-trap. Children render the dialog panel content.
 */
interface ModalProps {
  onClose: () => void;
  children: React.ReactNode;
  labelledBy?: string;   // id of the heading element inside the panel
  maxWidth?: string;     // tailwind max-w-* (default max-w-md)
  className?: string;     // extra panel classes
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

const Modal: React.FC<ModalProps> = ({ onClose, children, labelledBy, maxWidth = 'max-w-md', className = '' }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  // Keep onClose in a ref so the effect can run mount-once: callers pass an inline
  // closure (new ref each render), and depending on it would re-run the effect on
  // every parent re-render — re-focusing the first element and stealing focus mid-typing.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const prevActive = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); return; }
      if (e.key === 'Tab' && panelRef.current) {
        const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
          .filter(n => n.offsetParent !== null);
        if (nodes.length === 0) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prevActive?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        ref={panelRef}
        className={`w-full ${maxWidth} bg-white rounded-2xl shadow-2xl ${className}`}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};

export default Modal;
