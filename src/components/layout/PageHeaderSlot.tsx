import React from 'react';
import { usePageHeaderSlot } from '../../contexts/HeaderSlotContext';

/**
 * Declarative slot a list page renders where its old PageHeader row was. Renders
 * nothing inline (the title goes to the top-bar breadcrumb; actions are portaled
 * into the bar's actions host). Use under AppLayout only.
 */
export const PageHeaderSlot: React.FC<{ title: string; actions?: React.ReactNode }> = ({ title, actions }) =>
  usePageHeaderSlot({ title, actions });
