import React, { useEffect, useState } from 'react';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { UsageLimitKey, canPerformAction } from '../../lib/featureGateService';
import { Button } from '../ui/Button';
import { useToast } from '../../hooks/useToast';

interface UsageLimitGuardProps {
  limitKey: UsageLimitKey;
  additionalCount?: number;
  children: React.ReactNode;
  onBlocked?: () => void;
  showToast?: boolean;
}

export function UsageLimitGuard({
  limitKey,
  additionalCount = 1,
  children,
  onBlocked,
  showToast = true,
}: UsageLimitGuardProps) {
  const [checkResult, setCheckResult] = useState<{
    allowed: boolean;
    message?: string;
  } | null>(null);
  const [hasShownWarning, setHasShownWarning] = useState(false);
  const [hasHandledBlock, setHasHandledBlock] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    canPerformAction(limitKey, additionalCount).then(setCheckResult);
  }, [limitKey, additionalCount]);

  useEffect(() => {
    if (checkResult?.allowed && checkResult.message && !hasShownWarning && showToast) {
      toast.warning(checkResult.message);
      setHasShownWarning(true);
    }
  }, [checkResult, hasShownWarning, showToast]);

  useEffect(() => {
    if (checkResult && !checkResult.allowed && !hasHandledBlock) {
      onBlocked?.();
      if (showToast) {
        toast.error(checkResult.message || 'Plan limit reached');
      }
      setHasHandledBlock(true);
    }
  }, [checkResult, hasHandledBlock, showToast]);

  if (checkResult === null) {
    return <>{children}</>;
  }

  if (checkResult.allowed) {
    return <>{children}</>;
  }

  return (
    <div className="bg-warning-muted border border-warning/30 rounded-lg p-6 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 bg-warning-muted rounded-full mb-4">
        <AlertTriangle className="w-6 h-6 text-warning" />
      </div>

      <h3 className="text-lg font-semibold text-slate-900 mb-2">Plan Limit Reached</h3>

      <p className="text-slate-600 mb-4">{checkResult.message}</p>

      <Button onClick={() => navigate('/settings/plans')} variant="outline" className="gap-2">
        <TrendingUp className="w-4 h-4" />
        Upgrade Plan
      </Button>
    </div>
  );
}
