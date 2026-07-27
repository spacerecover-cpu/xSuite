import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, XCircle, AlertTriangle, Copy, RefreshCw, ShieldCheck, Phone, Webhook,
} from 'lucide-react';
import { whatsappKeys } from '../../../lib/queryKeys';
import { getIntegration, whatsappAdmin } from '../../../lib/whatsappService';
import { useTenantConfig } from '../../../contexts/TenantConfigContext';
import { Input } from '../../ui/Input';
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

export function WhatsAppConnectionTab() {
  const qc = useQueryClient();
  const { config } = useTenantConfig();
  const tenantId = config?.tenantId ?? '';
  const { data: integration, isLoading } = useQuery({
    queryKey: whatsappKeys.integration(), queryFn: getIntegration,
  });
  const [form, setForm] = useState({ appId: '', wabaId: '', phoneNumberId: '', accessToken: '', appSecret: '' });
  const [checks, setChecks] = useState<TestChecks | null>(null);

  const webhookUrl = useMemo(() => {
    const base = (supabase as unknown as { supabaseUrl?: string }).supabaseUrl
      ?? import.meta.env.VITE_SUPABASE_URL;
    return integration ? `${base}/functions/v1/whatsapp-webhook?t=${integration.public_id}` : '';
  }, [integration]);

  const save = useMutation({
    mutationFn: () => whatsappAdmin('save_credentials', { tenantId, ...form }),
    onSuccess: () => {
      setForm({ appId: '', wabaId: '', phoneNumberId: '', accessToken: '', appSecret: '' });
      qc.invalidateQueries({ queryKey: whatsappKeys.all });
    },
  });
  const test = useMutation({
    mutationFn: () => whatsappAdmin<{ checks: TestChecks }>('test_connection', { tenantId }),
    onSuccess: (r) => { setChecks(r.checks); qc.invalidateQueries({ queryKey: whatsappKeys.integration() }); },
  });

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-slate-100" />;

  const connected = integration?.connection_status === 'connected';
  const Check = ({ ok, label, detail }: { ok: boolean; label: string; detail?: string | null }) => (
    <li className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-danger" />}
      <span className="text-slate-700">{label}</span>
      {detail && <span className="text-xs text-slate-400">{detail}</span>}
    </li>
  );

  return (
    <div className="max-w-3xl space-y-6">
      {/* status card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
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
          <button
            onClick={() => test.mutate()}
            disabled={!integration || test.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${test.isPending ? 'animate-spin' : ''}`} /> Test Connection
          </button>
        </div>
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
        <div className="grid gap-4 md:grid-cols-2">
          <Input floatingLabel label="App ID" value={form.appId}
            onChange={(e) => setForm((f) => ({ ...f, appId: e.target.value }))} />
          <Input floatingLabel label="Business Account ID (WABA)" value={form.wabaId}
            onChange={(e) => setForm((f) => ({ ...f, wabaId: e.target.value }))} />
          <Input floatingLabel label="Phone Number ID" value={form.phoneNumberId}
            onChange={(e) => setForm((f) => ({ ...f, phoneNumberId: e.target.value }))} />
          <Input floatingLabel label="App Secret" type="password" value={form.appSecret}
            placeholder={connected ? '••••••••  (saved)' : ''}
            onChange={(e) => setForm((f) => ({ ...f, appSecret: e.target.value }))} />
          <div className="md:col-span-2">
            <Input floatingLabel label="Permanent Access Token" type="password" value={form.accessToken}
              placeholder={connected ? '••••••••  (saved)' : ''}
              onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))} />
          </div>
        </div>
        {save.isError && (
          <p className="mt-3 flex items-center gap-2 text-sm text-danger">
            <AlertTriangle className="h-4 w-4" /> {(save.error as Error).message}
          </p>
        )}
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || Object.values(form).some((v) => !v)}
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
                className="rounded p-1 text-slate-400 hover:text-slate-700" aria-label={`Copy ${label}`}>
                <Copy className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
