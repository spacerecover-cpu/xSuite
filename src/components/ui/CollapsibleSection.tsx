import { useState, useRef, useEffect, useId, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

interface CollapsibleSectionProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  children: ReactNode;
  defaultOpen?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
  fieldCount?: number;
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon: Icon,
  color,
  children,
  defaultOpen = false,
  isOpen: controlledIsOpen,
  onToggle,
  fieldCount,
  className,
  ref,
}) => {
  const { t } = useTranslation();
  const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen);
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const baseId = useId();
  const titleId = `${baseId}-title`;
  const contentId = `${baseId}-content`;

  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(isOpen ? undefined : 0);

  useEffect(() => {
    if (!contentRef.current) return;

    if (isOpen) {
      const contentHeight = contentRef.current.scrollHeight;
      setHeight(contentHeight);

      const timer = setTimeout(() => {
        setHeight(undefined);
      }, 300);

      return () => clearTimeout(timer);
    } else {
      setHeight(contentRef.current.scrollHeight);

      requestAnimationFrame(() => {
        setHeight(0);
      });
    }
  }, [isOpen]);

  const handleToggle = () => {
    if (isControlled && onToggle) {
      onToggle();
    } else {
      setInternalIsOpen(!internalIsOpen);
    }
  };

  return (
    <div
      ref={ref}
      className={cn(
        'bg-surface rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden',
        className,
      )}
    >
      <button
        type="button"
        onClick={handleToggle}
        className="w-full px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-surface hover:from-slate-100 hover:to-slate-50 transition-all duration-200 flex items-center justify-between gap-4 group"
        aria-expanded={isOpen}
        aria-controls={contentId}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow"
            style={{ backgroundColor: color }}
          >
            <Icon className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <div className="flex items-center gap-3">
            <h3 id={titleId} className="text-lg font-bold text-slate-900">
              {title}
            </h3>
            {fieldCount !== undefined && (
              <span className="px-2 py-0.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-full">
                {t('ui.fieldCount', { count: fieldCount })}
              </span>
            )}
          </div>
        </div>
        <ChevronDown
          aria-hidden="true"
          className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      <div
        id={contentId}
        role="region"
        aria-labelledby={titleId}
        ref={contentRef}
        style={{
          height: height !== undefined ? `${height}px` : 'auto',
          overflow: 'hidden',
          transition: 'height 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className="p-6">
          <div className="space-y-4">{children}</div>
        </div>
      </div>
    </div>
  );
};
