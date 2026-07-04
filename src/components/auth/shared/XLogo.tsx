import { useId } from 'react';

interface XLogoProps {
  /** Rendered square size in px. */
  size?: number;
  className?: string;
}

/** The xSuite gradient logomark — two crossing strokes, blue→violet. */
export const XLogo = ({ size = 24, className = '' }: XLogoProps) => {
  const gid = useId();
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${gid}-a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
        <linearGradient id={`${gid}-b`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <path
        d="M25 7 7 25"
        stroke={`url(#${gid}-b)`}
        strokeWidth="5.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M7 7l18 18"
        stroke={`url(#${gid}-a)`}
        strokeWidth="5.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
};
