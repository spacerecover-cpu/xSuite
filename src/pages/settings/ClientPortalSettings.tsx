import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import {
  getPortalSettings,
  updatePortalSettings,
  validatePortalUrl,
  generatePortalLoginUrl,
} from '../../lib/portalUrlService';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  Shield,
  Settings as SettingsIcon,
  AlertCircle,
  ExternalLink,
  Copy,
  CheckCheck,
  Loader2,
  Globe,
  Lock,
  Clock,
  Mail,
  FileText,
  Users,
} from 'lucide-react';

interface PortalSettings {
  portal_enabled: boolean;
  portal_base_url: string;
  portal_link_format: string;
  portal_session_timeout: number;
  portal_require_email_verification: boolean;
  portal_allow_self_registration: boolean;
  portal_terms_url: string;
  portal_privacy_url: string;
  portal_support_email: string;
  portal_support_phone: string;
  portal_maintenance_mode: boolean;
  portal_maintenance_message: string;
  portal_custom_logo_url: string;
  portal_show_company_info: boolean;
  portal_allow_case_creation: boolean;
  portal_allow_quote_requests: boolean;
  portal_allow_file_uploads: boolean;
  portal_max_file_size_mb: number;
}

export const ClientPortalSettings: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [testingUrl, setTestingUrl] = useState(false);
  const [testUrlResult, setTestUrlResult] = useState<{ success: boolean; message: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('portalSettings_openSections');
    return saved ? new Set(JSON.parse(saved)) : new Set(['base_config', 'security']);
  });

  const [formData, setFormData] = useState<PortalSettings>({
    portal_enabled: true,
    portal_base_url: '',
    portal_link_format: '/portal/login',
    portal_session_timeout: 1440,
    portal_require_email_verification: true,
    portal_allow_self_registration: false,
    portal_terms_url: '',
    portal_privacy_url: '',
    portal_support_email: '',
    portal_support_phone: '',
    portal_maintenance_mode: false,
    portal_maintenance_message: 'The portal is currently undergoing maintenance. Please check back soon.',
    portal_custom_logo_url: '',
    portal_show_company_info: true,
    portal_allow_case_creation: true,
    portal_allow_quote_requests: true,
    portal_allow_file_uploads: true,
    portal_max_file_size_mb: 50,
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ['portal_settings'],
    queryFn: async () => {
      const settings = await getPortalSettings();
      return settings;
    },
  });

  const { data: activeCustomersCount } = useQuery({
    queryKey: ['active_portal_customers_count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('customers_enhanced')
        .select('*', { count: 'exact', head: true })
        .eq('portal_enabled', true);

      if (error) throw error;
      return count || 0;
    },
  });

  useEffect(() => {
    if (settings && Object.keys(settings).length > 0) {
      // Merge with defaults so partially-saved jsonb columns keep sensible
      // values for fields that haven't been persisted yet. Replacing formData
      // outright leaves toggles as `checked={undefined}` (uncontrolled).
      setFormData(prev => ({ ...prev, ...(settings as Partial<PortalSettings>) }));
    }
  }, [settings]);

  useEffect(() => {
    const generatePreview = async () => {
      const url = await generatePortalLoginUrl();
      setPreviewUrl(url);
    };
    generatePreview();
  }, [formData.portal_base_url, formData.portal_link_format]);

  useEffect(() => {
    localStorage.setItem('portalSettings_openSections', JSON.stringify([...openSections]));
  }, [openSections]);

  const toggleSection = (sectionId: string) => {
    setOpenSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  const handleSave = async () => {
    const validation = validatePortalUrl(formData.portal_base_url);
    if (!validation.valid) {
      setUrlError(validation.error || 'Invalid URL');
      return;
    }

    setIsSaving(true);
    setUrlError(null);

    try {
      const result = await updatePortalSettings(formData);

      if (result.success) {
        setSaveSuccess(true);
        queryClient.invalidateQueries({ queryKey: ['portal_settings'] });
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setUrlError(result.error || 'Failed to save settings');
      }
    } catch (error: unknown) {
      setUrlError(error instanceof Error ? error.message : 'An error occurred while saving');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestUrl = async () => {
    if (!formData.portal_base_url || formData.portal_base_url.trim() === '') {
      setTestUrlResult({
        success: false,
        message: 'Please enter a portal base URL to test',
      });
      return;
    }

    const validation = validatePortalUrl(formData.portal_base_url);
    if (!validation.valid) {
      setTestUrlResult({
        success: false,
        message: validation.error || 'Invalid URL format',
      });
      return;
    }

    setTestingUrl(true);
    setTestUrlResult(null);

    try {
      const testUrl = `${formData.portal_base_url}${formData.portal_link_format}`;
      await fetch(testUrl, { method: 'HEAD', mode: 'no-cors' });

      setTestUrlResult({
        success: true,
        message: 'URL appears to be valid and accessible',
      });
    } catch (error) {
      setTestUrlResult({
        success: true,
        message: 'URL format is valid (accessibility cannot be verified due to CORS)',
      });
    } finally {
      setTestingUrl(false);
    }
  };

  const handleCopyPreviewUrl = async () => {
    await navigator.clipboard.writeText(previewUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const updateField = (field: keyof PortalSettings, value: string | boolean | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setUrlError(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="w-12 h-12 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/settings')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Client Portal Settings</h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure portal access, security, and customer-facing features
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : saveSuccess ? (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Saved
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Portal Status</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {formData.portal_enabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
            <div
              className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                formData.portal_enabled ? 'bg-success-muted' : 'bg-slate-100'
              }`}
            >
              <Shield
                className={`w-6 h-6 ${formData.portal_enabled ? 'text-success' : 'text-slate-400'}`}
              />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Active Customers</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {activeCustomersCount || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-info-muted rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-info" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Session Timeout</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {Math.floor(formData.portal_session_timeout / 60)}h
              </p>
            </div>
            <div className="w-12 h-12 bg-warning-muted rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-warning" />
            </div>
          </div>
        </Card>
      </div>

      {urlError && (
        <Card className="p-4 bg-danger-muted border-danger/30">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-danger">Error</h3>
              <p className="text-sm text-danger mt-1">{urlError}</p>
            </div>
          </div>
        </Card>
      )}

      {saveSuccess && (
        <Card className="p-4 bg-success-muted border-success/30">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-success">Settings Saved</h3>
              <p className="text-sm text-success mt-1">
                Portal settings have been updated successfully
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-4">
        <CollapsibleSection
          title="Portal Base Configuration"
          icon={Globe}
          color="rgb(var(--color-primary))"
          isOpen={openSections.has('base_config')}
          onToggle={() => toggleSection('base_config')}
        >
          <div className="space-y-6">
            <div className="bg-info-muted border border-info/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-info mb-1">Multi-Tenant Configuration</h4>
                  <p className="text-sm text-info">
                    When reselling this system to another company, they should configure their own portal
                    base URL here. If left empty, the system will use the current domain automatically.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 mb-4">
                <input
                  type="checkbox"
                  checked={formData.portal_enabled}
                  onChange={(e) => updateField('portal_enabled', e.target.checked)}
                  className="w-4 h-4 text-primary rounded focus:ring-2 focus:ring-primary"
                />
                <span className="text-sm font-semibold text-slate-700">Enable Client Portal</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Portal Base URL
              </label>
              <Input
                type="url"
                value={formData.portal_base_url}
                onChange={(e) => updateField('portal_base_url', e.target.value)}
                placeholder="https://portal.yourcompany.com or leave empty for auto-detect"
                className="w-full"
              />
              <p className="text-xs text-slate-500 mt-2">
                Custom domain for your client portal. Leave empty to use the current domain automatically.
                This ensures portal links work correctly when deploying to different environments.
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Portal Link Format
              </label>
              <Input
                type="text"
                value={formData.portal_link_format}
                onChange={(e) => updateField('portal_link_format', e.target.value)}
                placeholder="/portal/login"
                className="w-full"
              />
              <p className="text-xs text-slate-500 mt-2">
                URL path for the portal login page (e.g., /portal/login, /client-access)
              </p>
            </div>

            <div className="flex gap-3">
              <Button onClick={handleTestUrl} variant="secondary" disabled={testingUrl}>
                {testingUrl ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Test URL
                  </>
                )}
              </Button>
            </div>

            {testUrlResult && (
              <div
                className={`p-4 rounded-lg border ${
                  testUrlResult.success
                    ? 'bg-success-muted border-success/30'
                    : 'bg-danger-muted border-danger/30'
                }`}
              >
                <p
                  className={`text-sm ${
                    testUrlResult.success ? 'text-success' : 'text-danger'
                  }`}
                >
                  {testUrlResult.message}
                </p>
              </div>
            )}

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-slate-900">Preview Portal URL</h4>
                <Button variant="ghost" size="sm" onClick={handleCopyPreviewUrl}>
                  {copiedUrl ? (
                    <>
                      <CheckCheck className="w-4 h-4 mr-2" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <p className="text-sm text-slate-600 font-mono break-all">{previewUrl || 'Generating...'}</p>
              <p className="text-xs text-slate-500 mt-2">
                This is how portal URLs will be generated for your customers
              </p>
            </div>

            <div>
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={formData.portal_maintenance_mode}
                  onChange={(e) => updateField('portal_maintenance_mode', e.target.checked)}
                  className="w-4 h-4 text-primary rounded focus:ring-2 focus:ring-primary"
                />
                <span className="text-sm font-semibold text-slate-700">Maintenance Mode</span>
              </label>
              {formData.portal_maintenance_mode && (
                <div className="mt-3">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Maintenance Message
                  </label>
                  <textarea
                    value={formData.portal_maintenance_message}
                    onChange={(e) => updateField('portal_maintenance_message', e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              )}
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Security & Authentication"
          icon={Lock}
          color="rgb(var(--color-primary))"
          isOpen={openSections.has('security')}
          onToggle={() => toggleSection('security')}
        >
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Session Timeout (minutes)
              </label>
              <Input
                type="number"
                value={formData.portal_session_timeout}
                onChange={(e) => updateField('portal_session_timeout', parseInt(e.target.value) || 1440)}
                min={30}
                max={10080}
                className="w-full"
              />
              <p className="text-xs text-slate-500 mt-2">
                Time before customers are automatically logged out (30 minutes to 7 days)
              </p>
            </div>

            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.portal_require_email_verification}
                  onChange={(e) => updateField('portal_require_email_verification', e.target.checked)}
                  className="w-4 h-4 text-primary rounded focus:ring-2 focus:ring-primary"
                />
                <span className="text-sm font-semibold text-slate-700">
                  Require Email Verification
                </span>
              </label>
              <p className="text-xs text-slate-500 mt-2 ml-6">
                Customers must verify their email address before accessing the portal
              </p>
            </div>

            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.portal_allow_self_registration}
                  onChange={(e) => updateField('portal_allow_self_registration', e.target.checked)}
                  className="w-4 h-4 text-primary rounded focus:ring-2 focus:ring-primary"
                />
                <span className="text-sm font-semibold text-slate-700">
                  Allow Self Registration
                </span>
              </label>
              <p className="text-xs text-slate-500 mt-2 ml-6">
                Let customers create their own accounts without staff invitation
              </p>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Portal Features"
          icon={SettingsIcon}
          color="rgb(var(--color-primary))"
          isOpen={openSections.has('features')}
          onToggle={() => toggleSection('features')}
        >
          <div className="space-y-6">
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.portal_show_company_info}
                  onChange={(e) => updateField('portal_show_company_info', e.target.checked)}
                  className="w-4 h-4 text-primary rounded focus:ring-2 focus:ring-primary"
                />
                <span className="text-sm font-semibold text-slate-700">Show Company Information</span>
              </label>
            </div>

            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.portal_allow_case_creation}
                  onChange={(e) => updateField('portal_allow_case_creation', e.target.checked)}
                  className="w-4 h-4 text-primary rounded focus:ring-2 focus:ring-primary"
                />
                <span className="text-sm font-semibold text-slate-700">Allow Case Creation</span>
              </label>
            </div>

            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.portal_allow_quote_requests}
                  onChange={(e) => updateField('portal_allow_quote_requests', e.target.checked)}
                  className="w-4 h-4 text-primary rounded focus:ring-2 focus:ring-primary"
                />
                <span className="text-sm font-semibold text-slate-700">Allow Quote Requests</span>
              </label>
            </div>

            <div>
              <label className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  checked={formData.portal_allow_file_uploads}
                  onChange={(e) => updateField('portal_allow_file_uploads', e.target.checked)}
                  className="w-4 h-4 text-primary rounded focus:ring-2 focus:ring-primary"
                />
                <span className="text-sm font-semibold text-slate-700">Allow File Uploads</span>
              </label>

              {formData.portal_allow_file_uploads && (
                <div className="ml-6 space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Max File Size (MB)
                    </label>
                    <Input
                      type="number"
                      value={formData.portal_max_file_size_mb}
                      onChange={(e) =>
                        updateField('portal_max_file_size_mb', parseInt(e.target.value) || 50)
                      }
                      min={1}
                      max={500}
                      className="w-full"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Contact & Support"
          icon={Mail}
          color="rgb(var(--color-primary))"
          isOpen={openSections.has('contact')}
          onToggle={() => toggleSection('contact')}
        >
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Support Email
              </label>
              <Input
                type="email"
                value={formData.portal_support_email}
                onChange={(e) => updateField('portal_support_email', e.target.value)}
                placeholder="support@yourcompany.com"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Support Phone
              </label>
              <Input
                type="tel"
                value={formData.portal_support_phone}
                onChange={(e) => updateField('portal_support_phone', e.target.value)}
                placeholder="+1 234 567 8900"
                className="w-full"
              />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Legal & Compliance"
          icon={FileText}
          color="rgb(var(--color-primary))"
          isOpen={openSections.has('legal')}
          onToggle={() => toggleSection('legal')}
        >
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Terms & Conditions URL
              </label>
              <Input
                type="url"
                value={formData.portal_terms_url}
                onChange={(e) => updateField('portal_terms_url', e.target.value)}
                placeholder="https://yourcompany.com/terms"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Privacy Policy URL
              </label>
              <Input
                type="url"
                value={formData.portal_privacy_url}
                onChange={(e) => updateField('portal_privacy_url', e.target.value)}
                placeholder="https://yourcompany.com/privacy"
                className="w-full"
              />
            </div>
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
};
