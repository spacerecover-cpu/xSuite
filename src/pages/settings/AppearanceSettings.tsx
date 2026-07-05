import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Check, Loader2, Languages, LayoutGrid, Sparkles } from 'lucide-react';
import { SettingsPageHeader } from '../../components/layout/SettingsPageHeader';
import { useTheme } from '../../contexts/ThemeContext';
import { useLocale } from '../../contexts/LocaleContext';
import { useToast } from '../../hooks/useToast';
import type { Theme } from '../../types/tenantConfig';
import { THEMES } from '../../types/tenantConfig';
import { settingsKeys } from '../../lib/queryKeys';
import {
  DEFAULT_STAT_CARD_STYLE,
  getTenantStatCardStyle,
  setTenantStatCardStyle,
  type StatCardStyle,
} from '../../lib/statCardStyleService';

interface ThemeOption {
  id: Theme;
  name: string;
  description: string;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  /** Dark themes render the mini preview on their own dark surfaces (the
   *  light default shows the slate-50 box) and pick their own accent ink. */
  preview?: {
    bgHex: string;
    borderHex: string;
    accentTextHex: string;
  };
  /** Small flagship marker next to the theme name. */
  badge?: string;
}

const THEME_OPTIONS: readonly ThemeOption[] = [
  {
    id: 'royal',
    name: 'Royal',
    description: 'Classic, professional blue tones. The default look for most tenants.',
    primaryHex: '#162660',
    secondaryHex: '#D0E6FD',
    accentHex: '#F1E4D1',
  },
  {
    id: 'burgundy',
    name: 'Burgundy',
    description: 'Warm, sophisticated reds. Great for premium / boutique brands.',
    primaryHex: '#6C131F',
    secondaryHex: '#A14B58',
    accentHex: '#FFECEA',
  },
  {
    id: 'scarlet',
    name: 'Scarlet',
    description: 'Bold, vivid scarlet red — high energy, high contrast.',
    primaryHex: '#DC2626',
    secondaryHex: '#C92925',
    accentHex: '#F9E7C9',
  },
  {
    id: 'midnight',
    name: 'Midnight Aurora',
    description:
      'Flagship premium dark theme — deep navy surfaces with an electric-blue and violet aurora accent. Matches the new sign-in experience.',
    primaryHex: '#2E6BE8',
    secondaryHex: '#6D4AE3',
    accentHex: '#221D47',
    preview: { bgHex: '#0A111F', borderHex: '#213052', accentTextHex: '#C9C2F8' },
    badge: 'Premium',
  },
] as const;

const LANGUAGE_OPTIONS: { id: 'en' | 'ar'; label: string; note: string }[] = [
  { id: 'en', label: 'English', note: 'Left-to-right (LTR)' },
  { id: 'ar', label: 'العربية', note: 'Right-to-left (RTL)' },
];

