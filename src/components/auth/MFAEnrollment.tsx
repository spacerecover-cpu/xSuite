import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Copy, Check, Loader2, AlertCircle } from 'lucide-react';
import { mfaService, MFAEnrollResponse } from '../../lib/mfaService';
import { useAuth } from '../../contexts/AuthContext';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';

interface MFAEnrollmentProps {
  isOpen: boolean;
  onClose: () => void;
  onEnrolled: () => void;
}

export const MFAEnrollment: React.FC<MFAEnrollmentProps> = ({ isOpen, onClose, onEnrolled }) => {
  const { user } = useAuth();
  const [step, setStep] = useState<'setup' | 'verify' | 'complete'>('setup');
  const [enrollment, setEnrollment] = useState<MFAEnrollResponse | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      startEnrollment();
    }
    return () => {
      setStep('setup');
      setEnrollment(null);
      setCode('');
      setError('');
    };
  }, [isOpen]);

  const startEnrollment = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await mfaService.enrollTOTP('xSuite Authenticator');
      setEnrollment(data);
      setStep('setup');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start MFA enrollment');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!enrollment || code.length !== 6) return;

    setLoading(true);
    setError('');
    try {
      await mfaService.verifyTOTP(enrollment.id, code);
      if (user) {
        await mfaService.updateProfileMFAStatus(user.id, true);
      }
      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid verification code. Please try again.');
      setCode('');
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const copySecret = async () => {
    if (!enrollment) return;
    await navigator.clipboard.writeText(enrollment.totp.secret);
    setSecretCopied(true);
    setTimeout(() => setSecretCopied(false), 2000);
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      label="Two-factor authentication setup"
      className="max-w-md overflow-hidden bg-white"
      closeOnEscape
      closeOnBackdrop={false}
      initialFocusRef={inputRef}
    >
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-slate-900">Set Up Two-Factor Authentication</h2>
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-danger-muted border border-danger/30 text-danger rounded flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {step === 'setup' && enrollment && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
              </p>

              <div className="flex justify-center p-4 bg-white border border-slate-200 rounded-lg">
                <img
                  src={enrollment.totp.qr_code}
                  alt="MFA QR Code"
                  className="w-48 h-48"
                />
              </div>

              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">Or enter this secret manually:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono text-slate-800 break-all">
                    {enrollment.totp.secret}
                  </code>
                  <button
                    onClick={copySecret}
                    className="p-1.5 hover:bg-slate-200 rounded transition-colors"
                    title="Copy secret"
                  >
                    {secretCopied ? (
                      <Check className="w-4 h-4 text-success" />
                    ) : (
                      <Copy className="w-4 h-4 text-slate-500" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="secondary" onClick={onClose} className="flex-1">
                  Cancel
                </Button>
                <button
                  onClick={() => {
                    setStep('verify');
                    setTimeout(() => inputRef.current?.focus(), 100);
                  }}
                  className="flex-1 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors"
                >
                  I've scanned the QR code
                </button>
              </div>
            </div>
          )}

          {step === 'setup' && !enrollment && !loading && (
            <Button variant="secondary" onClick={onClose} className="w-full">
              Cancel
            </Button>
          )}

          {step === 'verify' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Enter the 6-digit code from your authenticator app to verify setup.
              </p>

              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '');
                  setCode(val);
                  setError('');
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && code.length === 6) handleVerify();
                }}
                placeholder="000000"
                className="w-full text-center text-2xl font-mono tracking-[0.5em] px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />

              <div className="flex gap-3">
                <button
                  onClick={() => { setStep('setup'); setCode(''); setError(''); }}
                  className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleVerify}
                  disabled={loading || code.length !== 6}
                  className="flex-1 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Verify & Enable
                </button>
              </div>
            </div>
          )}

          {step === 'complete' && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-success-muted rounded-full flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-success" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">MFA Enabled Successfully</h3>
              <p className="text-sm text-slate-600">
                Your account is now protected with two-factor authentication. You'll need your authenticator app each time you sign in.
              </p>
              <button
                onClick={() => { onEnrolled(); onClose(); }}
                className="w-full px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {loading && !enrollment && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}
        </div>
    </Dialog>
  );
};
