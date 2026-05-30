import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { cn } from '../../lib/utils';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  label?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  className?: string;
  children: ReactNode;
}

let openDialogCount = 0;
let priorBodyOverflow = '';
const dialogStack: symbol[] = [];

export function Dialog({
  open,
  onClose,
  labelledBy,
  label,
  initialFocusRef,
  closeOnBackdrop = true,
  closeOnEscape = true,
  className,
  children,
}: DialogProps) {
  const panelRef = useFocusTrap<HTMLDivElement>({ active: open, initialFocusRef, restoreFocus: true });

  // Stable ref to onClose so the Escape effect doesn't re-run (and churn its
  // document listener / stack token) on every parent re-render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Dev-time a11y guard: a dialog must have an accessible name.
  useEffect(() => {
    if (import.meta.env.DEV && !labelledBy && !label) {
      console.warn('[Dialog] Provide `label` or `labelledBy` so the dialog has an accessible name.');
    }
  }, [labelledBy, label]);

  // Body scroll-lock with a ref-count so stacked dialogs don't unlock early;
  // snapshot and restore any pre-existing inline overflow set by the host app.
  useEffect(() => {
    if (!open) return;
    if (openDialogCount === 0) priorBodyOverflow = document.body.style.overflow;
    openDialogCount += 1;
    document.body.style.overflow = 'hidden';
    return () => {
      openDialogCount -= 1;
      if (openDialogCount === 0) document.body.style.overflow = priorBodyOverflow;
    };
  }, [open]);

  // Escape closes only the topmost dialog.
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const token = Symbol('dialog');
    dialogStack.push(token);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (dialogStack[dialogStack.length - 1] !== token) return;
      onCloseRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const idx = dialogStack.indexOf(token);
      if (idx !== -1) dialogStack.splice(idx, 1);
    };
  }, [open, closeOnEscape]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        data-testid="dialog-backdrop"
        className="absolute inset-0 bg-black/50"
        aria-hidden="true"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        className={cn(
          'relative z-10 mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-surface shadow-xl',
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