export const AppearanceSettings: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { theme, setTheme, isUpdating } = useTheme();
  const [pendingTheme, setPendingTheme] = useState<Theme | null>(null);
  const { locale, setLocale } = useLocale();
  const [pendingLang, setPendingLang] = useState<'en' | 'ar' | null>(null);
  const isUpdatingLang = pendingLang !== null;

  const handleSelect = async (next: Theme) => {
    if (next === theme || isUpdating) return;
    setPendingTheme(next);
    try {
      await setTheme(next);
      toast.success(`Theme changed to ${next.charAt(0).toUpperCase() + next.slice(1)}`);
    } catch {
      toast.error('Failed to update theme. Please try again.');
    } finally {
      setPendingTheme(null);
    }
  };

  const queryClient = useQueryClient();
  const { data: statCardStyle } = useQuery({
    queryKey: settingsKeys.statCardStyle(),
    queryFn: async () => (await getTenantStatCardStyle()) ?? null,
  });
  const effectiveCardStyle = statCardStyle ?? DEFAULT_STAT_CARD_STYLE;
  const [pendingCardStyle, setPendingCardStyle] = useState<StatCardStyle | null>(null);

  const handleSelectCardStyle = async (next: StatCardStyle) => {
    if (next === effectiveCardStyle || pendingCardStyle !== null) return;
    const previous = statCardStyle ?? null;
    setPendingCardStyle(next);
    queryClient.setQueryData(settingsKeys.statCardStyle(), next);
    try {
      await setTenantStatCardStyle(next);
      toast.success(next === 'vivid' ? 'Stat cards set to Vivid tiles' : 'Stat cards set to Compact chips');
    } catch (error) {
      queryClient.setQueryData(settingsKeys.statCardStyle(), previous);
      toast.error((error as Error).message || 'Failed to update stat card style');
    } finally {
      setPendingCardStyle(null);
      queryClient.invalidateQueries({ queryKey: settingsKeys.statCardStyle() });
    }
  };

  const handleSelectLang = async (next: 'en' | 'ar') => {
    if (next === locale || isUpdatingLang) return;
    setPendingLang(next);
    try {
      await setLocale(next);
      toast.success(next === 'ar' ? 'Language changed to العربية' : 'Language changed to English');
    } catch {
      toast.error('Failed to update language. Please try again.');
    } finally {
      setPendingLang(null);
    }
  };

  if (!THEMES.length) return null;

  return (
    <div className="min-h-screen p-6">
      <SettingsPageHeader categoryId="appearance" />
      <div className="mb-6">
        <button
          onClick={() => navigate('/settings')}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          aria-label="Back to settings"
        >
          <ChevronLeft className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {THEME_OPTIONS.map((option) => {
          const isActive = theme === option.id;
          const isPending = pendingTheme === option.id;
          const isDisabled = isUpdating && !isPending;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleSelect(option.id)}
              disabled={isDisabled || isPending}
              aria-pressed={isActive}
              className={[
                'group relative text-left rounded-xl border-2 bg-white p-5 transition-all',
                isActive
                  ? 'border-primary shadow-md'
                  : 'border-slate-200 hover:border-slate-300 hover:shadow-sm',
                isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    <span
                      className="w-4 h-4 rounded-full ring-1 ring-slate-200"
                      style={{ backgroundColor: option.primaryHex }}
                    />
                    <span
                      className="w-4 h-4 rounded-full ring-1 ring-slate-200"
                      style={{ backgroundColor: option.secondaryHex }}
                    />
                    <span
                      className="w-4 h-4 rounded-full ring-1 ring-slate-200"
                      style={{ backgroundColor: option.accentHex }}
                    />
                  </div>
                  <span className="font-semibold text-slate-900">{option.name}</span>
                  {option.badge && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xxs font-semibold uppercase tracking-wider text-primary">
                      <Sparkles className="w-3 h-3" aria-hidden="true" />
                      {option.badge}
                    </span>
                  )}
                </div>
                <span
                  className={[
                    'w-6 h-6 rounded-full flex items-center justify-center transition-all',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-slate-100 text-transparent group-hover:bg-slate-200',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  {isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
                  ) : isActive ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : null}
                </span>
              </div>

              <div
                className={[
                  'rounded-lg border p-4 mb-4 space-y-3',
                  option.preview ? '' : 'bg-slate-50 border-slate-100',
                ].join(' ')}
                style={
                  option.preview
                    ? { backgroundColor: option.preview.bgHex, borderColor: option.preview.borderHex }
                    : undefined
                }
              >
                <span
                  className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium shadow-sm"
                  style={
                    option.preview
                      ? {
                          background: `linear-gradient(135deg, ${option.primaryHex}, ${option.secondaryHex})`,
                          color: '#fff',
                        }
                      : {
                          backgroundColor: option.primaryHex,
                          color: '#fff',
                        }
                  }
                >
                  Save Changes
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: option.secondaryHex,
                      color: option.id === 'royal' ? option.primaryHex : '#fff',
                    }}
                  >
                    In progress
                  </span>
                </div>
                <div
                  className="h-6 rounded-md flex items-center px-2 text-xs"
                  style={{
                    backgroundColor: option.accentHex,
                    color: option.preview?.accentTextHex ?? option.primaryHex,
                  }}
                >
                  Accent surface
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                {option.description}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary shadow-md">
            <Languages className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-0.5">Language &amp; direction</h2>
            <p className="text-slate-600 text-sm">
              Sets the interface language and text direction for your whole workspace.
              Currency, dates, and number formats still follow your country.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
          {LANGUAGE_OPTIONS.map((option) => {
            const isActive = locale === option.id;
            const isPending = pendingLang === option.id;
            const isDisabled = isUpdatingLang && !isPending;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => handleSelectLang(option.id)}
                disabled={isDisabled || isPending}
                aria-pressed={isActive}
                className={[
                  'group relative text-left rounded-xl border-2 bg-white p-5 transition-all',
                  isActive ? 'border-primary shadow-md' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm',
                  isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                ].join(' ')}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div
                      className="font-semibold text-slate-900"
                      dir={option.id === 'ar' ? 'rtl' : 'ltr'}
                    >
                      {option.label}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{option.note}</div>
                  </div>
                  <span
                    className={[
                      'w-6 h-6 rounded-full flex items-center justify-center transition-all',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-slate-100 text-transparent group-hover:bg-slate-200',
                    ].join(' ')}
                    aria-hidden="true"
                  >
                    {isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
                    ) : isActive ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : null}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary shadow-md">
            <LayoutGrid className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-0.5">Stat cards</h2>
            <p className="text-slate-600 text-sm">
              How KPI cards look on the Cases page — calm compact chips, or the classic vivid
              tiles. Both show the same live numbers and filter the list on click.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          {(
            [
              { id: 'compact' as StatCardStyle, name: 'Compact', note: 'Quiet white chips — easiest on the eyes for all-day use.' },
              { id: 'vivid' as StatCardStyle, name: 'Vivid', note: 'Bold gradient tiles — the classic colorful dashboard look.' },
            ]
          ).map((option) => {
            const isActive = effectiveCardStyle === option.id;
            const isPending = pendingCardStyle === option.id;
            const isDisabled = pendingCardStyle !== null && !isPending;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => handleSelectCardStyle(option.id)}
                disabled={isDisabled || isPending}
                aria-pressed={isActive}
                className={[
                  'group relative text-left rounded-xl border-2 bg-white p-5 transition-all',
                  isActive ? 'border-primary shadow-md' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm',
                  isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                ].join(' ')}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-slate-900">{option.name}</span>
                  <span
                    className={[
                      'w-6 h-6 rounded-full flex items-center justify-center transition-all',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-slate-100 text-transparent group-hover:bg-slate-200',
                    ].join(' ')}
                    aria-hidden="true"
                  >
                    {isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
                    ) : isActive ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : null}
                  </span>
                </div>

                {option.id === 'compact' ? (
                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 border border-slate-100 p-3">
                    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                      <span className="flex items-center gap-1.5 text-xxs font-medium text-slate-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />
                        In diagnosis
                      </span>
                      <span className="block text-sm font-bold tabular-nums text-warning">31</span>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                      <span className="flex items-center gap-1.5 text-xxs font-medium text-slate-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                        Ready
                      </span>
                      <span className="block text-sm font-bold tabular-nums text-success">5</span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 border border-slate-100 p-3">
                    <div className="rounded-lg bg-gradient-to-br from-warning to-warning/85 px-2.5 py-1.5 text-ink-dark">
                      <span className="block text-xxs font-semibold uppercase tracking-wider text-ink-dark/80">
                        In Diagnosis
                      </span>
                      <span className="block text-sm font-bold tabular-nums">31</span>
                    </div>
                    <div className="rounded-lg bg-gradient-to-br from-success to-success/85 px-2.5 py-1.5 text-white">
                      <span className="block text-xxs font-semibold uppercase tracking-wider text-white/90">
                        Ready
                      </span>
                      <span className="block text-sm font-bold tabular-nums">5</span>
                    </div>
                  </div>
                )}

                <p className="mt-3 text-xs text-slate-600 leading-relaxed">{option.note}</p>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-8 text-xs text-slate-500">
        Theme, language, and stat cards are set per workspace and apply to every user. PDF
        documents stay in a neutral color scheme regardless of theme.
      </p>
    </div>
  );
};
