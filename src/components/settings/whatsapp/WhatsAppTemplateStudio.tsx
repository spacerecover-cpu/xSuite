import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink, Image, LayoutTemplate, Phone, Plus, Reply, X } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Textarea } from '../../ui/Textarea';
import { SearchableSelect } from '../../ui/SearchableSelect';
import { WhatsAppBubblePreview } from './WhatsAppBubblePreview';
import { whatsappKeys, templateKeys } from '../../../lib/queryKeys';
import { saveDraftTemplate, whatsappAdmin, type WhatsAppTemplate } from '../../../lib/whatsappService';
import { getVariableRegistry } from '../../../lib/templateContextService';
import { getOrCreateCompanySettings } from '../../../lib/companySettingsService';
import { useTenantConfig, useCurrencyConfig } from '../../../contexts/TenantConfigContext';
import { formatCurrencyWithConfig } from '../../../lib/format';
import { supabase } from '../../../lib/supabaseClient';
import type { Database, Json } from '../../../types/database.types';

// Chips must stay in lockstep with the whatsapp-send worker's buildContext —
// a key outside this list would render as "—" in real messages.
const SUPPORTED_CONTEXT_KEYS = [
  'company.name', 'company.phone', 'company.email',
  'customer.name',
  'case.number', 'case.status', 'case.recovery_outcome', 'case.engineer', 'technician.name',
  'branch.name', 'case.tracking_link', 'device.summary', 'device.count', 'case.collection_date',
  'quote.number', 'quote.total', 'quote.expiry_date',
  'invoice.number', 'invoice.total', 'invoice.balance_due', 'invoice.due_date',
] as const;

const URL_BUTTON_CONTEXT_KEYS = ['case.tracking_link', 'case.number'] as const;

const paramNameOf = (contextKey: string) => contextKey.replace(/\./g, '_');
const AUTO_PARAM_TO_KEY: Record<string, string> = Object.fromEntries(
  SUPPORTED_CONTEXT_KEYS.map((k) => [paramNameOf(k), k]),
);

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 512);

interface TemplateComponent {
  type: string;
  format?: string;
  text?: string;
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
}

interface ButtonDraft {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  baseUrl: string;
  contextKey: string;
  phone: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Family head row when editing; APPROVED/PENDING rows open the edit-as-new-version flow. */
  template?: WhatsAppTemplate | null;
}

