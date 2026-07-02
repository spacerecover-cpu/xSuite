import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Loader2, Lock, Save, RotateCcw } from 'lucide-react';
import { SettingsPageHeader } from '../../components/layout/SettingsPageHeader';
import { useTenantConfig } from '../../contexts/TenantConfigContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { updateTenantFeatureFlags } from '../../lib/tenantFeaturesService';
import {
  FEATURE_REGISTRY,
  FEATURES_BY_KEY,
  CATEGORY_LABELS,
  isFeatureEnabled,
  type FeatureCategory,
} from '../../lib/features/registry';

const CATEGORY_ORDER: FeatureCategory[] = [
  'case_tabs',
  'workflow',
  'navigation',
  'dashboard',
  'portal',
  'automation',
];

interface SwitchProps {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}

function Switch({ checked, disabled, onChange, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={[
        'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        checked ? 'bg-primary' : 'bg-slate-300',
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  );
}

export const FeaturesSettings: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id ?? null;
  const { config, refreshConfig } = useTenantConfig();

  // Draft holds an explicit on/off for every NON-core feature, seeded from the
  // tenant's current resolved state. (Core features are always on and not shown
  // as editable.) New features added to the registry later are absent from a
  // tenant's stored map and fall back to their registry default — backward compatible.
  const seed = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const f of FEATURE_REGISTRY) {
      if (!f.core) out[f.key] = config.featureFlags[f.key] ?? f.defaultEnabled;
    }
    return out;
  }, [config.featureFlags]);

  const [draft, setDraft] = useState<Record<string, boolean>>(seed);
  const [saving, setSaving] = useState(false);

  // Re-seed when the saved config changes (initial load / after a successful save).
  useEffect(() => {
    setDraft(seed);
  }, [seed]);

  const dirty = useMemo(
    () => Object.keys(seed).some((k) => seed[k] !== draft[k]),
    [seed, draft],
  );

  // Preview-before-save: what the *effective* (cascade-aware) visibility change will be.
  const changes = useMemo(() => {
    const willHide: string[] = [];
    const willShow: string[] = [];
    for (const f of FEATURE_REGISTRY) {
      if (f.core) continue;
      const before = isFeatureEnabled(config.featureFlags, f.key);
      const after = isFeatureEnabled(draft, f.key);
      if (before && !after) willHide.push(f.label);
      else if (!before && after) willShow.push(f.label);
    }
    return { willHide, willShow };
  }, [config.featureFlags, draft]);

  const handleToggle = (key: string) => {
    setDraft((d) => ({ ...d, [key]: !d[key] }));
  };

  const handleDiscard = () => setDraft(seed);

  const handleSave = async () => {
    if (!tenantId || !dirty || saving) return;
    setSaving(true);
    try {
      await updateTenantFeatureFlags(tenantId, draft);
      await refreshConfig();
      toast.success('Feature settings saved.');
    } catch {
      toast.error('Failed to save feature settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const changeCount = changes.willHide.length + changes.willShow.length;

  return (
    <div className="min-h-screen p-6 pb-24">
      <SettingsPageHeader categoryId="features" />
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate('/settings')}
          className="rounded-lg p-2 transition-colors hover:bg-slate-100"
          aria-label="Back to settings"
        >
          <ChevronLeft className="h-5 w-5 text-slate-600" />
        </button>
      </div>

      <div className="space-y-8">
        {CATEGORY_ORDER.map((category) => {
          const features = FEATURE_REGISTRY.filter((f) => f.category === category);
          if (features.length === 0) return null;
          return (
            <section key={category}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
                {CATEGORY_LABELS[category]}
              </h2>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {features.map((f, idx) => {
                  const lockedByDep = (f.dependsOn ?? []).some((dep) => !isFeatureEnabled(draft, dep));
                  const checked = f.core ? true : draft[f.key];
                  const depLabel = f.dependsOn
                    ?.map((d) => FEATURES_BY_KEY[d]?.label)
                    .filter(Boolean)
                    .join(', ');
                  return (
                    <div
                      key={f.key}
                      className={[
                        'flex items-center justify-between gap-4 px-4 py-3.5',
                        idx > 0 ? 'border-t border-slate-100' : '',
                      ].join(' ')}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{f.label}</span>
                          {f.core && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                              <Lock className="h-3 w-3" /> Always on
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {f.description}
                          {lockedByDep && depLabel ? (
                            <span className="text-warning"> · Requires “{depLabel}”.</span>
                          ) : null}
                        </p>
                      </div>
                      {f.core ? (
                        <span className="text-xs font-medium text-slate-400">On</span>
                      ) : (
                        <Switch
                          checked={checked}
                          disabled={lockedByDep || saving}
                          onChange={() => handleToggle(f.key)}
                          label={`Toggle ${f.label}`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Preview-before-save action bar */}
      <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0 text-sm">
            {dirty ? (
              <span className="text-slate-600">
                <span className="font-semibold text-slate-900">{changeCount}</span> pending change
                {changeCount === 1 ? '' : 's'}
                {changes.willHide.length > 0 && (
                  <> · hiding <span className="text-slate-900">{changes.willHide.join(', ')}</span></>
                )}
                {changes.willShow.length > 0 && (
                  <> · showing <span className="text-slate-900">{changes.willShow.join(', ')}</span></>
                )}
              </span>
            ) : (
              <span className="text-slate-400">No pending changes</span>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleDiscard}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" /> Discard
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving || !tenantId}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeaturesSettings;
