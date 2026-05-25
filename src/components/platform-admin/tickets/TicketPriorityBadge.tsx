import React from 'react';
import { Badge } from '../../ui/Badge';

interface TicketPriorityBadgeProps {
  priority: string;
}

export const TicketPriorityBadge: React.FC<TicketPriorityBadgeProps> = ({ priority }) => {
  const getVariant = (): 'default' | 'info' | 'warning' | 'danger' => {
    switch (priority) {
      case 'low': return 'default';
      case 'medium': return 'info';
      case 'high': return 'warning';
      case 'urgent': return 'danger';
      default: return 'default';
    }
  };

  return (
    <Badge variant={getVariant()}>
      {priority.toUpperCase()}
    </Badge>
  );
};
