import React from 'react';

interface FinancialStatsCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'orange' | 'amber' | 'red' | 'slate' | 'purple' | 'teal';
}

const colorClasses = {
  blue: {
    gradient: 'from-info-muted to-info-muted',
    border: 'border-info/30',
    text: 'text-info',
    textValue: 'text-info',
    iconBg: 'bg-info',
  },
  green: {
    gradient: 'from-success-muted to-success-muted',
    border: 'border-success/30',
    text: 'text-success',
    textValue: 'text-success',
    iconBg: 'bg-success',
  },
  orange: {
    gradient: 'from-warning-muted to-warning-muted',
    border: 'border-warning/30',
    text: 'text-warning',
    textValue: 'text-warning',
    iconBg: 'bg-warning',
  },
  amber: {
    gradient: 'from-warning-muted to-warning-muted',
    border: 'border-warning/30',
    text: 'text-warning',
    textValue: 'text-warning',
    iconBg: 'bg-warning',
  },
  red: {
    gradient: 'from-danger-muted to-danger-muted',
    border: 'border-danger/30',
    text: 'text-danger',
    textValue: 'text-danger',
    iconBg: 'bg-danger',
  },
  slate: {
    gradient: 'from-slate-50 to-slate-100',
    border: 'border-slate-200',
    text: 'text-slate-600',
    textValue: 'text-slate-900',
    iconBg: 'bg-slate-500',
  },
  purple: {
    gradient: 'from-accent/10 to-accent/20',
    border: 'border-accent/30',
    text: 'text-accent-foreground',
    textValue: 'text-accent-foreground',
    iconBg: 'bg-accent',
  },
  teal: {
    gradient: 'from-info-muted to-info-muted',
    border: 'border-info/30',
    text: 'text-info',
    textValue: 'text-info',
    iconBg: 'bg-info',
  },
};

export const FinancialStatsCard: React.FC<FinancialStatsCardProps> = ({
  label,
  value,
  icon,
  color,
}) => {
  const colors = colorClasses[color];

  return (
    <div
      className={`bg-gradient-to-br ${colors.gradient} rounded-xl p-4 border ${colors.border}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-xs font-medium ${colors.text} uppercase tracking-wide`}>
            {label}
          </p>
          <p className={`text-2xl font-bold ${colors.textValue} mt-1`}>{value}</p>
        </div>
        <div className={`w-10 h-10 ${colors.iconBg} rounded-lg flex items-center justify-center`}>
          {icon}
        </div>
      </div>
    </div>
  );
};
