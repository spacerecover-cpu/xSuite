import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { SETTINGS_CATEGORIES, SettingsCategory, hasDeletedAt } from '../../config/settingsCategories';
import { settingsKeys } from '../../lib/queryKeys';
import { Settings as SettingsIcon, ChevronRight } from 'lucide-react';

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
      className="group bg-white rounded-xl shadow-md border border-slate-200 p-6 hover:shadow-xl transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 text-left relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-24 h-24 opacity-[0.03] -mr-6 -mt-6">
        <category.icon className="w-full h-full" />
      </div>

      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center mb-5 shadow-md relative z-10"
        style={{
          backgroundColor: category.backgroundColor,
          boxShadow: `0 8px 20px -6px ${category.backgroundColor}70`,
        }}
      >
        <category.icon className="w-7 h-7 text-white" />
      </div>

      <h3 className="text-lg font-bold text-slate-900 mb-2 relative z-10">
        {category.title}
      </h3>
      <p className="text-slate-600 text-sm mb-5 leading-relaxed relative z-10 line-clamp-2">
        {category.description}
      </p>

      <div className="flex items-center justify-between relative z-10">
        {category.tables.length > 0 ? (
          <div className="flex items-center gap-2">
            <span
              className="text-2xl font-bold"
              style={{ color: category.backgroundColor }}
            >
              {isLoading ? (
                <span
                  className="inline-block w-5 h-5 border-2 border-slate-200 rounded-full animate-spin"
                  style={{ borderTopColor: category.backgroundColor }}
                />
              ) : (
                count ?? 0
              )}
            </span>
            <span className="text-slate-500 text-xs font-medium">items</span>
          </div>
        ) : (
          <span className="text-slate-500 text-xs font-medium">
            {category.actionLabel}
          </span>
        )}

        <div
          className="p-1.5 rounded-lg transition-all group-hover:translate-x-0.5"
          style={{ backgroundColor: category.backgroundColor + '15' }}
        >
          <ChevronRight
            className="w-4 h-4"
            style={{ color: category.backgroundColor }}
          />
        </div>
      </div>
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
    } else if (categoryId === 'report-sections') {
      navigate('/settings/report-sections');
    } else if (categoryId === 'localization') {
      navigate('/settings/localization');
    } else if (categoryId === 'client-portal') {
      navigate('/settings/client-portal');
    } else if (categoryId === 'import-export') {
      navigate('/settings/import-export');
    } else if (categoryId === 'notifications') {
      navigate('/settings/notifications');
    } else if (categoryId === 'currencies') {
      navigate('/settings/currencies');
    } else {
      navigate(`/settings/${categoryId}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="mb-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
            style={{
              background: 'linear-gradient(135deg, rgb(var(--color-cat-1)) 0%, rgb(var(--color-primary)) 100%)',
              boxShadow: '0 6px 20px -4px rgba(6, 182, 212, 0.4)',
            }}
          >
            <SettingsIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 mb-0.5">
              System Settings
            </h1>
            <p className="text-slate-600 text-sm">
              Configure and manage your system options
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {SETTINGS_CATEGORIES.map((category) => (
          <SettingsCategoryCard
            key={category.id}
            category={category}
            onClick={() => handleCategoryClick(category.id)}
          />
        ))}
      </div>
    </div>
  );
};
