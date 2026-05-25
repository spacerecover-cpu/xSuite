import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { Button } from './Button';

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

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  isLoading = false,
}) => {
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      bg: 'bg-danger-muted',
      iconBg: 'bg-danger-muted',
      iconColor: 'text-danger',
      buttonBg: 'bg-danger hover:bg-danger/90',
    },
    warning: {
      bg: 'bg-warning-muted',
      iconBg: 'bg-warning-muted',
      iconColor: 'text-warning',
      buttonBg: 'bg-warning hover:bg-warning/90',
    },
    info: {
      bg: 'bg-info-muted',
      iconBg: 'bg-info-muted',
      iconColor: 'text-info',
      buttonBg: 'bg-info hover:bg-info/90',
    },
  };

  const styles = variantStyles[variant];

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !isLoading) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onMouseDown={handleBackdropClick}
    >
      <div className="fixed inset-0 bg-black bg-opacity-50" />
      <div
        className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded transition-colors disabled:opacity-50"
        >
          <X className="w-5 h-5 text-slate-400" />
        </button>

        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-full ${styles.iconBg}`}>
            {variant === 'danger' && <Trash2 className={`w-6 h-6 ${styles.iconColor}`} />}
            {variant === 'warning' && <AlertTriangle className={`w-6 h-6 ${styles.iconColor}`} />}
            {variant === 'info' && <AlertTriangle className={`w-6 h-6 ${styles.iconColor}`} />}
          </div>

          <div className="flex-1 pt-1">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
            <p className="text-sm text-slate-600 mb-6">{message}</p>

            <div className="flex gap-3 justify-end">
              <Button
                variant="ghost"
                onClick={onClose}
                disabled={isLoading}
              >
                {cancelText}
              </Button>
              <button
                onClick={onConfirm}
                disabled={isLoading}
                className={`px-4 py-2 text-white rounded-lg font-medium transition-colors disabled:opacity-50 ${styles.buttonBg}`}
              >
                {isLoading ? 'Processing...' : confirmText}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
