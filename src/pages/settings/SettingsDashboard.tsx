import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { SETTINGS_CATEGORIES, SETTINGS_GROUPS, SettingsCategory, hasDeletedAt } from '../../config/settingsCategories';
import { settingsKeys } from '../../lib/queryKeys';
import { Settings as SettingsIcon, ChevronRight } from 'lucide-react';

// Render the category's accent (a per-area hex from config) as a soft tint so the
// dashboard reads calm/professional instead of a wall of saturated solid blocks.
const tintBg = (hex: string): string => {
  const n = parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return 'rgba(100, 116, 139, 0.12)';
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.12)`;
};

const SettingsCategoryCard: React.FC<{
  category: SettingsCategory;
  onClick: () => void;
}> = ({ category, onClick }) => {
  const { data: count, isLoading } = useQuery({
    queryKey: settingsKeys.categoryCount(category.id),
    queryFn: async () => {
      const promises = category.tables.map(async (table) => {
        try {
          let query = supabase
            .from(table)
            .select('id', { count: 'exact', head: true });
          if (hasDeletedAt(table)) {
            query = query.is('deleted_at', null);
          }
          const { count, error } = await query;
          if (error) return 0;
          return count ?? 0;
        } catch {
          return 0;
        }
      });
      const counts = await Promise.all(promises);
      return counts.reduce((sum, c) => sum + c, 0);
    },
    enabled: category.tables.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return (
    <button
      onClick={onClick}
      className="group relative flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-all hover:border-primary/40 hover:shadow-md"
    >
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: tintBg(category.backgroundColor) }}
      >
        <category.icon className="h-[18px] w-[18px]" style={{ color: category.backgroundColor }} />
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="pr-4 text-sm font-semibold leading-tight text-slate-900">
          {category.title}
        </h3>
        <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-400">
          {category.description}
        </p>
        <div className="mt-1.5 flex items-center gap-1">
          {category.tables.length > 0 ? (
            <>
              <span className="text-xs font-bold" style={{ color: category.backgroundColor }}>
                {isLoading ? (
                  <span
                    className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-200"
                    style={{ borderTopColor: category.backgroundColor }}
                  />
                ) : (
                  count ?? 0
                )}
              </span>
              <span className="text-xs font-medium text-slate-400">items</span>
            </>
          ) : (
            <span className="text-xs font-medium text-slate-500">{category.actionLabel}</span>
          )}
        </div>
      </div>

      <ChevronRight className="absolute right-3 top-3 h-4 w-4 text-slate-300 transition-colors group-hover:text-primary" />
    </button>
  );
};

export const SettingsDashboard: React.FC = () => {
  const navigate = useNavigate();

  const handleCategoryClick = (categoryId: string) => {
    if (categoryId === 'system-numbers') {
      navigate('/settings/system-numbers');
    } else if (categoryId === 'general-settings') {
      navigate('/settings/general-settings');
    } else if (categoryId === 'templates') {
      navigate('/templates');
    } else if (categoryId === 'documents') {
      navigate('/settings/documents');
    } else if (categoryId === 'localization') {
      navigate('/settings/localization');
    } else if (categoryId === 'client-portal') {
      navigate('/settings/client-portal');
    } else if (categoryId === 'import-export') {
      navigate('/settings/import-export');
    } else if (categoryId === 'notifications') {
      navigate('/settings/notifications');
    } else if (categoryId === 'inventory-settings') {
      navigate('/settings/inventory');
    } else {
      navigate(`/settings/${categoryId}`);
    }
  };

  const categoryById = new Map(SETTINGS_CATEGORIES.map((c) => [c.id, c]));
  const groupedIds = new Set(SETTINGS_GROUPS.flatMap((g) => g.categoryIds));

  const sections = SETTINGS_GROUPS.map((group) => ({
    label: group.label,
    categories: group.categoryIds
      .map((id) => categoryById.get(id))
      .filter((c): c is SettingsCategory => Boolean(c)),
  })).filter((s) => s.categories.length > 0);

  // Defensive: surface any category not assigned to a group rather than dropping it.
  const ungrouped = SETTINGS_CATEGORIES.filter((c) => !groupedIds.has(c.id));
  if (ungrouped.length > 0) {
    sections.push({ label: 'More', categories: ungrouped });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="mb-5 animate-fade-in">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl shadow-lg"
            style={{
              background: 'linear-gradient(135deg, rgb(var(--color-cat-1)) 0%, rgb(var(--color-primary)) 100%)',
              boxShadow: '0 6px 20px -4px rgba(6, 182, 212, 0.4)',
            }}
          >
            <SettingsIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">System Settings</h1>
            <p className="text-xs text-slate-500">Configure and manage your workspace</p>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {sections.map((section) => (
          <section key={section.label}>
            <h2 className="mb-2.5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {section.label}
              <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {section.categories.map((category) => (
                <SettingsCategoryCard
                  key={category.id}
                  category={category}
                  onClick={() => handleCategoryClick(category.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};
