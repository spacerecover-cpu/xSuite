import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  label: string;
  /** Physical side the bubble opens toward. */
  side?: 'left' | 'right';
  /** When true the wrapper renders children only (used when labels are visible). */
  disabled?: boolean;
  children: React.ReactNode;
}

/**
 * Minimal accessible tooltip for the collapsed icon rail. Opens on hover AND
 * keyboard focus (never hover-only), dismisses on Escape, and is portaled to
 * the body with fixed positioning so the rail's `overflow-y-auto` can't clip it.
 */
export const Tooltip: React.FC<TooltipProps> = ({ label, side = 'right', disabled = false, children }) => {
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    if (disabled) return;
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 10;
    setCoords({
      top: r.top + r.height / 2,
      left: side === 'right' ? r.right + gap : r.left - gap,
    });
  };
  const hide = () => setCoords(null);

  useEffect(() => {
    if (!coords) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [coords]);

  const open = coords !== null && !disabled;

  return (
    <span
      ref={wrapRef}
      className="block"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              transform: `translateY(-50%)${side === 'left' ? ' translateX(-100%)' : ''}`,
            }}
            className="z-[60] pointer-events-none px-2 py-1 rounded-md bg-slate-900 text-white text-xs font-medium whitespace-nowrap shadow-lg animate-fade-in"
          >
            {label}
          </div>,
          document.body,
        )}
    </span>
  );
};
