import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useToast } from './useToast';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  /**
   * Optional async work to run while the dialog stays open. When provided and
   * it returns a promise, the dialog shows a loading/processing state until it
   * settles: on resolve the dialog closes and confirm() resolves `true`; on
   * reject the dialog stays open (loading cleared) so the action can be retried
   * and the error is surfaced via toast. Omit it for the classic
   * `await confirm(...)` boolean flow (unchanged).
   */
  onConfirm?: () => void | boolean | Promise<unknown>;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (result: boolean) => void;
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    value != null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

const ConfirmContext = createContext<ConfirmFn | null>(null);

function isFocusable(el: Element | null): el is HTMLElement {
  return el instanceof HTMLElement && typeof el.focus === 'function';
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();
  const toast = useToast();

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
    setIsLoading(false);
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

  const handleConfirm = useCallback(() => {
    // Read the live handler from state so the async branch isn't captured stale.
    const onConfirm = pending?.options.onConfirm;

    // Legacy boolean flow: no async handler — resolve true and close immediately.
    if (!onConfirm) {
      settle(true);
      return;
    }

    let result: ReturnType<typeof onConfirm>;
    try {
      result = onConfirm();
    } catch (err) {
      // Synchronous throw — keep the dialog open for retry, surface the error.
      toast.error(err instanceof Error ? err.message : t('common.error'));
      return;
    }

    if (!isPromiseLike(result)) {
      // Synchronous handler ran cleanly — close and resolve true.
      settle(true);
      return;
    }

    // Async handler: keep the dialog open with a loading state until it settles.
    setIsLoading(true);
    result.then(
      () => settle(true),
      (err: unknown) => {
        // Reject: stop loading, keep the dialog open so the action can be
        // retried, and surface the error. The outer promise stays pending.
        setIsLoading(false);
        toast.error(err instanceof Error ? err.message : t('common.error'));
      },
    );
  }, [pending, settle, toast, t]);

  const handleCancel = useCallback(() => {
    // Never abort mid-flight; ConfirmDialog also disables cancel while loading.
    if (isLoading) return;
    settle(false);
  }, [isLoading, settle]);

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
        isLoading={isLoading}
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
