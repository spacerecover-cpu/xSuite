import { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Lock, Mail, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { PasswordStrength } from '../components/PasswordStrength';
import { tenantService } from '../../../../lib/tenantService';
import { otpCodeIsValidShape } from '../onboardingValidation';
import type { OnboardingFormData } from '../constants';

interface AccountStepProps {
  formData: OnboardingFormData;
  errors: Record<string, string>;
  updateField: <K extends keyof OnboardingFormData>(key: K, value: OnboardingFormData[K]) => void;
  onNext: () => void;
  onBack: () => void;
}

export const AccountStep = ({
  formData,
  errors,
  updateField,
  onNext,
  onBack,
}: AccountStepProps) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // OTP email verification (Country Engine §9.5) — uses the existing
  // send-otp-email edge fn via tenantService. Continue is gated on emailVerified.
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  const emailLooksValid = /.+@.+\..+/.test(formData.email);

  const handleSendOtp = async () => {
    setOtpError(null);
    setOtpSending(true);
    try {
      await tenantService.sendOtp(formData.email, formData.companyName);
      setOtpSent(true);
    } catch (e) {
      setOtpError(e instanceof Error ? e.message : 'Could not send the code');
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyOtp = async (code: string) => {
    if (!otpCodeIsValidShape(code)) return;
    setOtpError(null);
    setOtpVerifying(true);
    try {
      const ok = await tenantService.verifyOtp(formData.email, code);
      if (ok) {
        updateField('emailVerified', true);
      } else {
        setOtpError('That code is incorrect or expired');
      }
    } catch (e) {
      setOtpError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleEmailChange = (value: string) => {
    updateField('email', value);
    // Changing the email invalidates any prior verification.
    if (formData.emailVerified) updateField('emailVerified', false);
    setOtpSent(false);
    setOtpCode('');
    setOtpError(null);
  };

  const inputClasses = (hasError: boolean) =>
    `w-full bg-slate-800/50 border ${hasError ? 'border-danger/60' : 'border-slate-700'} rounded-xl px-4 py-3 text-white placeholder-slate-600 font-body text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all`;

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <label className="block text-sm font-medium text-slate-300 font-body mb-2">
          Full Name <span className="text-primary">*</span>
        </label>
        <input
          type="text"
          value={formData.fullName}
          onChange={e => updateField('fullName', e.target.value)}
          placeholder="John Doe"
          className={inputClasses(!!errors.fullName)}
        />
        {errors.fullName && <p className="text-danger text-xs mt-1 font-body">{errors.fullName}</p>}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <label className="block text-sm font-medium text-slate-300 font-body mb-2">
          Email Address <span className="text-primary">*</span>
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            type="email"
            value={formData.email}
            onChange={e => handleEmailChange(e.target.value)}
            placeholder="john@acme.com"
            disabled={formData.emailVerified}
            className={`${inputClasses(!!errors.email)} pl-10 ${formData.emailVerified ? 'pr-28 opacity-70' : 'pr-28'}`}
          />
          {formData.emailVerified ? (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-success text-xs font-body font-medium">
              <CheckCircle2 className="w-4 h-4" /> Verified
            </span>
          ) : (
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={!emailLooksValid || otpSending}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-xs font-body font-medium hover:bg-primary/25 disabled:opacity-40 transition-colors"
            >
              {otpSending ? (
                <span className="flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending</span>
              ) : (
                otpSent ? 'Resend code' : 'Send code'
              )}
            </button>
          )}
        </div>
        {errors.email && <p className="text-danger text-xs mt-1 font-body">{errors.email}</p>}

        {otpSent && !formData.emailVerified && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 overflow-hidden"
          >
            <label className="block text-xs font-medium text-slate-400 font-body mb-2">
              Enter the 6-digit code we emailed you
            </label>
            <div className="flex items-center gap-2">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otpCode}
                onChange={(e) => {
                  const next = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOtpCode(next);
                  setOtpError(null);
                  if (next.length === 6) void handleVerifyOtp(next);
                }}
                placeholder="••••••"
                className={`${inputClasses(!!otpError)} tracking-[0.5em] text-center font-mono`}
              />
              {otpVerifying && <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />}
            </div>
            {otpError && <p className="text-danger text-xs mt-1 font-body" role="alert">{otpError}</p>}
          </motion.div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <label className="block text-sm font-medium text-slate-300 font-body mb-2">
          Password <span className="text-primary">*</span>
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={formData.password}
            onChange={e => updateField('password', e.target.value)}
            placeholder="Create a strong password"
            className={`${inputClasses(!!errors.password)} pr-10`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.password && <p className="text-danger text-xs mt-1 font-body">{errors.password}</p>}
        <PasswordStrength password={formData.password} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <label className="block text-sm font-medium text-slate-300 font-body mb-2">
          Confirm Password <span className="text-primary">*</span>
        </label>
        <div className="relative">
          <input
            type={showConfirm ? 'text' : 'password'}
            value={formData.confirmPassword}
            onChange={e => updateField('confirmPassword', e.target.value)}
            placeholder="Confirm your password"
            className={`${inputClasses(!!errors.confirmPassword)} pr-10`}
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.confirmPassword && <p className="text-danger text-xs mt-1 font-body">{errors.confirmPassword}</p>}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex items-center gap-2 pt-1"
      >
        <Lock className="w-3.5 h-3.5 text-slate-600" />
        <span className="text-xs text-slate-600 font-body">256-bit encryption &middot; GDPR compliant</span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="flex gap-3 pt-2"
      >
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-400 font-body text-sm hover:border-slate-600 hover:text-slate-300 transition-all"
        >
          Back
        </button>
        <Button
          onClick={onNext}
          disabled={!formData.emailVerified}
          className="flex-1 !bg-primary hover:!bg-primary/90 !text-primary-foreground !rounded-xl !py-3 !font-body disabled:!opacity-40"
        >
          {formData.emailVerified ? 'Continue' : 'Verify email to continue'}
        </Button>
      </motion.div>
    </div>
  );
};
