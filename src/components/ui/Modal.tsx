import { useId, type ReactNode, type ElementType, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Dialog } from './Dialog';
import { cn } from '../../lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  /** Optional one-line helper under the title (e.g. "Enter customer details to get started."). */
  subtitle?: string;
  children: ReactNode;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'large' | '2xl';
  maxWidth?: 'xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl';
  icon?: ElementType;
  headerAction?: ReactNode;
  headerBadges?: ReactNode;
  /** Pinned footer region (border-t, never scrolls). Consumers render their
   *  own button row inside (convention: `flex items-center justify-end gap-3`;
   *  destructive actions left via justify-between). Dismissal is footer
   *  buttons + ESC + backdrop — the top-right X pattern was removed
   *  platform-wide 2026-07-02 (DESIGN.md → Overlays). */
  footer?: ReactNode;
  /** Opt-in top-right X dismiss button (2026-07-20 party-form standard —
   *  matches the reference modal chrome; overrides the 2026-07-02 removal
   *  for modals that opt in). */
  showClose?: boolean;
  ariaLabel?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
}

// Standard width tiers (keep new modals consistent — pick by content, and use the
// horizontal space before resorting to vertical scrolling):
//   xs/sm  – confirmations and single-field quick-adds
//   md     – short single-column forms (≤4 fields)
//   maxWidth="xl" (576px) – party forms (customer/company add+edit), 2-col rows
//   lg     – standard forms: pair related fields into 2-column rows
//   size xl/4xl – multi-section entity forms, 2–3 col rows
//   2xl+/7xl – wizards and full editors (e.g. Add Inventory Item)
// Scrolling is the fallback for genuinely long content, not a substitute for width.
const sizeClasses: Record<NonNullable<ModalProps['size']>, string> = {
  xs: 'max-w-sm',
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  large: 'max-w-4xl',
  '2xl': 'max-w-6xl',
};

const maxWidthClasses: Record<NonNullable<ModalProps['maxWidth']>, string> = {
  xl: 'max-w-xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
};

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  size = 'md',
  maxWidth,
  icon: Icon,
  headerAction,
  headerBadges,
  footer,
  showClose = false,
  ariaLabel,
  initialFocusRef,
  closeOnBackdrop = true,
  closeOnEscape = true,
}: ModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const widthClass = maxWidth ? maxWidthClasses[maxWidth] : sizeClasses[size];

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      labelledBy={title ? titleId : undefined}
      label={title ? undefined : ariaLabel ?? t('ui.dialog')}
      initialFocusRef={initialFocusRef}
      closeOnBackdrop={closeOnBackdrop}
      closeOnEscape={closeOnEscape}
      className={cn(widthClass, 'flex flex-col overflow-hidden')}
    >
      {title && (
        <div className="no-print flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Icon className="w-5 h-5 text-primary" />
              </div>
            )}
            <div>
              <h2 id={titleId} className="text-lg font-semibold text-slate-900">{title}</h2>
              {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
            </div>
            {headerBadges && <div className="flex items-center gap-2 ms-2">{headerBadges}</div>}
          </div>
          {(headerAction || showClose) && (
            <div className="flex items-center gap-2">
              {headerAction}
              {showClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('ui.close', 'Close')}
                  className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
      {footer && (
        <div className="no-print shrink-0 border-t border-border px-5 py-3">{footer}</div>
      )}
    </Dialog>
  );
}
