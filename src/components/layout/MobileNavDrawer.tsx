import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface MobileNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Physical edge the panel docks to (mirrors RTL). */
  side?: 'left' | 'right';
}

/**
 * Off-canvas navigation for < md. Reuses the docked <Sidebar> body via its
 * `drawer` mode (no nav duplication), the shared focus trap, and Dialog-style
 * scroll-lock + Escape handling. Stays mounted so it can slide both ways; when
 * closed it is `inert` + translated off-canvas so it never traps focus or clicks.
 */
export const MobileNavDrawer: React.FC<MobileNavDrawerProps> = ({ isOpen, onClose, side = 'left' }) => {
  const panelRef = useFocusTrap<HTMLDivElement>({ active: isOpen, restoreFocus: true });

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  const isLeft = side === 'left';
  const closedTranslate = isLeft ? '-translate-x-full' : 'translate-x-full';

  return createPortal(
    <div className={`fixed inset-0 z-50 md:hidden ${isOpen ? '' : 'pointer-events-none'}`}>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        ref={panelRef}
        id="mobile-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        inert={!isOpen}
        className={`absolute inset-y-0 ${isLeft ? 'left-0' : 'right-0'} w-72 max-w-[85vw] bg-surface shadow-2xl transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : closedTranslate}`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation menu"
          className="absolute top-3.5 end-3 z-10 w-7 h-7 flex items-center justify-center rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="w-4 h-4" />
        </button>
        <Sidebar mode="drawer" />
      </div>
    </div>,
    document.body,
  );
};
