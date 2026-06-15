import { Building2, Globe, Shield, Wrench, HardDrive, Cpu, Server, Smartphone, Search, Archive } from 'lucide-react';
import { z } from 'zod';
import type { LucideIcon } from 'lucide-react';

export interface StepMeta {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  tagline: string;
}

export const STEPS: StepMeta[] = [
  {
    id: 'welcome',
    title: 'Name Your Recovery Lab',
    subtitle: 'Give your workspace an identity',
    icon: Building2,
    tagline: 'Every successful recovery starts with a name.',
  },
  {
    id: 'location',
    title: 'Where Is Your Lab Based?',
    subtitle: 'We\'ll configure currency, tax, and compliance automatically',
    icon: Globe,
    tagline: 'Serving clients across the globe.',
  },
  {
    id: 'account',
    title: 'Secure Your Command Center',
    subtitle: 'Create your admin account',
    icon: Shield,
    tagline: 'Your data, your clients, protected.',
  },
  {
    id: 'configuration',
    title: 'Configure Your Workspace',
    subtitle: 'Tell us about your lab so we can tailor your experience',
    icon: Wrench,
    tagline: 'Purpose-built for precision recovery.',
  },
];

export interface ServiceOption {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const SERVICE_OPTIONS: ServiceOption[] = [
  { id: 'hdd_recovery', label: 'Hard Drive Recovery', description: 'Mechanical & platter-based drives', icon: HardDrive },
  { id: 'ssd_flash', label: 'SSD / Flash Recovery', description: 'Solid-state & NAND flash media', icon: Cpu },
  { id: 'raid_recovery', label: 'RAID Recovery', description: 'Multi-disk array reconstruction', icon: Server },
  { id: 'mobile_recovery', label: 'Mobile Device Recovery', description: 'Phones, tablets & embedded storage', icon: Smartphone },
  { id: 'forensic', label: 'Forensic Services', description: 'Evidence preservation & analysis', icon: Search },
  { id: 'tape_legacy', label: 'Tape / Legacy Media', description: 'Tape, optical & obsolete formats', icon: Archive },
];

export const CASE_VOLUME_OPTIONS = [
  { value: '1-10', label: '1–10 cases' },
  { value: '11-50', label: '11–50 cases' },
  { value: '51-100', label: '51–100 cases' },
  { value: '100+', label: '100+ cases' },
] as const;

export const step1Schema = z.object({
  companyName: z.string().min(2, 'Company name is required').max(100),
  slug: z.string().min(3, 'Slug must be at least 3 characters').max(50).regex(/^[a-z0-9\-]+$/, 'Only lowercase letters, numbers, and hyphens'),
});

export const step2Schema = z.object({
  countryId: z.string().min(1, 'Please select a country'),
  baseCurrencyCode: z.string().min(3, 'Please confirm your base currency'),
});

export const step3Schema = z.object({
  fullName: z.string().min(2, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Needs an uppercase letter')
    .regex(/[a-z]/, 'Needs a lowercase letter')
    .regex(/[0-9]/, 'Needs a number'),
  confirmPassword: z.string(),
  // Country Engine §9.5: the admin email must be verified (OTP) before the
  // account can be created. Wired to the existing send-otp-email edge fn.
  emailVerified: z.boolean().refine(v => v === true, { message: 'Please verify your email' }),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// Conditional jurisdiction step (rendered only when the selected country has a
// real tax system). Soft on the tax number — the soft/format validation runs in
// the step via validateTaxNumber(), so the schema only requires presence.
export const jurisdictionSchema = z.object({
  legalEntityType: z.string().min(1, 'Select a legal entity type'),
  taxNumber: z.string().min(1, 'Tax registration number is required'),
  fiscalYearStart: z.string().min(1, 'Confirm the fiscal year start'),
  timezone: z.string().min(1, 'Confirm the timezone'),
});

export const step4Schema = z.object({
  services: z.array(z.string()).min(1, 'Select at least one service'),
  estimatedCases: z.string().min(1, 'Select estimated monthly cases'),
  planId: z.string().min(1, 'Select a plan'),
});

export const STEP_SCHEMAS = [step1Schema, step2Schema, step3Schema, step4Schema];

export interface OnboardingFormData {
  companyName: string;
  slug: string;
  countryId: string;
  baseCurrencyCode: string;
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  emailVerified: boolean;
  // Country-driven jurisdiction capture (§9.2/§9.5). uiLanguage defaults from the
  // selected country language; '' means "let the DB sync trigger pick the default".
  uiLanguage: string;
  legalEntityType: string;
  taxNumber: string;
  fiscalYearStart: string;
  timezone: string;
  services: string[];
  estimatedCases: string;
  planId: string;
}

export const DEFAULT_FORM_DATA: OnboardingFormData = {
  companyName: '',
  slug: '',
  countryId: '',
  baseCurrencyCode: '',
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  emailVerified: false,
  uiLanguage: '',
  legalEntityType: '',
  taxNumber: '',
  fiscalYearStart: '',
  timezone: '',
  services: [],
  estimatedCases: '',
  planId: '',
};
