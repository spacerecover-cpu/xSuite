import type { ReactNode } from 'react';
import { XLogo } from './XLogo';
import { AuthBackground } from './AuthBackground';
import { GlowPanel } from './GlowPanel';

interface AuthShellProps {
  /** Brand column shown beside the panel on lg+ screens. Omit to center the panel. */
  aside?: ReactNode;
  /** The glow glass panel content. */
  children: ReactNode;
  /** Bottom row (trust chips). */
  footer?: ReactNode;
}

/**
 * Full-bleed immersive scaffold for the auth zone: one dark canvas
 * (AuthBackground with the 3D particle wave), a wordmark header, an optional
 * brand column, and the animated-glow glass panel. Non-themed + lint-exempt
 * (see DESIGN.md "Non-Themed Surfaces").
 */
export const AuthShell = ({ aside, children, footer }: AuthShellProps) => {
  return (
    <div className="relative min-h-dvh overflow-hidden flex flex-col">
      <AuthBackground />

      <header className="relative z-10 px-6 sm:px-10 pt-6">
        <div className="inline-flex items-center gap-2.5">
          <XLogo size={26} />
          <span className="font-display-auth text-xl font-semibold text-white tracking-tight">xSuite</span>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-center px-6 sm:px-10 py-10">
        <div
          className={`w-full max-w-6xl mx-auto grid items-center gap-12 xl:gap-20 ${
            aside ? 'lg:grid-cols-[1.1fr,minmax(0,27rem)]' : ''
          }`}
        >
          {aside && <div className="relative hidden lg:block">{aside}</div>}

          <div className={`w-full ${aside ? 'max-w-md lg:max-w-none mx-auto lg:mx-0' : 'max-w-md mx-auto'}`}>
            <GlowPanel>{children}</GlowPanel>
          </div>
        </div>
      </main>

      {footer && (
        <footer className="relative z-10 px-6 sm:px-10 pb-6 flex justify-center lg:justify-start lg:ps-10">
          {footer}
        </footer>
      )}
    </div>
  );
};
