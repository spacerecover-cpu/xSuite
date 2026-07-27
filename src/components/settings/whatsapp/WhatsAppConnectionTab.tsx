import { useId, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, XCircle, AlertTriangle, Copy, RefreshCw, ShieldCheck, Phone, Webhook,
  PauseCircle, Circle,
} from 'lucide-react';
import { whatsappKeys } from '../../../lib/queryKeys';
import {
  getIntegration, setIntegrationEnabled, whatsappAdmin, whatsappGoLiveGates,
} from '../../../lib/whatsappService';
import { useTenantConfig, useTenantFeature } from '../../../contexts/TenantConfigContext';
import { Input, NO_AUTOFILL } from '../../ui/Input';
import { supabase } from '../../../lib/supabaseClient';

interface TestChecks {
  token: boolean; tokenExpiresAt: number | null; phone: boolean;
  displayPhoneNumber: string | null; verifiedName: string | null;
  qualityRating: string | null; nameStatus: string | null; throughputLevel: string | null;
  canSendMessage: string; webhookSubscribed: boolean; webhookVerified: boolean;
  lastWebhookAt: string | null;
}

const STATUS_TONE: Record<string, string> = {
  connected: 'bg-success-muted text-success',
  disconnected: 'bg-slate-100 text-slate-500',
  error: 'bg-danger-muted text-danger',
  token_invalid: 'bg-danger-muted text-danger',
  quality_paused: 'bg-warning-muted text-warning',
};

const FIELDS = [
  { key: 'appId', label: 'App ID', secret: false, wide: false,
    hint: 'Meta App Dashboard → Settings → Basic' },
  { key: 'wabaId', label: 'Business Account ID (WABA)', secret: false, wide: false,
    hint: 'WhatsApp Manager → API Setup' },
  { key: 'phoneNumberId', label: 'Phone Number ID', secret: false, wide: false,
    hint: 'The numeric ID, not the phone number itself' },
  { key: 'appSecret', label: 'App Secret', secret: true, wide: false,
    hint: 'Settings → Basic → App Secret → Show' },
  { key: 'accessToken', label: 'Permanent Access Token', secret: true, wide: true,
    hint: 'Business Settings → System Users → Generate New Token (expiration “Never”)' },
] as const;

type FormState = Record<(typeof FIELDS)[number]['key'], string>;
const EMPTY_FORM: FormState = { appId: '', wabaId: '', phoneNumberId: '', appSecret: '', accessToken: '' };