export function WhatsAppTemplateStudio({ isOpen, onClose, template }: Props) {
  const qc = useQueryClient();
  const { config } = useTenantConfig();
  const currency = useCurrencyConfig();
  const tenantId = config?.tenantId ?? '';
  const nameRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const isDraftEdit = !!template && template.status === 'DRAFT';
  const isVersionEdit = !!template && template.status !== 'DRAFT';
  const lastSyncedMs = template?.last_synced_at ? new Date(template.last_synced_at).getTime() : null;
  const editLocked = isVersionEdit && lastSyncedMs !== null && Date.now() - lastSyncedMs < 24 * 60 * 60 * 1000;

  const parsed = useMemo(() => {
    const comps = ((template?.components ?? []) as TemplateComponent[]);
    const header = comps.find((c) => c.type === 'HEADER');
    const varMap = (template?.variable_map ?? {}) as Record<string, string>;
    const buttons: ButtonDraft[] = (comps.find((c) => c.type === 'BUTTONS')?.buttons ?? []).map((b, i) => {
      if (b.type === 'URL') {
        const dynamic = (b.url ?? '').endsWith('{{1}}');
        return {
          type: 'URL' as const, text: b.text,
          baseUrl: dynamic ? (b.url ?? '').slice(0, -'{{1}}'.length) : (b.url ?? ''),
          contextKey: varMap[`button_url_${i + 1}`] ?? '', phone: '',
        };
      }
      if (b.type === 'PHONE_NUMBER') {
        return { type: 'PHONE_NUMBER' as const, text: b.text, baseUrl: '', contextKey: '', phone: b.phone_number ?? '' };
      }
      return { type: 'QUICK_REPLY' as const, text: b.text, baseUrl: '', contextKey: '', phone: '' };
    });
    return {
      body: comps.find((c) => c.type === 'BODY')?.text ?? '',
      footer: comps.find((c) => c.type === 'FOOTER')?.text ?? '',
      headerMode: header ? (header.format === 'IMAGE' ? 'logo' : 'text') : 'none',
      headerText: header?.format === 'TEXT' ? header.text ?? '' : '',
      buttons,
      varMap,
    };
  }, [template]);

  const [displayName, setDisplayName] = useState(template?.name ?? '');
  const [language, setLanguage] = useState(template?.language ?? 'en');
  const [category, setCategory] = useState(template?.category ?? 'UTILITY');
  const [bodyText, setBodyText] = useState(parsed.body);
  const [footerText, setFooterText] = useState(parsed.footer);
  const [headerMode, setHeaderMode] = useState<'none' | 'text' | 'logo'>(parsed.headerMode as 'none' | 'text' | 'logo');
  const [headerText, setHeaderText] = useState(parsed.headerText);
  const [buttons, setButtons] = useState<ButtonDraft[]>(parsed.buttons);
  const [varMap, setVarMap] = useState<Record<string, string>>(parsed.varMap);
  const [unsubRemoved, setUnsubRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const metaName = isVersionEdit ? (template?.name ?? '') : slugify(displayName);

  const { data: languages } = useQuery({
    queryKey: [...whatsappKeys.all, 'geo-languages'] as const,
    queryFn: async () => {
      const { data, error: qErr } = await supabase.from('geo_languages')
        .select('code, name').eq('is_active', true).order('name');
      if (qErr) throw qErr;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const { data: registry } = useQuery({
    queryKey: templateKeys.variables(),
    queryFn: getVariableRegistry,
    staleTime: 5 * 60 * 1000,
  });
  const { data: companySettings } = useQuery({
    queryKey: [...whatsappKeys.all, 'company-branding'] as const,
    queryFn: getOrCreateCompanySettings,
    staleTime: 5 * 60 * 1000,
  });
  const logoUrl = companySettings?.branding?.logo_url ?? '';
  const companyName = companySettings?.basic_info?.company_name ?? '';

  const chips = useMemo(() => {
    const catalog = (registry ?? []).filter((v) =>
      (SUPPORTED_CONTEXT_KEYS as readonly string[]).includes(v.variableKey));
    if (catalog.length > 0) return catalog;
    return SUPPORTED_CONTEXT_KEYS.map((key) => ({
      variableKey: key,
      name: key.split('.').slice(-1)[0].replace(/_/g, ' '),
      category: key.split('.')[0],
      description: null,
    }));
  }, [registry]);

  // MARKETING templates ship with an opt-out quick reply unless deliberately removed
  useEffect(() => {
    if (category !== 'MARKETING' || unsubRemoved) return;
    setButtons((prev) => {
      const hasUnsub = prev.some((b) => b.type === 'QUICK_REPLY' && /unsubscribe|stop/i.test(b.text));
      if (hasUnsub || prev.length >= 3) return prev;
      return [...prev, { type: 'QUICK_REPLY', text: 'Unsubscribe', baseUrl: '', contextKey: '', phone: '' }];
    });
  }, [category, unsubRemoved]);

  const sampleValues = useMemo(() => {
    const byContext: Record<string, string> = {
      'company.name': companyName || 'Acme Data Recovery',
      'company.phone': '+971 4 000 0000',
      'company.email': 'lab@example.com',
      'customer.name': 'Ali Hassan',
      'case.number': 'CASE-0042',
      'case.status': 'Ready for Collection',
      'case.recovery_outcome': 'full',
      'case.engineer': 'Sara K.',
      'technician.name': 'Sara K.',
      'branch.name': 'Downtown Lab',
      'case.tracking_link': 'https://portal.example.com/track/CASE-0042',
      'device.summary': 'WD My Passport 2TB +1 more',
      'device.count': '2',
      'case.collection_date': '30 Jul 2026',
      'quote.number': 'QT-0108',
      'quote.total': formatCurrencyWithConfig(1250, currency),
      'quote.expiry_date': '05 Aug 2026',
      'invoice.number': 'INV-0077',
      'invoice.total': formatCurrencyWithConfig(1250, currency),
      'invoice.balance_due': formatCurrencyWithConfig(450, currency),
      'invoice.due_date': '10 Aug 2026',
    };
    const out: Record<string, string> = {};
    for (const [param, key] of Object.entries({ ...AUTO_PARAM_TO_KEY, ...varMap })) {
      const sample = byContext[key];
      if (sample) out[param] = sample;
    }
    return out;
  }, [varMap, companyName, currency]);

  const insertChip = (contextKey: string) => {
    const param = paramNameOf(contextKey);
    const token = `{{${param}}}`;
    const el = bodyRef.current;
    setVarMap((m) => ({ ...m, [param]: contextKey }));
    if (el) {
      const start = el.selectionStart ?? bodyText.length;
      const end = el.selectionEnd ?? bodyText.length;
      setBodyText(bodyText.slice(0, start) + token + bodyText.slice(end));
      requestAnimationFrame(() => {
        el.focus();
        el.selectionStart = el.selectionEnd = start + token.length;
      });
    } else {
      setBodyText((b) => b + token);
    }
  };

  const effectiveVarMap = useMemo(() => {
    const params = [...`${headerMode === 'text' ? headerText : ''}\n${bodyText}`.matchAll(/\{\{\s*([\w]+)\s*\}\}/g)]
      .map((m) => m[1]);
    const map: Record<string, string> = {};
    for (const p of [...new Set(params)]) {
      const key = varMap[p] ?? AUTO_PARAM_TO_KEY[p];
      if (key) map[p] = key;
    }
    buttons.forEach((b, i) => {
      if (b.type === 'URL' && b.contextKey) map[`button_url_${i + 1}`] = b.contextKey;
    });
    return map;
  }, [bodyText, headerText, headerMode, varMap, buttons]);

  const validate = (): string | null => {
    if (!/^[a-z0-9_]{1,512}$/.test(metaName)) {
      return 'Template name must contain only lowercase letters, numbers, and underscores.';
    }
    if (!language) return 'Choose a language.';
    if (!bodyText.trim()) return 'Body text is required.';
    if (bodyText.length > 1024) return 'Body must be 1,024 characters or fewer.';
    if (/\}\}\{\{/.test(bodyText)) return 'Variables cannot be adjacent — separate {{...}} placeholders with text.';
    const params = [...`${headerMode === 'text' ? headerText : ''}\n${bodyText}`.matchAll(/\{\{\s*([\w]+)\s*\}\}/g)]
      .map((m) => m[1]);
    for (const p of [...new Set(params)]) {
      if (!effectiveVarMap[p]) return `Variable {{${p}}} is not bound to a data field — insert it with a chip.`;
    }
    if (headerMode === 'text' && !headerText.trim()) return 'Header text is required (or set the header to None).';
    if (headerMode === 'logo' && !logoUrl) {
      return 'Upload a company logo (Settings → General Settings → Branding) before using an image header.';
    }
    for (const b of buttons) {
      if (!b.text.trim()) return 'Every button needs a label.';
      if (b.type === 'URL' && !b.baseUrl.trim()) return 'URL buttons need a base URL.';
      if (b.type === 'PHONE_NUMBER' && !b.phone.trim()) return 'Phone buttons need a phone number.';
    }
    return null;
  };

  const buildComponents = (): Json => {
    const comps: TemplateComponent[] = [];
    if (headerMode === 'text') comps.push({ type: 'HEADER', format: 'TEXT', text: headerText });
    if (headerMode === 'logo') comps.push({ type: 'HEADER', format: 'IMAGE' });
    comps.push({ type: 'BODY', text: bodyText });
    if (footerText.trim()) comps.push({ type: 'FOOTER', text: footerText });
    if (buttons.length > 0) {
      comps.push({
        type: 'BUTTONS',
        buttons: buttons.map((b) =>
          b.type === 'QUICK_REPLY' ? { type: 'QUICK_REPLY', text: b.text }
            : b.type === 'URL'
              ? { type: 'URL', text: b.text, url: b.contextKey ? `${b.baseUrl}{{1}}` : b.baseUrl }
              : { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone }),
      });
    }
    return comps as unknown as Json;
  };

  const persist = async (): Promise<{ id: string }> => {
    const row: Database['public']['Tables']['whatsapp_templates']['Insert'] = {
      tenant_id: tenantId,
      name: metaName,
      language,
      category,
      parameter_format: 'named',
      components: buildComponents(),
      variable_map: effectiveVarMap as Json,
      event_key: template?.event_key ?? null,
      status: 'DRAFT',
    };
    if (isDraftEdit && template) {
      const { error: upErr } = await supabase.from('whatsapp_templates')
        .update({
          name: metaName, language, category,
          components: buildComponents(), variable_map: effectiveVarMap as Json,
        })
        .eq('id', template.id);
      if (upErr) throw upErr;
      return { id: template.id };
    }
    if (isVersionEdit && template) {
      const clone = await saveDraftTemplate({ ...row, version: (template.version ?? 1) + 1 });
      const { error: linkErr } = await supabase.from('whatsapp_templates')
        .update({ superseded_by: clone.id }).eq('id', template.id);
      if (linkErr) throw linkErr;
      return clone;
    }
    return saveDraftTemplate(row);
  };

  const saveDraft = useMutation({
    mutationFn: persist,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: whatsappKeys.templates() });
      onClose();
    },
    onError: (e) => setError((e as Error).message),
  });
  const submit = useMutation({
    mutationFn: async () => {
      const saved = await persist();
      await whatsappAdmin('submit_template', { tenantId, templateId: saved.id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: whatsappKeys.templates() });
      onClose();
    },
    onError: (e) => setError((e as Error).message),
  });

  const onSubmitClick = () => {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setError(null);
    submit.mutate();
  };
  const onSaveClick = () => {
    if (!/^[a-z0-9_]{1,512}$/.test(metaName)) {
      setError('Template name must contain only lowercase letters, numbers, and underscores.');
      return;
    }
    setError(null);
    saveDraft.mutate();
  };

  const busy = saveDraft.isPending || submit.isPending;
  const title = isVersionEdit ? 'Edit Template (new version)' : isDraftEdit ? 'Edit Template' : 'New Template';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={LayoutTemplate}
      titleSize="sm"
      maxWidth="4xl"
      showClose
      closeOnBackdrop={false}
      initialFocusRef={nameRef}
      headerAction={metaName ? (
        <span className="flex items-center gap-1.5 rounded-md border border-info/30 bg-info-muted px-2 py-1">
          <span className="text-xxs font-medium uppercase tracking-wide text-slate-500">Meta name</span>
          <span className="font-mono text-xs font-semibold text-info">{metaName}</span>
        </span>
      ) : undefined}
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          {!isVersionEdit && (
            <Button variant="secondary" size="sm" onClick={onSaveClick} disabled={busy} isLoading={saveDraft.isPending}>
              Save draft
            </Button>
          )}
          <Button size="sm" onClick={onSubmitClick} disabled={busy || editLocked} isLoading={submit.isPending}>
            {isVersionEdit ? 'Submit new version' : 'Submit to Meta'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-6">
          {isVersionEdit && (
            <div className="rounded-lg border border-warning/40 bg-warning-muted p-3 text-xs text-warning">
              Editing an approved template submits a new version to Meta for review.
              Meta allows at most 10 edits per 30 days and 1 edit per 24 hours.
              {editLocked && ' This template was synced or edited in the last 24 hours — try again later.'}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              ref={nameRef}
              floatingLabel
              label="Template name"
              value={displayName}
              disabled={isVersionEdit}
              placeholder="e.g. Ready for collection"
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <SearchableSelect
              floatingLabel
              label="Language"
              value={language}
              disabled={isVersionEdit}
              onChange={setLanguage}
              options={(languages ?? []).map((l) => ({ id: l.code, name: `${l.name} (${l.code})` }))}
              placeholder="Select language"
            />
          </div>
          <div>
            <div className="flex gap-2">
              {(['UTILITY', 'MARKETING'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    category === c
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-slate-200 text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Promotional wording in a UTILITY template will be recategorized by Meta as MARKETING and billed accordingly.
              {category === 'MARKETING' && ' Marketing messages require the customer’s marketing consent.'}
            </p>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap gap-1">
              {chips.map((v) => (
                <button
                  key={v.variableKey}
                  type="button"
                  onClick={() => insertChip(v.variableKey)}
                  title={v.description ?? v.variableKey}
                  className="rounded-full bg-primary/10 px-2 py-0.5 text-xxs font-medium text-primary hover:bg-primary/20"
                >
                  {v.name}
                </button>
              ))}
            </div>
            <Textarea
              ref={bodyRef}
              floatingLabel
              label="Message body"
              rows={7}
              value={bodyText}
              maxLength={1024}
              placeholder="Hello {{customer_name}}, your case {{case_number}}..."
              onChange={(e) => setBodyText(e.target.value)}
            />
            <p className="mt-1 text-right text-xxs text-slate-400">{bodyText.length}/1024</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 flex gap-2">
                {([['none', 'No header'], ['text', 'Text'], ['logo', 'Company logo']] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setHeaderMode(mode)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      headerMode === mode
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-slate-200 text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {mode === 'logo' && <Image className="h-3 w-3" />} {label}
                  </button>
                ))}
              </div>
              {headerMode === 'text' && (
                <Input floatingLabel label="Header text" value={headerText} maxLength={60}
                  onChange={(e) => setHeaderText(e.target.value)} />
              )}
              {headerMode === 'logo' && (
                logoUrl
                  ? <p className="text-xs text-slate-500">Messages open with your company logo (from Branding settings).</p>
                  : <p className="flex items-center gap-1 text-xs text-warning">
                      <AlertTriangle className="h-3 w-3" /> No logo configured — upload one in General Settings → Branding.
                    </p>
              )}
            </div>
            <Input floatingLabel label="Footer (optional)" value={footerText} maxLength={60}
              placeholder="e.g. {{company_name}} — Data Recovery"
              onChange={(e) => setFooterText(e.target.value)} />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Buttons</span>
              <button
                type="button"
                disabled={buttons.length >= 3}
                onClick={() => setButtons((b) => [...b, { type: 'QUICK_REPLY', text: '', baseUrl: '', contextKey: '', phone: '' }])}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary disabled:opacity-40"
              >
                <Plus className="h-3 w-3" /> Add button
              </button>
            </div>
            {buttons.length === 0 && <p className="text-xs text-slate-400">No buttons — up to 3 rows.</p>}
            <div className="space-y-2">
              {buttons.map((b, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2">
                  <select
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
                    value={b.type}
                    onChange={(e) => setButtons((prev) => prev.map((x, j) =>
                      j === i ? { ...x, type: e.target.value as ButtonDraft['type'] } : x))}
                  >
                    <option value="QUICK_REPLY">Quick reply</option>
                    <option value="URL">URL</option>
                    <option value="PHONE_NUMBER">Phone</option>
                  </select>
                  <input
                    className="w-32 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
                    placeholder="Label"
                    maxLength={25}
                    value={b.text}
                    onChange={(e) => setButtons((prev) => prev.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
                  />
                  {b.type === 'URL' && (
                    <>
                      <input
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
                        placeholder="https://example.com/track/"
                        value={b.baseUrl}
                        onChange={(e) => setButtons((prev) => prev.map((x, j) => j === i ? { ...x, baseUrl: e.target.value } : x))}
                      />
                      <select
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
                        value={b.contextKey}
                        title="Dynamic suffix appended to the URL at send time"
                        onChange={(e) => setButtons((prev) => prev.map((x, j) => j === i ? { ...x, contextKey: e.target.value } : x))}
                      >
                        <option value="">Static URL</option>
                        {URL_BUTTON_CONTEXT_KEYS.map((k) => <option key={k} value={k}>+ {k}</option>)}
                      </select>
                    </>
                  )}
                  {b.type === 'PHONE_NUMBER' && (
                    <input
                      className="w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
                      placeholder="+9714XXXXXXX"
                      value={b.phone}
                      onChange={(e) => setButtons((prev) => prev.map((x, j) => j === i ? { ...x, phone: e.target.value } : x))}
                    />
                  )}
                  <button
                    type="button"
                    aria-label="Remove button"
                    className="rounded p-1 text-slate-400 hover:text-danger"
                    onClick={() => {
                      if (category === 'MARKETING' && b.type === 'QUICK_REPLY' && /unsubscribe|stop/i.test(b.text)) {
                        setUnsubRemoved(true);
                      }
                      setButtons((prev) => prev.filter((_, j) => j !== i));
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {category === 'MARKETING' && unsubRemoved
              && !buttons.some((b) => b.type === 'QUICK_REPLY' && /unsubscribe|stop/i.test(b.text)) && (
              <p className="mt-2 flex items-center gap-1 text-xs text-warning">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Meta policy expects marketing templates to offer an opt-out. Removing Unsubscribe risks user reports and a quality-rating drop.
              </p>
            )}
          </div>

          {error && (
            <p className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-muted p-3 text-sm text-danger">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</span>
          {headerMode === 'logo' && logoUrl && (
            <div className="rounded-t-xl bg-slate-100 px-4 pt-4">
              <img src={logoUrl} alt="Company logo header" className="max-h-16 rounded-lg bg-white object-contain p-1 shadow-sm" />
            </div>
          )}
          <WhatsAppBubblePreview
            bodyText={bodyText || 'Your message preview appears here…'}
            footerText={footerText || undefined}
            headerText={headerMode === 'text' ? headerText || undefined : undefined}
            sampleValues={sampleValues}
          />
          {buttons.length > 0 && (
            <div className="space-y-1">
              {buttons.map((b, i) => (
                <div key={i} className="flex items-center justify-center gap-1 rounded-lg bg-white py-1.5 text-xs font-medium text-info shadow-sm">
                  {b.type === 'URL' && <ExternalLink className="h-3 w-3" />}
                  {b.type === 'PHONE_NUMBER' && <Phone className="h-3 w-3" />}
                  {b.type === 'QUICK_REPLY' && <Reply className="h-3 w-3" />}
                  {b.text || 'Button'}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
