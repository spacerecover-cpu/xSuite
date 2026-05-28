import { useCallback, useEffect, useState } from 'react';

// Global Cmd+K / Ctrl+K listener. Cmd+K is the de facto SaaS standard
// (Linear, GitHub, Slack…); also accept Ctrl+K on Windows/Linux.
// Skip when the user is typing in a contenteditable so editors can keep
// the shortcut for themselves.
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod || e.key.toLowerCase() !== 'k') return;
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      e.preventDefault();
      setIsOpen((v) => !v);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return { isOpen, open, close, toggle };
}
