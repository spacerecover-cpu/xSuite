// src/components/templates/DetailSidebarCard.tsx
import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface DetailSidebarCardProps {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}

/** Opt-in sugar killing the repeated "Card + icon + h3" sidebar pattern. */
export const DetailSidebarCard: React.FC<DetailSidebarCardProps> = ({ title, icon: Icon, children }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-4">
    <div className="flex items-center gap-2 mb-3">
      {Icon && <Icon className="w-4 h-4 text-slate-400" aria-hidden="true" />}
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    </div>
    {children}
  </div>
);
