import React from 'react';
import { SETTINGS_CATEGORIES } from '../../config/settingsCategories';
import { PageHeaderSlot } from './PageHeaderSlot';

/**
 * Settings sub-page header. Pushes the page's title plus its category icon and
 * colour — the same symbol and colour shown on the Settings dashboard card — into
 * the top-bar breadcrumb via PageHeaderSlot, so every settings page's top-bar
 * identity stays consistent with the dashboard. Pass `title` to override the
 * category title (e.g. when one category id backs multiple pages).
 */
export const SettingsPageHeader: React.FC<{
  categoryId: string;
  title?: string;
  actions?: React.ReactNode;
}> = ({ categoryId, title, actions }) => {
  const cat = SETTINGS_CATEGORIES.find((c) => c.id === categoryId);
  return (
    <PageHeaderSlot
      title={title ?? cat?.title ?? ''}
      icon={cat?.icon}
      iconColor={cat?.backgroundColor}
      actions={actions}
    />
  );
};
