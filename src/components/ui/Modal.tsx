import { useId, type ReactNode, type ElementType, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from './Dialog';
import { cn } from '../../lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'large' | '2xl';
  maxWidth?: '3xl' | '4xl' | '5xl' | '6xl' | '7xl';
  icon?: ElementType;
  headerAction?: ReactNode;
  headerBadges?: ReactNode;
  /** Pinned footer region (border-t, never scrolls). Consumers render their
   *  own button row inside (convention: `flex items-center justify-end gap-3`;
   *  destructive actions left via justify-between). Dismissal is footer
   *  buttons + ESC + backdrop — the top-right X pattern was removed
   *  platform-wide 2026-07-02 (DESIGN.md → Overlays). */
  footer?: ReactNode;
  ariaLabel?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
}

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
  children,
  size = 'md',
  maxWidth,
  icon: Icon,
  headerAction,
  headerBadges,
  footer,
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
        <div className="no-print flex items-center justify-between p-3 border-b border-border">
          <div className="flex items-center gap-3">
            {Icon && <Icon className="w-5 h-5 text-primary" />}
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">{title}</h2>
            {headerBadges && <div className="flex items-center gap-2 ms-2">{headerBadges}</div>}
          </div>
          {headerAction && <div className="flex items-center gap-2">{headerAction}</div>}
        </div>
      )}
      <div className="p-4 overflow-y-auto flex-1">{children}</div>
      {footer && (
        <div className="no-print shrink-0 border-t border-border px-4 py-3">{footer}</div>
      )}
    </Dialog>
  );
}
