import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (result: boolean) => void;
}

const ConfirmContext = createContext<ConfirmFn | null>(null);

function isFocusable(el: Element | null): el is HTMLElement {
  return el instanceof HTMLElement && typeof el.focus === 'function';
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  // Element that held focus when confirm() was called — restored on close
  // to satisfy the accessibility return-focus contract.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    returnFocusRef.current = isFocusable(active) ? active : null;

    return new Promise<boolean>((resolve) => {
      setPending({ options, resolve });
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    setPending((current) => {
      current?.resolve(result);
      return null;
    });

    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (target && document.contains(target)) {
      // Defer so the dialog has unmounted and released focus first.
      requestAnimationFrame(() => {
        target.focus();
      });
    }
  }, []);

  const handleConfirm = useCallback(() => settle(true), [settle]);
  const handleCancel = useCallback(() => settle(false), [settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        isOpen={pending !== null}
        onClose={handleCancel}
        onConfirm={handleConfirm}
        title={pending?.options.title ?? ''}
        message={pending?.options.message ?? ''}
        confirmText={pending?.options.confirmLabel}
        cancelText={pending?.options.cancelLabel}
        variant={pending?.options.tone === 'default' ? 'info' : 'danger'}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return ctx;
}
