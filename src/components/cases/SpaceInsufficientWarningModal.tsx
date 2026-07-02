import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { AlertTriangle, HardDrive, Database, TrendingUp } from 'lucide-react';

interface SpaceInsufficientWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed: () => void;
  cloneId: string;
  totalCapacity: number;
  currentUsed: number;
  availableSpace: number;
  requiredSpace: number;
}

export const SpaceInsufficientWarningModal: React.FC<SpaceInsufficientWarningModalProps> = ({
  isOpen,
  onClose,
  onProceed,
  cloneId,
  totalCapacity,
  currentUsed,
  availableSpace,
  requiredSpace,
}) => {
  const formatCapacity = (gb: number): string => {
    if (gb >= 1024) {
      return `${(gb / 1024).toFixed(2)} TB`;
    }
    return `${Math.round(gb)} GB`;
  };

  const shortage = requiredSpace - availableSpace;
  const utilizationAfter = ((currentUsed + requiredSpace) / totalCapacity) * 100;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Insufficient Space Warning"
      icon={AlertTriangle}
      maxWidth="3xl"
    >
      <div className="space-y-3">
        <div className="bg-warning-muted border-2 border-warning/40 rounded-lg p-3">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-full bg-warning/15 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-warning" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-warning mb-1">
                Available Space Lower Than Expected Image Size
              </h3>
              <p className="text-xs text-warning leading-relaxed">
                The clone drive <span className="font-mono font-bold">{cloneId}</span> has{' '}
                <span className="font-semibold">{formatCapacity(availableSpace)}</span> available,
                but you're attempting to clone an image of{' '}
                <span className="font-semibold">{formatCapacity(requiredSpace)}</span>.
                This is a shortage of{' '}
                <span className="font-semibold text-warning">{formatCapacity(shortage)}</span>.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-info-muted flex items-center justify-center">
                <HardDrive className="w-3.5 h-3.5 text-info" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Clone Drive
                </p>
                <p className="text-xs font-bold text-slate-900 font-mono">{cloneId}</p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Total Capacity:</span>
                <span className="font-semibold text-slate-900">{formatCapacity(totalCapacity)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Currently Used:</span>
                <span className="font-semibold text-info">{formatCapacity(currentUsed)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Available Space:</span>
                <span className="font-semibold text-success">{formatCapacity(availableSpace)}</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-warning/15 flex items-center justify-center">
                <Database className="w-3.5 h-3.5 text-warning" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Space Analysis
                </p>
                <p className="text-xs font-bold text-warning">Insufficient</p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Required Space:</span>
                <span className="font-semibold text-slate-900">{formatCapacity(requiredSpace)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Shortage:</span>
                <span className="font-semibold text-danger">-{formatCapacity(shortage)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">After Clone:</span>
                <span className="font-semibold text-warning">{utilizationAfter.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
          <div className="flex items-start gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-slate-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-xs font-semibold text-slate-900 mb-1.5">
                Capacity Utilization Visualization
              </h4>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-600 mb-0.5">
                  <span>Current Utilization</span>
                  <span className="font-medium">
                    {((currentUsed / totalCapacity) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${(currentUsed / totalCapacity) * 100}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-600 mb-0.5 mt-1.5">
                  <span>After This Clone (Projected)</span>
                  <span className="font-medium text-warning">
                    {utilizationAfter.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${Math.min(utilizationAfter, 100)}%`,
                      backgroundColor: utilizationAfter > 100 ? 'rgb(var(--color-danger))' : utilizationAfter > 90 ? 'rgb(var(--color-warning))' : 'rgb(var(--color-primary))'
                    }}
                  />
                </div>
                {utilizationAfter > 100 && (
                  <p className="text-xs text-danger mt-1.5">
                    ⚠️ Warning: This will exceed drive capacity by {(utilizationAfter - 100).toFixed(1)}%
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-info-muted border border-info/30 rounded-lg p-2.5">
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-info/15 flex items-center justify-center flex-shrink-0">
              <span className="text-info font-bold text-xs">ℹ</span>
            </div>
            <div className="flex-1">
              <h4 className="text-xs font-semibold text-info mb-0.5">
                Why Can I Proceed?
              </h4>
              <p className="text-xs text-info leading-relaxed">
                You can override this warning if you determine it's appropriate. Common reasons include:
                the actual image size may be smaller than estimated, compressed images may use less space,
                or you plan to free space by extracting/archiving other clones shortly. This warning
                ensures you make an informed decision.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2.5 pt-2.5 border-t border-slate-200">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="px-4 text-xs"
          >
            Cancel &amp; Choose Another Drive
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={onProceed}
            className="px-4 text-xs bg-warning hover:bg-warning/90 focus:ring-warning"
          >
            Proceed Anyway
          </Button>
        </div>
      </div>
    </Modal>
  );
};
