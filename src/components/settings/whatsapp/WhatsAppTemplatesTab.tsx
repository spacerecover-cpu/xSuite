import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, LayoutTemplate, Pencil, Plus, RefreshCw, Send, Sparkles } from 'lucide-react';
import { whatsappKeys } from '../../../lib/queryKeys';
import { getIntegration, listTemplates, whatsappAdmin, type WhatsAppTemplate } from '../../../lib/whatsappService';
import { WHATSAPP_EVENT_CATALOG } from '../../../lib/whatsapp/events';
import { useTenantConfig } from '../../../contexts/TenantConfigContext';
import { supabase } from '../../../lib/supabaseClient';
import { WhatsAppTemplateStudio } from './WhatsAppTemplateStudio';

const STATUS_TONE: Record<string, string> = {
  APPROVED: 'bg-success-muted text-success',
  PENDING: 'bg-warning-muted text-warning',
  PAUSED: 'bg-warning-muted text-warning',
  REJECTED: 'bg-danger-muted text-danger',
  DISABLED: 'bg-danger-muted text-danger',
  DRAFT: 'bg-slate-100 text-slate-500',
};

const QUALITY_DOT: Record<string, string> = {
  GREEN: 'bg-success',
  YELLOW: 'bg-warning',
  RED: 'bg-danger',
};

interface TemplateFamily { name: string; rows: WhatsAppTemplate[]; }

export function WhatsAppTemplatesTab() {
  const qc = useQueryClient();
  const { config } = useTenantConfig();
  const tenantId = config?.tenantId ?? '';
  const { data: integration } = useQuery({ queryKey: whatsappKeys.integration(), queryFn: getIntegration });
  const { data: templates, isLoading } = useQuery({ queryKey: whatsappKeys.templates(), queryFn: listTemplates });
  const [studio, setStudio] = useState<{ open: boolean; template: WhatsAppTemplate | null }>({ open: false, template: null });
  const [actionError, setActionError] = useState<string | null>(null);

  const families = useMemo<TemplateFamily[]>(() => {
    const map = new Map<string, WhatsAppTemplate[]>();
    for (const t of templates ?? []) {
      const rows = map.get(t.name) ?? [];
      rows.push(t);
      map.set(t.name, rows);
    }
    return [...map.entries()].map(([name, rows]) => ({ name, rows }));
  }, [templates]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: whatsappKeys.templates() });
    setActionError(null);
  };

  const sync = useMutation({
    mutationFn: () => whatsappAdmin('sync_templates', { tenantId }),
    onSuccess: invalidate,
    onError: (e) => setActionError((e as Error).message),
  });
  const submit = useMutation({
    mutationFn: (templateId: string) => whatsappAdmin('submit_template', { tenantId, templateId }),
    onSuccess: invalidate,
    onError: (e) => setActionError((e as Error).message),
  });
  const seedStarter = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('seed_whatsapp_starter_templates', { p_tenant_id: tenantId });
      if (error) {
        // the starter-pack RPC ships in a later migration — degrade gracefully when absent
        if (error.code === 'PGRST202' || /does not exist|could not find/i.test(error.message)) {
          throw new Error('The starter pack is not installed on this workspace yet.');
        }
        throw error;
      }
      return data ?? 0;
    },
    onSuccess: invalidate,
    onError: (e) => setActionError((e as Error).message),
  });

  const eventLabel = (key: string | null) =>
    key ? WHATSAPP_EVENT_CATALOG.find((e) => e.key === key)?.label ?? key : null;

  const worstQuality = (rows: WhatsAppTemplate[]) => {
    const scores = rows.map((r) => r.quality_score).filter(Boolean) as string[];
    if (scores.includes('RED')) return 'RED';
    if (scores.includes('YELLOW')) return 'YELLOW';
    if (scores.includes('GREEN')) return 'GREEN';
    return null;
  };

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-slate-100" />;

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          Message templates are reviewed by Meta before they can be sent. Statuses update automatically via webhook.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => seedStarter.mutate()}
            disabled={seedStarter.isPending || !tenantId}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4 text-accent" /> Add starter pack
          </button>
          <button
            onClick={() => sync.mutate()}
            disabled={sync.isPending || !integration}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${sync.isPending ? 'animate-spin' : ''}`} /> Sync from Meta
          </button>
          <button
            onClick={() => setStudio({ open: true, template: null })}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> New template
          </button>
        </div>
      </div>

      {actionError && (
        <p className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-muted p-3 text-sm text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {actionError}
        </p>
      )}

      {families.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <LayoutTemplate className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">No templates yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
            Add the professionally written starter pack for the common lifecycle notifications,
            or create your first template from scratch.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3">Template</th>
                <th className="px-5 py-3">Languages</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Quality</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {families.map(({ name, rows }) => {
                const linked = eventLabel(rows[0].event_key);
                const quality = worstQuality(rows);
                const drafts = rows.filter((r) => r.status === 'DRAFT');
                const statuses = [...new Set(rows.map((r) => r.status))];
                return (
                  <tr key={name}>
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-900">{name}</div>
                      {linked && <div className="text-xs text-slate-400">{linked}</div>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {rows.map((r) => (
                          <span key={r.id} title={r.status}
                            className={`rounded-full px-2 py-0.5 text-xxs font-medium uppercase ${STATUS_TONE[r.status] ?? 'bg-slate-100 text-slate-500'}`}>
                            {r.language}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">{rows[0].category}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {statuses.map((s) => (
                          <span key={s} className={`rounded-full px-2 py-0.5 text-xxs font-medium ${STATUS_TONE[s] ?? 'bg-slate-100 text-slate-500'}`}>
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {quality
                        ? <span className={`inline-block h-2.5 w-2.5 rounded-full ${QUALITY_DOT[quality]}`} title={`Quality: ${quality}`} />
                        : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {drafts.map((d) => (
                          <button key={d.id}
                            onClick={() => submit.mutate(d.id)}
                            disabled={submit.isPending || !integration}
                            className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
                            title={`Submit ${d.language} to Meta for review`}
                          >
                            <Send className="h-3 w-3" /> Submit{drafts.length > 1 || rows.length > 1 ? ` ${d.language}` : ''}
                          </button>
                        ))}
                        <button
                          onClick={() => setStudio({ open: true, template: rows[0] })}
                          className="rounded p-1 text-slate-400 hover:text-slate-700"
                          aria-label={`Edit ${name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {studio.open && (
        <WhatsAppTemplateStudio
          isOpen={studio.open}
          template={studio.template}
          onClose={() => setStudio({ open: false, template: null })}
        />
      )}
    </div>
  );
}
