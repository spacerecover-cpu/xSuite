import React, { useState, useEffect } from 'react';
import { Eye, Save, Bell, Globe, Shield } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/useToast';

interface PortalSettings {
  id?: string;
  case_id: string;
  // Real columns on case_portal_visibility (top-level booleans):
  is_visible: boolean;
  show_diagnostics: boolean;
  show_timeline: boolean;
  // Encoded into visible_fields text[] on save (no per-flag column exists):
  show_device_details: boolean;
  show_technical_details: boolean;
  show_device_password: boolean;
  show_important_data: boolean;
  show_accessories: boolean;
  show_status_updates: boolean;
  show_quotes: boolean;
  show_invoices: boolean;
  show_reports: boolean;
  show_attachments: boolean;
  auto_notify_status_change: boolean;
  auto_notify_quote_ready: boolean;
  auto_notify_device_ready: boolean;
  custom_message: string;
}

interface CasePortalTabProps {
  caseId: string;
  portalSettings: Partial<PortalSettings> | null;
}

const defaultSettings = (caseId: string): PortalSettings => ({
  case_id: caseId,
  is_visible: true,
  show_diagnostics: false,
  show_timeline: true,
  show_device_details: false,
  show_technical_details: false,
  show_device_password: false,
  show_important_data: true,
  show_accessories: false,
  show_status_updates: true,
  show_quotes: false,
  show_invoices: false,
  show_reports: false,
  show_attachments: false,
  auto_notify_status_change: false,
  auto_notify_quote_ready: false,
  auto_notify_device_ready: false,
  custom_message: '',
});

// Decode the DB row shape (`visible_fields text[]` + scalar columns) back
// into the boolean flag state the UI uses. The save path inverts this: any
// flag set to true is added as a string to `visible_fields`. This makes the
// toggles round-trip even though the DB doesn't have a column per flag.
function decodePortalSettings(
  caseId: string,
  raw: Partial<PortalSettings> | null
): PortalSettings {
  const base = defaultSettings(caseId);
  if (!raw) return base;

  const rawRec = raw as unknown as Record<string, unknown>;
  const visibleFields = rawRec.visible_fields;
  const flagNames: string[] = Array.isArray(visibleFields)
    ? (visibleFields as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];

  const flagKeys: Array<keyof PortalSettings> = [
    'show_device_details',
    'show_technical_details',
    'show_device_password',
    'show_important_data',
    'show_accessories',
    'show_status_updates',
    'show_quotes',
    'show_invoices',
    'show_reports',
    'show_attachments',
    'auto_notify_status_change',
    'auto_notify_quote_ready',
    'auto_notify_device_ready',
  ];

  const decoded: PortalSettings = { ...base };
  for (const k of flagKeys) {
    (decoded as unknown as Record<string, unknown>)[k] = flagNames.includes(k as string);
  }
  // Top-level real columns. Null/undefined falls back to the defaultSettings
  // value (is_visible defaults true so an unset row still appears in the
  // portal, matching prior behavior).
  if (typeof rawRec.is_visible === 'boolean') decoded.is_visible = rawRec.is_visible;
  if (typeof rawRec.show_diagnostics === 'boolean') decoded.show_diagnostics = rawRec.show_diagnostics;
  if (typeof rawRec.show_timeline === 'boolean') decoded.show_timeline = rawRec.show_timeline;
  decoded.custom_message = (raw.custom_message as string) || '';
  return decoded;
}

