import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';
import { getIntakeStatusForCreation } from './caseService';

type OnboardingProgress = Database['public']['Tables']['onboarding_progress']['Row'];
type CaseInsert = Database['public']['Tables']['cases']['Insert'];

export type OnboardingStep =
  | 'company_info'
  | 'default_settings'
  | 'sample_data'
  | 'invite_team'
  | 'complete';

interface OnboardingStepData {
  id: OnboardingStep;
  title: string;
  description: string;
}

export const ONBOARDING_STEPS: OnboardingStepData[] = [
  {
    id: 'company_info',
    title: 'Company Information',
    description: 'Set up your company profile and contact details',
  },
  {
    id: 'default_settings',
    title: 'Default Settings',
    description: 'Configure currency, timezone, and localization',
  },
  {
    id: 'sample_data',
    title: 'Sample Data',
    description: 'Load demo data or start from scratch',
  },
  {
    id: 'invite_team',
    title: 'Invite Team',
    description: 'Add team members to collaborate',
  },
  {
    id: 'complete',
    title: 'Complete',
    description: 'You are all set up!',
  },
];

export const onboardingService = {
  async getProgress(tenantId: string): Promise<OnboardingProgress | null> {
    const { data, error } = await supabase
      .from('onboarding_progress')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async markStepComplete(tenantId: string, step: OnboardingStep): Promise<void> {
    const progress = await this.getProgress(tenantId);
    if (!progress) throw new Error('Onboarding progress not found');

    const stepsCompleted = progress.steps_completed as string[] || [];
    if (!stepsCompleted.includes(step)) {
      stepsCompleted.push(step);
    }

    const currentStepIndex = ONBOARDING_STEPS.findIndex(s => s.id === step);
    const nextStep = ONBOARDING_STEPS[currentStepIndex + 1]?.id || 'complete';

    const { error } = await supabase
      .from('onboarding_progress')
      .update({
        steps_completed: stepsCompleted,
        current_step: nextStep,
        completed_at: nextStep === 'complete' ? new Date().toISOString() : null,
      })
      .eq('id', progress.id);

    if (error) throw error;
  },

  async completeOnboarding(tenantId: string): Promise<void> {
    const progress = await this.getProgress(tenantId);
    if (!progress) throw new Error('Onboarding progress not found');

    const { error } = await supabase
      .from('onboarding_progress')
      .update({
        current_step: 'complete',
        completed_at: new Date().toISOString(),
      })
      .eq('id', progress.id);

    if (error) throw error;
  },

  async seedDemoData(tenantId: string): Promise<void> {
    const { data: demoCustomer, error: customerError } = await supabase
      .from('customers_enhanced')
      .insert({
        tenant_id: tenantId,
        customer_name: 'Demo Customer',
        email: 'demo@example.com',
        phone: '+1234567890',
        is_active: true,
      })
      .select()
      .maybeSingle();

    if (customerError) throw customerError;
    if (!demoCustomer) throw new Error('Failed to create demo customer');

    // The guard trigger on cases requires a matched active intake
    // status_id + status name pair on INSERT (v1.3.0 lifecycle).
    const intakeStatus = await getIntakeStatusForCreation();

    const caseData: CaseInsert = {
      tenant_id: tenantId,
      customer_id: demoCustomer.id,
      status: intakeStatus.name,
      status_id: intakeStatus.id,
      phase_entered_at: new Date().toISOString(),
      subject: 'Demo Data Recovery Case',
      description: 'This is a sample case to help you get started. Feel free to delete it.',
    };

    const { error: caseError } = await supabase
      .from('cases')
      .insert(caseData);

    if (caseError) throw caseError;
  },

  async isOnboardingComplete(tenantId: string): Promise<boolean> {
    const progress = await this.getProgress(tenantId);
    return progress?.completed_at != null;
  },

  async getCompletionPercentage(tenantId: string): Promise<number> {
    const progress = await this.getProgress(tenantId);
    if (!progress) return 0;

    const stepsCompleted = (progress.steps_completed as string[] || []).length;
    const totalSteps = ONBOARDING_STEPS.length - 1;
    return Math.round((stepsCompleted / totalSteps) * 100);
  },
};
