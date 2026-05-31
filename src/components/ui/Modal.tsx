import { useId, type ReactNode, type ElementType } from 'react';
import { X } from 'lucide-react';
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
  showCloseButton?: boolean;
  ariaLabel?: string;
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
  showCloseButton = true,
  ariaLabel,
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
      closeOnBackdrop
      closeOnEscape
      className={cn(widthClass, 'flex flex-col overflow-hidden')}
    >
      {title ? (
        <div className="no-print flex items-center justify-between p-3 border-b border-border">
          <div className="flex items-center gap-3">
            {Icon && <Icon className="w-5 h-5 text-primary" />}
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">{title}</h2>
            {headerBadges && <div className="flex items-center gap-2 ml-2">{headerBadges}</div>}
          </div>
          <div className="flex items-center gap-2">
            {headerAction && <div>{headerAction}</div>}
            {showCloseButton && (
              <button
                onClick={onClose}
                aria-label={t('ui.close')}
                className="p-1.5 hover:bg-surface-muted rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      ) : (
        showCloseButton && (
          <button
            onClick={onClose}
            aria-label={t('ui.close')}
            className="no-print absolute top-3 right-3 z-10 p-1.5 hover:bg-surface-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )
      )}
      <div className="p-4 overflow-y-auto flex-1">{children}</div>
    </Dialog>
  );
}
