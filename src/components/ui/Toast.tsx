import { CheckCircle, XCircle, AlertTriangle, Info, Loader2, X } from 'lucide-react';
import React, { useEffect, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { STATUS_TONE_MUTED, type StatusTone } from '../../lib/ui/variants';

type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

interface ToastProps {
  message: string;
  type: ToastType;
  duration?: number;
  onClose?: () => void;
  className?: string;
  closeLabel?: string;
  role?: string;
  'aria-live'?: 'off' | 'polite' | 'assertive';
  ref?: React.Ref<HTMLDivElement>;
}

// type -> shared StatusTone (error->danger, loading->info; the rest pass through).
const TYPE_TONE: Record<ToastType, StatusTone> = {
  success: 'success',
  error: 'danger',
  warning: 'warning',
  info: 'info',
  loading: 'info',
};

// The bits STATUS_TONE_MUTED doesn't cover: left border, progress fill, and icon.
const TYPE_EXTRAS: Record<ToastType, { border: string; progress: string; Icon: ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }> }> = {
  success: { border: 'border-success', progress: 'bg-success', Icon: CheckCircle },
  error: { border: 'border-danger', progress: 'bg-danger', Icon: XCircle },
  warning: { border: 'border-warning', progress: 'bg-warning', Icon: AlertTriangle },
  info: { border: 'border-info', progress: 'bg-info', Icon: Info },
  loading: { border: 'border-info', progress: 'bg-info', Icon: Loader2 },
};

export const Toast = ({
  message,
  type,
  duration,
  onClose,
  className,
  closeLabel,
  role,
  'aria-live': ariaLive,
  ref,
}: ToastProps) => {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(100);

  const tone = STATUS_TONE_MUTED[TYPE_TONE[type]];
  const { border, progress: progressColor, Icon } = TYPE_EXTRAS[type];
  const isUrgent = type === 'error' || type === 'warning';
  const showProgress = type !== 'loading' && duration;

  useEffect(() => {
    if (!showProgress || !duration) return;

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 16);

    return () => clearInterval(interval);
  }, [duration, showProgress]);

  return (
    <div
      ref={ref}
      role={role ?? (isUrgent ? 'alert' : 'status')}
      aria-live={ariaLive ?? (isUrgent ? 'assertive' : 'polite')}
      aria-atomic="true"
      className={cn(
        tone,
        'border-l-4',
        border,
        'rounded-lg shadow-lg max-w-md w-full overflow-hidden relative',
        className,
      )}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-shrink-0 mt-0.5">
          <Icon
            className={cn('w-5 h-5', type === 'loading' && 'motion-safe:animate-spin')}
            strokeWidth={2}
            aria-hidden
          />
        </div>

        <div className="flex-1 text-sm leading-relaxed font-medium">{message}</div>

        {type !== 'loading' && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="hover:opacity-70 transition-opacity flex-shrink-0 -mt-0.5 -mr-1"
            aria-label={closeLabel ?? t('ui.toast.close')}
          >
            <X className="w-4 h-4" strokeWidth={2.5} aria-hidden />
          </button>
        )}
      </div>

      {showProgress && (
        <div className="h-0.5 w-full bg-slate-200/60">
          <div
            className={cn('h-full transition-all duration-100 ease-linear', progressColor)}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
};
