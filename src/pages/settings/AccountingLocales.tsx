import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  Globe,
  Lock,
  Coins,
  CalendarClock,
  FileText,
  MapPin,
  Info,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { RadioGroup } from '../../components/ui/RadioGroup';
import { Input } from '../../components/ui/Input';
import { useTenantConfig } from '../../contexts/TenantConfigContext';
import { useToast } from '../../hooks/useToast';
import { setTenantConfigOverrides } from '../../lib/tenantConfigService';
import { formatCurrencyWithConfig, renderCurrencyToken } from '../../lib/format';
import {
  SUPPORTED_LANGUAGES,
  getTranslation,
  type LanguageCode,
  type DocumentLanguageMode,
} from '../../lib/documentTranslations';
import { logger } from '../../lib/logger';
import {
  DISPLAY_MODE_OPTIONS,
  NEGATIVE_FORMAT_OPTIONS,
  POSITION_OPTIONS,
  DECIMAL_PLACES_OPTIONS,
  DECIMAL_SEPARATOR_OPTIONS,
  THOUSANDS_SEPARATOR_OPTIONS,
  TIME_FORMAT_OPTIONS,
  WEEK_START_OPTIONS,
  DATE_FORMAT_OPTIONS,
  TIMEZONE_OPTIONS,
  DAY_NAMES,
  draftFromResolved,
  collectDirtyOverrides,
  buildPreviewCurrencyConfig,
  previewDate,
  type DraftValues,
  type EditableKey,
} from './localizationCenter';

const TABS = [
  { key: 'regional', label: 'Regional', icon: MapPin },
  { key: 'currency', label: 'Currency', icon: Coins },
  { key: 'datetime', label: 'Date & Time', icon: CalendarClock },
  { key: 'document', label: 'Document', icon: FileText },
] as const;
type TabKey = (typeof TABS)[number]['key'];

// Numeric registry keys: native <select> emits strings, but the registry schema
// expects numbers — coerce on write so the override batch validates server-side.
const NUMERIC_KEYS = new Set<EditableKey>(['currency.decimal_places', 'datetime.week_starts_on']);

interface DocumentLanguageSettings {
  mode: DocumentLanguageMode;
  secondary_language: LanguageCode | null;
  language_name: string | null;
}
type LocalizationBag = { document_language_settings?: DocumentLanguageSettings } & Record<string, unknown>;
const ENGLISH_ONLY: DocumentLanguageSettings = { mode: 'english_only', secondary_language: null, language_name: null };

/** A jurisdiction-locked value: read-only, with the reason badged. */
const ReadOnlyField: React.FC<{ label: string; value: React.ReactNode; badge: string; hint?: string }> = ({
  label,
  value,
  badge,
  hint,
}) => {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span id={labelId} className="block text-sm font-medium text-slate-700">
          {label}
        </span>
        <Badge variant="secondary" size="sm">
          <Lock aria-hidden="true" className="me-1 h-3 w-3" />
          {badge}
        </Badge>
      </div>
      <div className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        {value || '—'}
      </div>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
};

const SectionCard: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({
  title,
  description,
  children,
}) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 className="text-base font-semibold text-slate-900">{title}</h2>
    {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
    <div className="mt-5">{children}</div>
  </section>
);

