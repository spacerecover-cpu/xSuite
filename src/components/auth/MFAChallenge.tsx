import React, { useState, useRef, useEffect } from 'react';
import { ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import { mfaService } from '../../lib/mfaService';
import { AuthBackground } from './shared/AuthBackground';
import { GlowPanel } from './shared/GlowPanel';

interface MFAChallengeProps {
  onVerified: () => void;
  onCancel: () => void;
}

export const MFAChallenge: React.FC<MFAChallengeProps> = ({ onVerified, onCancel }) => {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    setError('');

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newCode.every(d => d !== '') && index === 5) {
      handleVerify(newCode.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const newCode = pasted.split('');
      setCode(newCode);
      handleVerify(pasted);
    }
  };

  const handleVerify = async (otpCode: string) => {
    setLoading(true);
    setError('');

    try {
      const factor = await mfaService.getVerifiedFactor();
      if (!factor) {
        setError('No MFA factor found. Please contact your administrator.');
        return;
      }

      await mfaService.verifyTOTP(factor.id, otpCode);
      onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid verification code');
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-dvh flex items-center justify-center overflow-hidden">
      <AuthBackground />
      <div className="relative z-10 max-w-md w-full mx-4">
        <GlowPanel padding="p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-white/10 ring-1 ring-white/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 text-sky-300" aria-hidden="true" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Two-Factor Authentication</h2>
            <p className="text-slate-400 text-sm">
              Enter the 6-digit code from your authenticator app
            </p>
          </div>

          {error && (
            <div role="alert" className="mb-4 p-3 bg-red-500/10 border border-red-400/30 text-red-200 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <div className="flex justify-center gap-2 mb-6" onPaste={handlePaste}>
            {code.map((digit, index) => (
              <input
                key={index}
                ref={el => { inputRefs.current[index] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={e => handleChange(index, e.target.value)}
                onKeyDown={e => handleKeyDown(index, e)}
                disabled={loading}
                className="w-12 h-14 text-center text-2xl font-mono text-white bg-white/[0.06] border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-sky-400/60 disabled:opacity-50 transition-colors"
              />
            ))}
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 text-sky-300 mb-4" role="status">
              <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />
              <span className="text-sm">Verifying...</span>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 text-sm font-medium text-slate-200 bg-white/[0.06] border border-white/15 rounded-lg hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              Cancel
            </button>
            <button
              onClick={() => handleVerify(code.join(''))}
              disabled={loading || code.some(d => d === '')}
              className="flex-1 px-4 py-2 text-sm font-medium text-slate-900 bg-white rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              Verify
            </button>
          </div>
        </GlowPanel>
      </div>
    </div>
  );
};
