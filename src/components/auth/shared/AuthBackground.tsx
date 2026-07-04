import { useReducedMotion, motion } from 'framer-motion';
import { AuthWaveField } from './AuthWaveField';

const PARTICLES = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  x: `${7 + (i * 11) % 86}%`,
  y: `${4 + (i * 19) % 88}%`,
  size: 1.5 + (i % 3),
  delay: i * 0.9,
  duration: 7 + (i % 5) * 2,
}));

/**
 * The fixed dark decorative identity of the auth zone (login, reset, signup).
 * Contract: zero props, renders as `absolute inset-0 -z-10` inside a
 * `relative` page. Intentionally non-themed (renders before any tenant theme
 * is known) and lint-exempt like PDFs — see DESIGN.md "Non-Themed Surfaces".
 */
export const AuthBackground = () => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950">
      {/* Fine sector-address dot grid */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.05]" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <pattern id="auth-sector-grid" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
            <circle cx="24" cy="24" r="1" fill="currentColor" className="text-blue-300" />
            <path d="M24 18v-4M24 34v-4M18 24h-4M34 24h-4" stroke="currentColor" strokeWidth="0.4" className="text-blue-400" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#auth-sector-grid)" />
      </svg>

      {/* Depth vignette */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-transparent to-slate-950/70" />

      {/* 3D particle wave — mounted after the vignette so it isn't washed out */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%] [mask-image:linear-gradient(to_top,black_55%,transparent)] [-webkit-mask-image:linear-gradient(to_top,black_55%,transparent)]"
      >
        <AuthWaveField />
      </div>

      {/* Scanning beam — one slow horizontal sweep */}
      {!shouldReduceMotion && (
        <motion.div
          aria-hidden="true"
          className="absolute inset-y-0 w-40 bg-gradient-to-r from-transparent via-sky-400/[0.05] to-transparent"
          initial={{ x: '-12vw' }}
          animate={{ x: '112vw' }}
          transition={{ duration: 16, repeat: Infinity, ease: 'linear', repeatDelay: 5 }}
        />
      )}

      {/* Drifting data particles */}
      {!shouldReduceMotion && PARTICLES.map(p => (
        <motion.div
          key={p.id}
          aria-hidden="true"
          className="absolute rounded-full bg-sky-300"
          style={{ left: p.x, top: p.y, width: p.size, height: p.size }}
          animate={{ y: [0, -24, 0], opacity: [0.12, 0.5, 0.12] }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: 'easeInOut' }}
        />
      ))}

      {/* Atmospheric blobs */}
      <div className="absolute -top-24 start-1/4 w-[32rem] h-[32rem] rounded-full bg-blue-500/[0.06] blur-3xl" />
      <div className="absolute -bottom-32 end-1/5 w-[28rem] h-[28rem] rounded-full bg-sky-600/[0.05] blur-3xl" />
    </div>
  );
};