export function WhatsAppConnectionTab() {
  const qc = useQueryClient();
  const { config } = useTenantConfig();
  const tenantId = config?.tenantId ?? '';
  const featureEnabled = useTenantFeature('automation.whatsapp');
  // Randomised per mount: Chrome matches saved profiles on stable field names, and
  // has happily dropped a staff email into "Phone Number ID" when the name looked
  // familiar. Unique names + NO_AUTOFILL keep credentials fields off its radar.
  const nonce = useId().replace(/[^a-zA-Z0-9]/g, '');
  const {
    data: integration, isLoading, error: loadError, refetch, isFetching,
  } = useQuery({ queryKey: whatsappKeys.integration(), queryFn: getIntegration });
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [checks, setChecks] = useState<TestChecks | null>(null);

  const webhookUrl = useMemo(() => {
    const base = (supabase as unknown as { supabaseUrl?: string }).supabaseUrl
      ?? import.meta.env.VITE_SUPABASE_URL;
    return integration ? `${base}/functions/v1/whatsapp-webhook?t=${integration.public_id}` : '';
  }, [integration]);

  const test = useMutation({
    mutationFn: () => whatsappAdmin<{ checks: TestChecks }>('test_connection', { tenantId }),
    onSuccess: (r) => { setChecks(r.checks); qc.invalidateQueries({ queryKey: whatsappKeys.integration() }); },
  });
  const save = useMutation({
    mutationFn: () => whatsappAdmin('save_credentials', { tenantId, ...form }),
    // Secrets are write-once, so the inputs clear — but only after a confirmed
    // store, and the success panel below stays put so the wipe never reads as
    // "nothing happened". A failure keeps every value for correction in place.
    onSuccess: () => {
      setForm(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: whatsappKeys.all });
      test.mutate();
    },
  });
  const toggleSending = useMutation({
    mutationFn: (next: boolean) => setIntegrationEnabled(integration!.id, next),
    onSuccess: () => qc.invalidateQueries({ queryKey: whatsappKeys.integration() }),
  });

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-slate-100" />;

  if (loadError) {
    return (
      <div className="max-w-3xl rounded-xl border border-danger/40 bg-danger-muted p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" /> Could not load the WhatsApp integration.
        </p>
        <p className="mt-1 text-xs text-danger/80">{(loadError as Error).message}</p>
        <button onClick={() => refetch()}
          className="mt-3 rounded-lg border border-danger/40 px-3 py-2 text-sm font-medium text-danger">
          Try again
        </button>
      </div>
    );
  }

  const connected = integration?.connection_status === 'connected';
  const sending = connected && !!integration?.is_enabled;
  // Meta validates all five together, so a partial submit can only fail — say
  // WHICH fields are missing instead of leaving a dead button with no reason.
  const missing = FIELDS.filter((f) => !form[f.key].trim());
  const incomplete = missing.length > 0;
  const incompleteHint = incomplete && missing.length < FIELDS.length
    ? `Still needed: ${missing.map((f) => f.label).join(', ')}`
    : null;
  const setField = (key: keyof FormState, value: string) => {
    if (save.isSuccess || save.isError) save.reset();
    setForm((f) => ({ ...f, [key]: value }));
  };

  const Check = ({ ok, label, detail }: { ok: boolean; label: string; detail?: string | null }) => (
    <li className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <XCircle className="h-4 w-4 shrink-0 text-danger" />}
      <span className="text-slate-700">{label}</span>
      {detail && <span className="text-xs text-slate-400">{detail}</span>}
    </li>
  );

  const readiness = whatsappGoLiveGates({
    connectionStatus: integration?.connection_status,
    isEnabled: integration?.is_enabled,
    webhookStatus: integration?.webhook_status,
    featureEnabled,
  });
  const blockers = readiness.filter((r) => !r.ok);

  return (
    <div className="max-w-3xl space-y-6">
      {/* status card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2"><Phone className="h-5 w-5 text-primary" /></div>
            <div>
              <div className="font-semibold text-slate-900">
                {integration?.verified_name ?? 'WhatsApp Business'}
                {integration?.display_phone_number && (
                  <span className="ml-2 text-sm font-normal text-slate-500">{integration.display_phone_number}</span>
                )}
              </div>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[integration?.connection_status ?? 'disconnected']}`}>
                {integration?.connection_status ?? 'disconnected'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {integration && (
              <label className="flex cursor-pointer items-center gap-2">
                <span className="text-sm font-medium text-slate-700">
                  {sending ? 'Sending on' : 'Sending paused'}
                </span>
                <span className="relative inline-flex items-center">
                  <input type="checkbox" className="peer sr-only"
                    checked={sending}
                    disabled={!connected || toggleSending.isPending}
                    onChange={(e) => toggleSending.mutate(e.target.checked)} />
                  <span className="h-5 w-9 rounded-full bg-slate-200 transition-colors peer-checked:bg-success
                                   peer-disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-ring
                                   after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full
                                   after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
                </span>
              </label>
            )}
            <button
              onClick={() => test.mutate()}
              disabled={!integration || test.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${test.isPending || isFetching ? 'animate-spin' : ''}`} /> Test Connection
            </button>
          </div>
        </div>
        {toggleSending.isError && (
          <p className="mt-3 flex items-center gap-2 text-sm text-danger">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {(toggleSending.error as Error).message}
          </p>
        )}
        {connected && !sending && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning-muted p-3 text-sm text-warning">
            <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" />
            Connected, but sending is paused — no automation or manual message will leave this
            tenant until you switch it on.
          </p>
        )}
        {test.isError && (
          <p className="mt-3 flex items-center gap-2 text-sm text-danger">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {(test.error as Error).message}
          </p>
        )}
        {integration && (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
            <div><dt className="text-xs text-slate-400">Quality</dt><dd className="text-slate-700">{integration.quality_rating ?? '—'}</dd></div>
            <div><dt className="text-xs text-slate-400">Messaging tier</dt><dd className="text-slate-700">{integration.messaging_limit_tier ?? '—'}</dd></div>
            <div><dt className="text-xs text-slate-400">Display name</dt><dd className="text-slate-700">{integration.name_status ?? 'Not reviewed'}</dd></div>
            <div><dt className="text-xs text-slate-400">API version</dt><dd className="text-slate-700">{integration.graph_api_version}</dd></div>
            <div><dt className="text-xs text-slate-400">Token expiry</dt><dd className="text-slate-700">{integration.token_expires_at ? new Date(integration.token_expires_at).toLocaleDateString() : 'Never'}</dd></div>
          </dl>
        )}
        {checks && (
          <ul className="mt-4 space-y-1 border-t border-slate-100 pt-4">
            <Check ok={checks.token} label="Access token valid" />
            <Check ok={checks.phone} label="Phone number reachable" detail={checks.displayPhoneNumber} />
            <Check ok={checks.canSendMessage === 'AVAILABLE'} label="Account can send messages" detail={checks.canSendMessage} />
            <Check ok={checks.webhookSubscribed} label="App subscribed to WABA webhooks" />
            <Check ok={checks.webhookVerified} label="Webhook endpoint verified" detail={checks.lastWebhookAt ? `last event ${new Date(checks.lastWebhookAt).toLocaleString()}` : null} />
          </ul>
        )}
      </div>

      {/* readiness rail — what still stands between here and a delivered message */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          Go-live checklist
          <span className="ml-2 text-xs font-normal text-slate-500">
            {blockers.length === 0 ? 'all clear' : `${blockers.length} remaining`}
          </span>
        </h3>
        <ul className="space-y-2">
          {readiness.map((r) => (
            <li key={r.key} className="flex items-start gap-2 text-sm">
              {r.ok
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}
              <div>
                <span className={r.ok ? 'text-slate-500 line-through' : 'text-slate-900'}>{r.label}</span>
                {!r.ok && <p className="text-xs text-slate-500">{r.fix}</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* credentials card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
          <ShieldCheck className="h-4 w-4 text-primary" /> Meta Cloud API credentials
        </h3>
        <p className="mb-4 text-xs text-slate-500">
          Stored encrypted (Supabase Vault). Secrets are never shown again after saving —
          use Replace to rotate. Create these in Meta Business Settings → System Users
          (token needs <code>whatsapp_business_messaging</code> + <code>whatsapp_business_management</code>).
        </p>
        <form
          autoComplete="off"
          onSubmit={(e) => { e.preventDefault(); if (!incomplete) save.mutate(); }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className={f.wide ? 'md:col-span-2' : undefined}>
                <Input
                  floatingLabel
                  label={f.label}
                  hint={f.hint}
                  value={form[f.key]}
                  type={f.secret ? 'password' : 'text'}
                  placeholder={f.secret && connected ? '••••••••  (saved)' : ''}
                  onChange={(e) => setField(f.key, e.target.value)}
                  {...NO_AUTOFILL}
                  name={`wa-${f.key}-${nonce}`}
                  autoComplete={f.secret ? 'new-password' : 'off'}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                />
              </div>
            ))}
          </div>
        </form>
        {save.isError && (
          <p className="mt-3 flex items-start gap-2 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {(save.error as Error).message}
          </p>
        )}
        {save.isSuccess && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-success-muted p-3 text-sm text-success">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Verified with Meta and stored in the vault
              {integration?.display_phone_number ? ` for ${integration.display_phone_number}` : ''}.
              The secret fields are cleared on purpose — they are write-once.
            </span>
          </p>
        )}
        <div className="mt-4 flex items-center justify-end gap-3">
          {incompleteHint && <span className="text-xs text-slate-500">{incompleteHint}</span>}
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || incomplete}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {save.isPending ? 'Validating with Meta…' : connected ? 'Replace credentials' : 'Connect'}
          </button>
        </div>
      </div>

      {/* webhook card */}
      {integration && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
            <Webhook className="h-4 w-4 text-primary" /> Webhook configuration
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              integration.webhook_status === 'unverified'
                ? 'bg-slate-100 text-slate-500' : 'bg-success-muted text-success'}`}>
              {integration.webhook_status}
            </span>
          </h3>
          <p className="mb-4 text-xs text-slate-500">
            In your Meta app → WhatsApp → Configuration, set this Callback URL and Verify Token,
            then subscribe to <code>messages</code>, <code>message_template_status_update</code>,
            <code>message_template_quality_update</code>, <code>template_category_update</code>,
            <code>phone_number_quality_update</code> and <code>account_update</code>.
          </p>
          {[['Callback URL', webhookUrl], ['Verify Token', integration.webhook_verify_token]].map(([label, value]) => (
            <div key={label} className="mb-2 flex items-center gap-2">
              <span className="w-28 shrink-0 text-xs text-slate-400">{label}</span>
              <code className="flex-1 truncate rounded bg-slate-50 px-2 py-1 text-xs text-slate-700">{value}</code>
              <button onClick={() => navigator.clipboard.writeText(String(value))}
                className="rounded p-2 text-slate-400 hover:text-slate-700" title={`Copy ${label}`}
                aria-label={`Copy ${label}`}>
                <Copy className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
