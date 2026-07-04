import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RequirementFailuresPanel } from './RequirementFailuresPanel';

describe('RequirementFailuresPanel', () => {
  it('renders block failures as errors and warn failures as warnings', () => {
    render(<RequirementFailuresPanel failures={[
      { field_key: 'buyer_tax_number', level: 'block', message: 'Buyer VATIN is required for B2B tax invoices.' },
      { field_key: 'buyer_address', level: 'warn', message: 'Buyer address is expected on B2B tax invoices.' },
    ]} />);
    expect(screen.getByText('Buyer VATIN is required for B2B tax invoices.')).toBeInTheDocument();
    expect(screen.getByText('Buyer address is expected on B2B tax invoices.')).toBeInTheDocument();
    expect(screen.getByTestId('requirement-block-count').textContent).toContain('1');
  });

  it('tints block failures with danger tokens and warn failures with warning tokens', () => {
    render(<RequirementFailuresPanel failures={[
      { field_key: 'buyer_tax_number', level: 'block', message: 'Blocking message.' },
      { field_key: 'buyer_address', level: 'warn', message: 'Warning message.' },
    ]} />);
    const blockCount = screen.getByTestId('requirement-block-count');
    expect(blockCount).toHaveClass('text-danger');
    expect(blockCount.parentElement).toHaveClass('border-danger/40', 'bg-danger-muted');
    const warnHeading = screen.getByText('Review before issuing');
    expect(warnHeading).toHaveClass('text-warning');
    expect(warnHeading.parentElement).toHaveClass('border-warning/40', 'bg-warning-muted');
  });

  it('renders nothing for an empty list', () => {
    const { container } = render(<RequirementFailuresPanel failures={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
