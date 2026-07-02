import { useId } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { STATUS_TONE_MUTED } from '../../lib/ui/variants';
import { cn } from '../../lib/utils';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  variant = 'danger',
  isLoading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const Icon = variant === 'danger' ? Trash2 : AlertTriangle;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      closeOnBackdrop={!isLoading}
      closeOnEscape={!isLoading}
      className="max-w-md p-6"
    >
      <div className="flex items-start gap-4">
        <div className={cn('p-3 rounded-full', STATUS_TONE_MUTED[variant])}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1 pt-1">
          <h3 id={titleId} className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
          <p className="text-sm text-slate-600 mb-6">{message}</p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={onClose} disabled={isLoading}>
              {cancelText ?? t('common.cancel')}
            </Button>
            <Button variant={variant} onClick={onConfirm} disabled={isLoading} aria-busy={isLoading}>
              {isLoading ? t('ui.processing') : confirmText ?? t('common.confirm')}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
