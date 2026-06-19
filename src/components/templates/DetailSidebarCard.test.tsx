// src/components/templates/DetailSidebarCard.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Receipt } from 'lucide-react';
import { DetailSidebarCard } from './DetailSidebarCard';

describe('DetailSidebarCard', () => {
  it('renders the title as a heading and the children body', () => {
    render(<DetailSidebarCard title="Payment History"><div>BODY</div></DetailSidebarCard>);
    expect(screen.getByRole('heading', { name: 'Payment History' })).toBeInTheDocument();
    expect(screen.getByText('BODY')).toBeInTheDocument();
  });

  it('renders an optional icon', () => {
    const { container } = render(
      <DetailSidebarCard title="X" icon={Receipt}><span /></DetailSidebarCard>,
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