export const CasePortalTab: React.FC<CasePortalTabProps> = ({ caseId, portalSettings }) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<PortalSettings>(() =>
    decodePortalSettings(caseId, portalSettings)
  );

  useEffect(() => {
    setSettings(decodePortalSettings(caseId, portalSettings));
  }, [portalSettings, caseId]);

  const saveMutation = useMutation({
    mutationFn: async (data: PortalSettings) => {
      // case_portal_visibility real columns: is_visible, visible_fields
      // (text[]), show_diagnostics, show_timeline, custom_message. The
      // three booleans (is_visible / show_diagnostics / show_timeline) and
      // custom_message map directly to columns. All other show_*/auto_*
      // UI flags have no dedicated column and are encoded into the
      // visible_fields text[] (the encoded subset round-trips via
      // decodePortalSettings on next load).
      const {
        id: _id,
        case_id: _cid,
        custom_message,
        is_visible,
        show_diagnostics,
        show_timeline,
        ...encodedFlags
      } = data;
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = user
        ? await supabase.from('profiles').select('tenant_id').eq('id', user.id).maybeSingle()
        : { data: null };
      if (!profile?.tenant_id) throw new Error('No active tenant');
      const visibleFlagNames = Object.entries(encodedFlags as Record<string, unknown>)
        .filter(([, v]) => v === true)
        .map(([k]) => k);
      const { error } = await supabase
        .from('case_portal_visibility')
        .upsert({
          tenant_id: profile.tenant_id,
          case_id: caseId,
          is_visible,
          show_diagnostics,
          show_timeline,
          visible_fields: visibleFlagNames,
          custom_message,
        }, { onConflict: 'case_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Portal settings saved');
      queryClient.invalidateQueries({ queryKey: ['case_portal_visibility', caseId] });
    },
    onError: (err: unknown) => {
      toast.error(`Failed to save portal settings: ${err instanceof Error ? err.message : 'Unknown error'}`);
    },
  });

  const toggle = (field: keyof PortalSettings) => {
    setSettings(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const visibilitySettings: { key: keyof PortalSettings; label: string; description: string }[] = [
    { key: 'show_device_details', label: 'Device Details', description: 'Allow customer to see device specifications' },
    { key: 'show_technical_details', label: 'Technical Details', description: 'Show technical information and findings' },
    { key: 'show_device_password', label: 'Device Password', description: 'Show device password in the portal' },
    { key: 'show_important_data', label: 'Important Data', description: 'Display important data description' },
    { key: 'show_accessories', label: 'Accessories', description: 'Show device accessories list' },
    { key: 'show_status_updates', label: 'Status Updates', description: 'Display case status in the portal' },
    { key: 'show_quotes', label: 'Quotes', description: 'Display quotes and pricing information' },
    { key: 'show_invoices', label: 'Invoices', description: 'Show invoices and payment details' },
    { key: 'show_reports', label: 'Reports', description: 'Display case reports marked as visible' },
    { key: 'show_attachments', label: 'Attachments', description: 'Allow customer to view shared files' },
  ];

  const notificationSettings: { key: keyof PortalSettings; label: string; description: string }[] = [
    { key: 'auto_notify_status_change', label: 'Status Change Notifications', description: 'Send automatic emails on status updates' },
    { key: 'auto_notify_quote_ready', label: 'Quote Ready Notifications', description: 'Notify customer when a quote is ready' },
    { key: 'auto_notify_device_ready', label: 'Device Ready Notifications', description: 'Notify customer when device is ready for pickup' },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                Client Portal Visibility
              </h2>
              <p className="text-sm text-slate-500 mt-1">Control what the customer can see in their portal</p>
            </div>
            <Button
              onClick={() => saveMutation.mutate(settings)}
              style={{ backgroundColor: 'rgb(var(--color-success))' }}
              disabled={saveMutation.isPending}
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>

          <div className="mb-6 p-4 bg-info-muted/40 rounded-lg border border-info/20">
            <div className="flex items-start justify-between">
              <div className="pr-4">
                <p className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary" />
                  Show this case in customer portal
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  Master switch. When off, the customer cannot see this case at all, regardless of the per-field toggles below.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.is_visible}
                aria-label="Show case in portal"
                onClick={() => toggle('is_visible')}
                className={`w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 flex-shrink-0 ${settings.is_visible ? 'bg-primary' : 'bg-slate-300'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full shadow mt-1 transition-transform ${settings.is_visible ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              {([
                { key: 'show_diagnostics' as const, label: 'Diagnostics Section', description: 'Show diagnostic findings panel in the portal' },
                { key: 'show_timeline' as const, label: 'Case Timeline', description: 'Show the case progress timeline in the portal' },
              ]).map(({ key, label, description }) => {
                const isOn = !!settings[key];
                return (
                  <div
                    key={key}
                    className="flex items-start justify-between p-3 bg-white rounded-lg border border-info/20"
                  >
                    <label htmlFor={`top-${key}`} className="flex-1 pr-4 cursor-pointer">
                      <p className="font-medium text-slate-900 text-sm">{label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{description}</p>
                    </label>
                    <button
                      id={`top-${key}`}
                      type="button"
                      role="switch"
                      aria-checked={isOn}
                      aria-label={label}
                      onClick={() => toggle(key)}
                      className={`w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 flex-shrink-0 ${isOn ? 'bg-primary' : 'bg-slate-300'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full shadow mt-1 transition-transform ${isOn ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-3 uppercase tracking-wider">
              <Eye className="w-4 h-4 text-primary" />
              Visibility Settings
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {visibilitySettings.map(({ key, label, description }) => {
                const isOn = !!settings[key];
                return (
                  <div
                    key={key}
                    className="flex items-start justify-between p-3 bg-slate-50 rounded-lg hover:bg-info-muted transition-colors border border-transparent hover:border-info/30"
                  >
                    <label htmlFor={`vis-${key}`} className="flex-1 pr-4 cursor-pointer">
                      <p className="font-medium text-slate-900 text-sm">{label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{description}</p>
                    </label>
                    <div className="relative flex-shrink-0">
                      <button
                        id={`vis-${key}`}
                        type="button"
                        role="switch"
                        aria-checked={isOn}
                        aria-label={label}
                        onClick={() => toggle(key)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggle(key);
                          }
                        }}
                        className={`w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${isOn ? 'bg-primary' : 'bg-slate-300'}`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full shadow mt-1 transition-transform ${isOn ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-3 uppercase tracking-wider">
              <Bell className="w-4 h-4 text-warning" />
              Notification Settings
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {notificationSettings.map(({ key, label, description }) => {
                const isOn = !!settings[key];
                return (
                  <div
                    key={key}
                    className="flex items-start justify-between p-3 bg-slate-50 rounded-lg hover:bg-warning-muted transition-colors border border-transparent hover:border-warning/30"
                  >
                    <label htmlFor={`notif-${key}`} className="flex-1 pr-4 cursor-pointer">
                      <p className="font-medium text-slate-900 text-sm">{label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{description}</p>
                    </label>
                    <div className="relative flex-shrink-0">
                      <button
                        id={`notif-${key}`}
                        type="button"
                        role="switch"
                        aria-checked={isOn}
                        aria-label={label}
                        onClick={() => toggle(key)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggle(key);
                          }
                        }}
                        className={`w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-warning/40 ${isOn ? 'bg-warning' : 'bg-slate-300'}`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full shadow mt-1 transition-transform ${isOn ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-3 uppercase tracking-wider">
              <Shield className="w-4 h-4 text-slate-500" />
              Custom Message to Customer
            </h3>
            <textarea
              value={settings.custom_message}
              onChange={(e) => setSettings(prev => ({ ...prev, custom_message: e.target.value }))}
              placeholder="Optional message displayed to the customer in the portal (e.g., special instructions, updates)..."
              rows={4}
              className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
            />
          </div>

          <div className="flex justify-end mt-4 pt-4 border-t border-slate-100">
            <Button
              onClick={() => saveMutation.mutate(settings)}
              style={{ backgroundColor: 'rgb(var(--color-success))' }}
              disabled={saveMutation.isPending}
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
