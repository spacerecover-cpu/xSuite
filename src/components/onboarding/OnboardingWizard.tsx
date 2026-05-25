import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Settings, Database, Users, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { onboardingService, ONBOARDING_STEPS, type OnboardingStep } from '../../lib/onboardingService';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';

interface OnboardingWizardProps {
  tenantId: string;
  onComplete: () => void;
}

export const OnboardingWizard = ({ tenantId, onComplete }: OnboardingWizardProps) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const currentStep = ONBOARDING_STEPS[currentStepIndex];
  const totalSteps = ONBOARDING_STEPS.length - 1;
  const progress = Math.round((currentStepIndex / totalSteps) * 100);

  const handleNext = async () => {
    setLoading(true);
    try {
      await onboardingService.markStepComplete(tenantId, currentStep.id as OnboardingStep);

      if (currentStepIndex < totalSteps) {
        setCurrentStepIndex(currentStepIndex + 1);
      } else {
        await onboardingService.completeOnboarding(tenantId);
        toast.success('Onboarding completed successfully!');
        onComplete();
      }
    } catch (error) {
      toast.error('Failed to save progress');
      logger.error('Onboarding step failed', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    if (currentStepIndex < totalSteps) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const getStepIcon = (stepId: string) => {
    switch (stepId) {
      case 'company_info': return Building2;
      case 'default_settings': return Settings;
      case 'sample_data': return Database;
      case 'invite_team': return Users;
      case 'complete': return CheckCircle2;
      default: return Building2;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-3xl w-full">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome to xSuite</h1>
          <p className="text-gray-600">Let's get your data recovery lab set up in just a few steps</p>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {ONBOARDING_STEPS.slice(0, -1).map((step, index) => {
              const Icon = getStepIcon(step.id);
              const isActive = index === currentStepIndex;
              const isCompleted = index < currentStepIndex;

              return (
                <div key={step.id} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        isCompleted
                          ? 'bg-success text-success-foreground'
                          : isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-gray-200 text-gray-400'
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        <Icon className="w-5 h-5" />
                      )}
                    </div>
                    <span
                      className={`text-xs mt-2 text-center ${
                        isActive ? 'font-semibold text-gray-900' : 'text-gray-500'
                      }`}
                    >
                      {step.title}
                    </span>
                  </div>
                  {index < totalSteps - 1 && (
                    <div
                      className={`h-1 flex-1 mx-2 ${
                        isCompleted ? 'bg-success' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="w-full bg-gray-200 rounded-full h-2 mt-4">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <Card className="p-8">
          <StepContent
            stepId={currentStep.id as OnboardingStep}
            tenantId={tenantId}
            onNext={handleNext}
            onSkip={handleSkip}
            loading={loading}
          />
        </Card>

        <div className="mt-6 text-center text-sm text-gray-500">
          Step {currentStepIndex + 1} of {totalSteps}
        </div>
      </div>
    </div>
  );
};

interface StepContentProps {
  stepId: OnboardingStep;
  tenantId: string;
  onNext: () => void;
  onSkip: () => void;
  loading: boolean;
}

const StepContent = ({ stepId, tenantId, onNext, onSkip: _onSkip, loading }: StepContentProps) => {
  const navigate = useNavigate();
  const toast = useToast();
  const [loadingSampleData, setLoadingSampleData] = useState(false);

  const handleLoadSampleData = async () => {
    setLoadingSampleData(true);
    try {
      await onboardingService.seedDemoData(tenantId);
      toast.success('Sample data loaded successfully!');
      onNext();
    } catch (error) {
      toast.error('Failed to load sample data');
      logger.error('Loading sample data failed', error);
    } finally {
      setLoadingSampleData(false);
    }
  };

  switch (stepId) {
    case 'company_info':
      return (
        <div>
          <h2 className="text-2xl font-bold mb-4">Company Information</h2>
          <p className="text-gray-600 mb-6">
            Set up your company profile to personalize invoices, quotes, and reports.
          </p>
          <div className="bg-info-muted border border-info/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-info">
              You can configure your company details in Settings → General Settings at any time.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => navigate('/settings/general')}
              variant="secondary"
            >
              Configure Now
            </Button>
            <Button onClick={onNext} disabled={loading}>
              Skip for Now
            </Button>
          </div>
        </div>
      );

    case 'default_settings':
      return (
        <div>
          <h2 className="text-2xl font-bold mb-4">Default Settings</h2>
          <p className="text-gray-600 mb-6">
            Configure your preferred currency, timezone, and date format for the entire system.
          </p>
          <div className="bg-info-muted border border-info/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-info">
              These settings can be changed later in Settings → General Settings.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => navigate('/settings/general')}
              variant="secondary"
            >
              Configure Now
            </Button>
            <Button onClick={onNext} disabled={loading}>
              Use Defaults
            </Button>
          </div>
        </div>
      );

    case 'sample_data':
      return (
        <div>
          <h2 className="text-2xl font-bold mb-4">Sample Data</h2>
          <p className="text-gray-600 mb-6">
            Would you like to load sample data to explore xSuite features? This includes a demo customer and case.
          </p>
          <div className="bg-warning-muted border border-warning/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-warning">
              Sample data is clearly marked and can be deleted at any time.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={handleLoadSampleData}
              disabled={loadingSampleData || loading}
              variant="secondary"
            >
              {loadingSampleData ? 'Loading...' : 'Load Sample Data'}
            </Button>
            <Button onClick={onNext} disabled={loading}>
              Start from Scratch
            </Button>
          </div>
        </div>
      );

    case 'invite_team':
      return (
        <div>
          <h2 className="text-2xl font-bold mb-4">Invite Your Team</h2>
          <p className="text-gray-600 mb-6">
            Collaborate with your team by inviting technicians, sales staff, and accountants.
          </p>
          <div className="bg-info-muted border border-info/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-info">
              You can invite team members anytime from Settings → User Management.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => navigate('/settings/users')}
              variant="secondary"
            >
              Invite Team
            </Button>
            <Button onClick={onNext} disabled={loading}>
              Skip for Now
            </Button>
          </div>
        </div>
      );

    case 'complete':
      return (
        <div className="text-center">
          <CheckCircle2 className="w-16 h-16 text-success mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-4">You're All Set!</h2>
          <p className="text-gray-600 mb-8">
            Your xSuite account is ready. Start managing your data recovery cases, customers, and operations.
          </p>
          <Button onClick={() => navigate('/dashboard')} size="lg">
            Go to Dashboard
          </Button>
        </div>
      );

    default:
      return null;
  }
};
