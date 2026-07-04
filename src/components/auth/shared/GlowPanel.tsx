import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface GlowPanelProps {
  children: ReactNode;
  /** Padding classes for the inner panel. */
  padding?: string;
}

const CONIC =
  'conic-gradient(from 0deg, transparent 0deg, rgba(56,189,248,0.9) 60deg, rgba(139,92,246,0.9) 120deg, transparent 180deg, transparent 200deg, rgba(139,92,246,0.45) 280deg, rgba(56,189,248,0.45) 330deg, transparent 360deg)';

const STATIC_BORDER =
  'linear-gradient(135deg, rgba(56,189,248,0.55), rgba(139,92,246,0.55) 45%, rgba(255,255,255,0.08))';

/**
 * The auth zone's glass panel with an animated gradient border glow. The
 * rotating conic layer is full-bleed (-inset-[100%]) rather than
 * translate-centered — framer owns the inline transform for `rotate`, and a
 * center-origin conic is rotation-symmetric, so the oversized layer covers
 * every angle. The constant `bg-white/10` on the p-px wrapper is the underlay
 * ring, so the border reads even where the sweep isn't. Corner glows live
 * OUTSIDE the overflow-hidden wrapper so they aren't clipped.
 */
export const GlowPanel = ({ children, padding = 'p-7 sm:p-8' }: GlowPanelProps) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-10 -start-10 w-44 h-44 rounded-full bg-sky-500/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-10 -end-10 w-44 h-44 rounded-full bg-violet-500/20 blur-3xl"
      />

      <div className="relative rounded-2xl p-px overflow-hidden bg-white/10 shadow-2xl shadow-slate-950/60">
        {shouldReduceMotion ? (
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ background: STATIC_BORDER }}
          />
        ) : (
          <motion.div
            aria-hidden="true"
            className="absolute -inset-[100%]"
            style={{ background: CONIC }}
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
          />
        )}
        <div className={`relative rounded-[15px] bg-slate-900/70 backdrop-blur-xl ${padding}`}>
          {children}
        </div>
      </div>
    </div>
  );
};