export const LocalizationCenter: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { config, refreshConfig } = useTenantConfig();
  const tenantId = config.tenantId;

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabKey | null;
  const activeTab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : 'regional';
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const resolvedDraft = useMemo<DraftValues>(
    () => draftFromResolved({ currency: config.currency, dateTime: config.dateTime }),
    [config],
  );
  const [draft, setDraft] = useState<DraftValues>(resolvedDraft);
  useEffect(() => setDraft(resolvedDraft), [resolvedDraft]);

  // Document-language lives in company_settings.localization (kept where the PDF
  // layer + useDocumentTranslations already read it — moved here, not migrated).
  const { data: companyRow } = useQuery({
    queryKey: ['company_settings_localization'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('id, localization')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; localization: LocalizationBag | null } | null;
    },
  });
  const docResolved = companyRow?.localization?.document_language_settings ?? ENGLISH_ONLY;
  const [docDraft, setDocDraft] = useState<DocumentLanguageSettings>(ENGLISH_ONLY);
  // Seed the doc draft from the loaded row exactly once. Re-seeding on every
  // companyRow change would clobber a user's unsaved selection if the query
  // refetched (focus/invalidate) mid-edit. Post-save, docDraft already equals the
  // saved value, so dirty resolves to false without a re-seed.
  const docSeededRef = useRef(false);
  useEffect(() => {
    if (companyRow && !docSeededRef.current) {
      setDocDraft(companyRow.localization?.document_language_settings ?? ENGLISH_ONLY);
      docSeededRef.current = true;
    }
  }, [companyRow]);

  const [isSaving, setIsSaving] = useState(false);

  const overrides = collectDirtyOverrides(draft, resolvedDraft);
  const docDirty = JSON.stringify(docDraft) !== JSON.stringify(docResolved);
  const fiscalYearStart = String(draft['datetime.fiscal_year_start']);
  const fyValid = /^\d{2}-\d{2}$/.test(fiscalYearStart);
  const dirty = Object.keys(overrides).length > 0 || docDirty;

  const updateDraft = (key: EditableKey, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: NUMERIC_KEYS.has(key) ? Number(value) : value }));

  const handleTabChange = (key: TabKey) => setSearchParams({ tab: key }, { replace: true });
  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    const last = TABS.length - 1;
    let next = index;
    if (e.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (e.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else return;
    e.preventDefault();
    handleTabChange(TABS[next].key);
    tabRefs.current[next]?.focus();
  };

  const handleSave = async () => {
    if (!dirty) return;
    if (Object.keys(overrides).length > 0 && !fyValid) {
      toast.error('Fiscal year start must be in MM-DD format (e.g. 01-01).');
      return;
    }
    if (!tenantId) {
      toast.error('Tenant is not configured; cannot save localization settings.');
      return;
    }
    setIsSaving(true);
    try {
      if (Object.keys(overrides).length > 0) {
        await setTenantConfigOverrides(tenantId, overrides);
      }
      if (docDirty) {
        const merged: LocalizationBag = {
          ...(companyRow?.localization ?? {}),
          document_language_settings: docDraft,
        };
        const { data: updated, error: updateError } = await supabase
          .from('company_settings')
          .update({ localization: merged } as never)
          .not('id', 'is', null)
          .select('id');
        if (updateError) throw updateError;
        if (!updated || updated.length === 0) {
          const { error: insertError } = await supabase
            .from('company_settings')
            .insert({ tenant_id: tenantId, localization: merged } as never);
          if (insertError) throw insertError;
        }
      }
      await Promise.all([
        refreshConfig(),
        queryClient.invalidateQueries({ queryKey: ['company_settings_localization'] }),
        queryClient.invalidateQueries({ queryKey: ['company_settings'] }),
      ]);
      toast.success('Localization settings saved');
    } catch (error) {
      logger.error('Failed to save localization settings:', error);
      toast.error((error as Error).message || 'Failed to save localization settings');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Currency preview ──
  const previewCurrency = buildPreviewCurrencyConfig(config.currency, draft);
  const positivePreview = formatCurrencyWithConfig(1234567.5, previewCurrency);
  const negativePreview = formatCurrencyWithConfig(-1234.5, previewCurrency);
  const tokenPreview = renderCurrencyToken(previewCurrency);

  // ── Date/Time preview + merged option lists ──
  const resolvedDateFmt = String(resolvedDraft['datetime.date_format']);
  const dateFormatOptions = DATE_FORMAT_OPTIONS.some((o) => o.value === resolvedDateFmt)
    ? DATE_FORMAT_OPTIONS
    : [{ value: resolvedDateFmt, label: `${resolvedDateFmt} (current)` }, ...DATE_FORMAT_OPTIONS];
  const resolvedTz = String(resolvedDraft['datetime.timezone']);
  const timezoneOptions = (TIMEZONE_OPTIONS.includes(resolvedTz) ? TIMEZONE_OPTIONS : [resolvedTz, ...TIMEZONE_OPTIONS]).map(
    (tz) => ({ value: tz, label: tz }),
  );
  const datePreview = previewDate(String(draft['datetime.date_format']));
  const timePreview = draft['datetime.time_format'] === '12h' ? '2:30 PM' : '14:30';
  const weekStartDay = DAY_NAMES[Number(draft['datetime.week_starts_on'])] ?? '—';

  const currencyCode = typeof config.currency.code === 'string' ? config.currency.code : 'Not configured';
  const localeCode = typeof config.locale.localeCode === 'string' ? config.locale.localeCode : 'Not configured';

  const onDocLanguageChange = (value: string) => {
    if (value === 'none') {
      setDocDraft(ENGLISH_ONLY);
      return;
    }
    const lang = SUPPORTED_LANGUAGES.find((l) => l.code === value);
    setDocDraft({ mode: 'bilingual', secondary_language: value as LanguageCode, language_name: lang?.name ?? null });
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate('/settings')}
          className="rounded-lg p-2 transition-colors hover:bg-slate-100"
          aria-label="Back to settings"
        >
          <ChevronLeft className="h-5 w-5 text-slate-600" />
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-md">
            <Globe className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="mb-0.5 text-xl font-bold text-slate-900">Localization Center</h1>
            <p className="text-sm text-slate-600">
              How currency, dates, and documents render across {config.countryName || 'your workspace'}.
            </p>
          </div>
        </div>
      </div>

      {/* Jurisdiction-vs-preference primer */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-info/30 bg-info-muted p-4">
        <Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-info" />
        <p className="text-sm text-slate-700">
          Fields marked <span className="font-semibold text-slate-900">Jurisdiction</span> are set by your country
          and can't be changed here. Everything else is a display preference you control. Changes apply across the
          app, your documents, and the customer portal.
        </p>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Localization settings" className="mb-6 flex w-fit gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.map((tab, index) => {
          const isActive = activeTab === tab.key;
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.key}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              role="tab"
              id={`loc-tab-${tab.key}`}
              aria-selected={isActive}
              aria-controls={`loc-panel-${tab.key}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => handleTabChange(tab.key)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
              className={`flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-all ${
                isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <TabIcon className="h-4 w-4" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Panels */}
      <div role="tabpanel" id={`loc-panel-${activeTab}`} aria-labelledby={`loc-tab-${activeTab}`} className="space-y-6">
        {activeTab === 'regional' && (
          <SectionCard title="Region & locale" description="Where this workspace operates. Region is set by your country configuration.">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <ReadOnlyField
                label="Country / region"
                value={`${config.countryName || '—'}${config.countryCode ? ` (${config.countryCode})` : ''}`}
                badge="Jurisdiction"
                hint="Managed by your country configuration."
              />
              <ReadOnlyField label="Locale code" value={localeCode} badge="Jurisdiction" />
              <Select
                label="Timezone"
                value={String(draft['datetime.timezone'])}
                onChange={(e) => updateDraft('datetime.timezone', e.target.value)}
                options={timezoneOptions}
                hint="Used for audit timestamps and scheduling."
              />
              <ReadOnlyField
                label="Interface language"
                value={config.locale.languageCode === 'ar' ? 'العربية (ar)' : config.locale.languageCode}
                badge="Appearance"
                hint="Change the UI language under Settings → Appearance."
              />
            </div>
          </SectionCard>
        )}

        {activeTab === 'currency' && (
          <>
            <SectionCard title="Currency display" description="How monetary amounts render on screen, in documents, and on the portal.">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <ReadOnlyField label="Base currency" value={currencyCode} badge="Jurisdiction" />
                <ReadOnlyField
                  label="Currency symbol"
                  value={config.currency.symbol || '—'}
                  badge="Jurisdiction"
                  hint="The glyph comes from your country. Use display mode to show the symbol, the code, or both."
                />
                <RadioGroup
                  name="currency-display-mode"
                  label="Display mode"
                  value={String(draft['currency.display_mode'])}
                  onChange={(v) => updateDraft('currency.display_mode', v)}
                  options={DISPLAY_MODE_OPTIONS}
                />
                <RadioGroup
                  name="currency-position"
                  label="Symbol position"
                  value={String(draft['currency.position'])}
                  onChange={(v) => updateDraft('currency.position', v)}
                  options={POSITION_OPTIONS}
                />
                <RadioGroup
                  name="currency-negative-format"
                  label="Negative amounts"
                  value={String(draft['currency.negative_format'])}
                  onChange={(v) => updateDraft('currency.negative_format', v)}
                  options={NEGATIVE_FORMAT_OPTIONS}
                />
                <Select
                  label="Decimal places"
                  value={String(draft['currency.decimal_places'])}
                  onChange={(e) => updateDraft('currency.decimal_places', e.target.value)}
                  options={DECIMAL_PLACES_OPTIONS}
                  hint="Display only — distinct from the statutory amount-in-words precision."
                />
                <Select
                  label="Decimal separator"
                  value={String(draft['currency.decimal_separator'])}
                  onChange={(e) => updateDraft('currency.decimal_separator', e.target.value)}
                  options={DECIMAL_SEPARATOR_OPTIONS}
                />
                <Select
                  label="Thousands separator"
                  value={String(draft['currency.thousands_separator'])}
                  onChange={(e) => updateDraft('currency.thousands_separator', e.target.value)}
                  options={THOUSANDS_SEPARATOR_OPTIONS}
                />
              </div>
            </SectionCard>
            <SectionCard title="Live preview" description="Exactly how amounts will appear with the settings above.">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div role="group" aria-label={`Positive amount preview: ${positivePreview}`} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Positive</div>
                  <div className="mt-1 font-mono text-lg text-slate-900" dir="auto">{positivePreview}</div>
                </div>
                <div role="group" aria-label={`Negative amount preview: ${negativePreview}`} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Negative</div>
                  <div className="mt-1 font-mono text-lg text-slate-900" dir="auto">{negativePreview}</div>
                </div>
                <div role="group" aria-label={`Currency token preview: ${tokenPreview}`} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Token</div>
                  <div className="mt-1 font-mono text-lg text-slate-900" dir="auto">{tokenPreview}</div>
                </div>
              </div>
            </SectionCard>
          </>
        )}

        {activeTab === 'datetime' && (
          <>
            <SectionCard title="Date & time" description="How dates and times render across the workspace.">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <Select
                  label="Date format"
                  value={String(draft['datetime.date_format'])}
                  onChange={(e) => updateDraft('datetime.date_format', e.target.value)}
                  options={dateFormatOptions}
                />
                <RadioGroup
                  name="time-format"
                  label="Time format"
                  value={String(draft['datetime.time_format'])}
                  onChange={(v) => updateDraft('datetime.time_format', v)}
                  options={TIME_FORMAT_OPTIONS}
                />
                <Select
                  label="Week starts on"
                  value={String(draft['datetime.week_starts_on'])}
                  onChange={(e) => updateDraft('datetime.week_starts_on', e.target.value)}
                  options={WEEK_START_OPTIONS}
                />
                <Input
                  label="Fiscal year start"
                  value={fiscalYearStart}
                  onChange={(e) => updateDraft('datetime.fiscal_year_start', e.target.value)}
                  placeholder="MM-DD"
                  hint="Month and day the fiscal year begins, e.g. 01-01 or 04-01."
                  error={!fyValid ? 'Use MM-DD format (e.g. 01-01).' : undefined}
                />
              </div>
            </SectionCard>
            <SectionCard title="Live preview">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div role="group" aria-label={`Date preview: ${datePreview}`} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Date</div>
                  <div className="mt-1 font-mono text-lg text-slate-900">{datePreview}</div>
                </div>
                <div role="group" aria-label={`Time preview: ${timePreview}`} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Time</div>
                  <div className="mt-1 font-mono text-lg text-slate-900">{timePreview}</div>
                </div>
                <div role="group" aria-label={`Week starts on ${weekStartDay}`} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Week starts</div>
                  <div className="mt-1 text-lg text-slate-900">{weekStartDay}</div>
                </div>
              </div>
            </SectionCard>
          </>
        )}

        {activeTab === 'document' && (
          <>
            <SectionCard
              title="Document language"
              description="Add a second language to printed and emailed documents. Headings and labels appear in both languages; content stays in English."
            >
              <div className="max-w-md">
                <Select
                  label="Document language mode"
                  value={docDraft.secondary_language ?? 'none'}
                  onChange={(e) => onDocLanguageChange(e.target.value)}
                  options={SUPPORTED_LANGUAGES.map((lang) => ({ value: lang.code ?? 'none', label: lang.displayName }))}
                  hint="Choose the language combination for your documents."
                />
              </div>

              {docDraft.mode === 'bilingual' && docDraft.secondary_language && (
                <div className="mt-5 rounded-lg border border-info/30 bg-info-muted p-4">
                  <h4 className="mb-2 text-sm font-semibold text-info">Preview</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between border-b border-info/30 pb-2 text-info">
                      <span className="font-medium">
                        QUOTATION | {getTranslation('quotation', docDraft.secondary_language)}
                      </span>
                    </div>
                    <div className="text-info">
                      <span className="font-medium">Customer Information</span> |{' '}
                      {getTranslation('customerInformation', docDraft.secondary_language)}
                    </div>
                    <p className="mt-3 text-xs italic text-info">
                      Only headings and labels appear in both languages. Content and customer data stay in English.
                    </p>
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Tax & resolved locale" description="Statutory values set by your jurisdiction.">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <ReadOnlyField label="Tax label" value={config.tax.label} badge="Jurisdiction" />
                <ReadOnlyField label="Default tax rate" value={`${config.tax.defaultRate}%`} badge="Jurisdiction" />
                <ReadOnlyField
                  label="Resolved document locale"
                  value={`${localeCode} · ${currencyCode} · ${String(draft['datetime.date_format'])}`}
                  badge="Derived"
                  hint="Composed from your locale, currency, and date settings."
                />
              </div>
            </SectionCard>
          </>
        )}
      </div>

      {/* Save bar — sticks to the bottom of the content column (no sidebar overlap) */}
      <div className="sticky bottom-0 z-20 mt-6 flex items-center justify-end gap-3 border-t border-slate-200 bg-white/90 px-1 py-3 backdrop-blur">
        {dirty && <span className="text-xs text-slate-500">Unsaved changes</span>}
        <Button onClick={handleSave} disabled={!dirty || isSaving} isLoading={isSaving} loadingLabel="Saving">
          {isSaving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
};
