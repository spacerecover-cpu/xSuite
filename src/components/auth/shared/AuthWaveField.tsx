import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

// Perspective-projected dot-grid wave — the "3D particle wave" of the auth
// canvas. Pure Canvas 2D (no three.js). Purely decorative: aria-hidden,
// pointer-events-none, paused when the tab is hidden, and a single static
// frame under prefers-reduced-motion.

const COLS = 90;
const ROWS = 26;
const DEPTH = 320; // world-units of z covered by the grid
const SPREAD = 1050; // world-units of x covered by the grid
const FOCAL = 260;
const CAM_Y = 92; // camera height above the wave's rest plane
const Z_OFFSET = 150; // pushes the grid away from the camera

// 12 pre-bucketed fillStyles, near (bright blue) → far (dim violet). One
// fillStyle set per z-band keeps canvas style churn negligible.
const BUCKETS = 12;
const bucketColor = (i: number): string => {
  const t = i / (BUCKETS - 1); // 0 = nearest band, 1 = farthest
  const r = Math.round(56 + (139 - 56) * t);
  const g = Math.round(160 - 100 * t);
  const b = Math.round(248 - 30 * t);
  const a = 0.75 - 0.55 * t;
  return `rgba(${r},${g},${b},${a})`;
};
const FILL_STYLES = Array.from({ length: BUCKETS }, (_, i) => bucketColor(i));

const heightAt = (x: number, z: number, t: number): number =>
  26 * Math.sin(x * 0.0065 + t) +
  14 * Math.sin(z * 0.016 + t * 0.7) +
  8 * Math.sin((x + z) * 0.004 - t * 0.45);

export const AuthWaveField = ({ className = '' }: { className?: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // jsdom (tests) returns null here — bail quietly.
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let rafId = 0;
    let running = false;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = parent.clientWidth;
      height = parent.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const paint = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const horizon = height * 0.18;

      // Far rows first so near dots draw on top; rows map to depth bands.
      for (let row = ROWS - 1; row >= 0; row--) {
        const z = (row / (ROWS - 1)) * DEPTH + Z_OFFSET;
        const bucket = Math.min(
          BUCKETS - 1,
          Math.floor(((z - Z_OFFSET) / DEPTH) * BUCKETS),
        );
        ctx.fillStyle = FILL_STYLES[bucket];
        const scale = FOCAL / z;
        const r = Math.max(0.6, 2.1 * scale);
        for (let col = 0; col < COLS; col++) {
          const x = (col / (COLS - 1) - 0.5) * SPREAD;
          const y = heightAt(x, z, t);
          const sx = cx + x * scale;
          const sy = horizon + (CAM_Y - y) * scale;
          if (sx < -4 || sx > width + 4 || sy < -4 || sy > height + 4) continue;
          ctx.fillRect(sx - r / 2, sy - r / 2, r, r);
        }
      }
    };

    let start = performance.now();
    const loop = (now: number) => {
      if (!running) return;
      paint(((now - start) / 1000) * 0.9);
      rafId = requestAnimationFrame(loop);
    };

    const startLoop = () => {
      if (running || shouldReduceMotion) return;
      running = true;
      start = performance.now() - 1;
      rafId = requestAnimationFrame(loop);
    };
    const stopLoop = () => {
      running = false;
      cancelAnimationFrame(rafId);
    };

    const onVisibility = () => {
      if (document.hidden) stopLoop();
      else startLoop();
    };

    const ro = new ResizeObserver(() => {
      resize();
      if (shouldReduceMotion) paint(1.6);
    });
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    resize();
    if (shouldReduceMotion) {
      paint(1.6); // one static frame
    } else {
      document.addEventListener('visibilitychange', onVisibility);
      startLoop();
    }

    return () => {
      stopLoop();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [shouldReduceMotion]);

  return (
    <canvas
      ref={canvasRef}
      className={`block w-full h-full ${className}`}
      aria-hidden="true"
    />
  );
};
