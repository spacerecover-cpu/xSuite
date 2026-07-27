import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, MessageSquareText } from 'lucide-react';
import { whatsappKeys } from '../../../lib/queryKeys';
import {
  diffRulesToSeed, ensureRules, getIntegration, listRules, listTemplates, updateRule,
  type WhatsAppRule,
} from '../../../lib/whatsappService';
import { WHATSAPP_EVENT_CATALOG } from '../../../lib/whatsapp/events';
import { useTenantConfig, useTenantFeature } from '../../../contexts/TenantConfigContext';

export function WhatsAppAutomationsTab() {
  const qc = useQueryClient();
  const { config } = useTenantConfig();
  const whatsappEnabled = useTenantFeature('automation.whatsapp');
  const tenantId = config?.tenantId ?? '';

  const { data: integration } = useQuery({ queryKey: whatsappKeys.integration(), queryFn: getIntegration });
  const { data: rules } = useQuery({ queryKey: whatsappKeys.rules(), queryFn: listRules });
  const { data: templates } = useQuery({ queryKey: whatsappKeys.templates(), queryFn: listTemplates });

  useEffect(() => {
    // seed by SET DIFFERENCE, not row count (non-catalog rows must not mask missing
    // catalog rows), and never let a failed seed become an unhandled rejection
    if (tenantId && rules && diffRulesToSeed(rules, tenantId).length > 0) {
      ensureRules(tenantId)
        .then(() => qc.invalidateQueries({ queryKey: whatsappKeys.rules() }))
        .catch((e) => console.error('WhatsApp rule seeding failed:', e));
    }
  }, [tenantId, rules, qc]);

  const [draft, setDraft] = useState<Record<string, Partial<WhatsAppRule>>>({});
  const byKey = useMemo(() => new Map((rules ?? []).map((r) => [r.event_key, r])), [rules]);
  const stages = useMemo(
    () => [...new Set(WHATSAPP_EVENT_CATALOG.map((e) => e.stage))], []);
  const approvedTemplates = (templates ?? []).filter((t) => t.status === 'APPROVED');
  const templateFamilies = [...new Map(approvedTemplates.map((t) => [t.name, t])).values()];

  const saveAll = useMutation({
    mutationFn: async () => {
      for (const [id, patch] of Object.entries(draft)) await updateRule(id, patch);
    },
    onSuccess: () => { setDraft({}); qc.invalidateQueries({ queryKey: whatsappKeys.rules() }); },
  });

  const patchOf = (rule: WhatsAppRule) => ({ ...rule, ...(draft[rule.id] ?? {}) });
  const setPatch = (rule: WhatsAppRule, patch: Partial<WhatsAppRule>) =>
    setDraft((d) => ({ ...d, [rule.id]: { ...(d[rule.id] ?? {}), ...patch } }));
  const dirty = Object.keys(draft).length > 0;
  const notConnected = !integration || integration.connection_status !== 'connected';
  const sendingPaused = !notConnected && !integration!.is_enabled;
  const blocked = notConnected || sendingPaused || !whatsappEnabled;

  return (
    <div className="max-w-4xl space-y-6 pb-24">
      {blocked && (
        <div className="rounded-xl border border-warning/40 bg-warning-muted p-4 text-sm text-warning">
          {notConnected
            ? 'Connect WhatsApp first (Connection tab). Automations stay off until the connection is healthy.'
            : sendingPaused
              ? 'Sending is paused for this tenant — switch it on in the Connection tab. Rules can be configured, but nothing will leave until then.'
              : 'The "WhatsApp Automation" feature toggle is off (Settings → Features & Modules).'}
        </div>
      )}
      {stages.map((stage) => (
        <section key={stage} className="rounded-xl border border-slate-200 bg-white">
          <h3 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {stage}
          </h3>
          <ul className="divide-y divide-slate-100">
            {WHATSAPP_EVENT_CATALOG.filter((e) => e.stage === stage).map((event) => {
              const rule = byKey.get(event.key);
              if (!rule) {
                // not yet seeded (first visit, insert in flight) — visible but inert
                return (
                  <li key={event.key} className="flex items-center gap-3 px-5 py-3 opacity-50">
                    <div className="h-5 w-9 rounded-full bg-slate-200" />
                    <div className="text-sm text-slate-500">{event.label} — preparing…</div>
                  </li>
                );
              }
              const value = patchOf(rule);
              return (
                <li key={event.key} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input type="checkbox" className="peer sr-only" checked={value.enabled}
                      disabled={blocked}
                      onChange={(e) => setPatch(rule, { enabled: e.target.checked })} />
                    <div className="h-5 w-9 rounded-full bg-slate-200 transition-colors peer-checked:bg-primary
                                    after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full
                                    after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
                  </label>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900">
                      {event.label}
                      {event.requiredConsent === 'marketing' && (
                        <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-xxs font-medium text-accent">
                          marketing consent
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-slate-500">{event.description}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MessageSquareText className="h-4 w-4 text-slate-400" />
                    <select
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
                      value={value.template_id ?? ''}
                      disabled={blocked}
                      onChange={(e) => setPatch(rule, { template_id: e.target.value || null })}
                    >
                      <option value="">No template — off</option>
                      {templateFamilies.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <Clock className="h-4 w-4 text-slate-400" />
                    <select
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
                      value={value.delay_minutes}
                      disabled={blocked}
                      onChange={(e) => setPatch(rule, { delay_minutes: Number(e.target.value) })}
                    >
                      <option value={0}>Instant</option>
                      <option value={15}>15 min</option>
                      <option value={60}>1 hour</option>
                      <option value={240}>4 hours</option>
                      <option value={1440}>1 day</option>
                    </select>
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      <input type="checkbox" checked={value.send_window === 'business_hours'}
                        disabled={blocked}
                        onChange={(e) => setPatch(rule, { send_window: e.target.checked ? 'business_hours' : 'any' })} />
                      Business hours
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            <span className="text-sm text-slate-600">{Object.keys(draft).length} automation(s) changed</span>
            <div className="flex gap-2">
              <button onClick={() => setDraft({})}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">Discard</button>
              <button onClick={() => saveAll.mutate()} disabled={saveAll.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
