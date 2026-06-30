import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { usePageHeaderSlot } from '../../contexts/HeaderSlotContext';

/**
 * Declarative slot a page renders where its old PageHeader row was. Renders
 * nothing inline (the title + optional icon go to the top-bar breadcrumb; actions
 * are portaled into the bar's actions host). Use under AppLayout only.
 */
export const PageHeaderSlot: React.FC<{
  title: string;
  icon?: LucideIcon;
  iconColor?: string;
  actions?: React.ReactNode;
}> = ({ title, icon, iconColor, actions }) => usePageHeaderSlot({ title, icon, iconColor, actions });
