import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pager } from './Pager';

describe('Pager', () => {
  it('renders the current range', () => {
    render(<Pager page={0} pageSize={50} total={123} onPageChange={() => {}} itemNoun="invoices" />);
    expect(screen.getByText('1–50 of 123')).toBeInTheDocument();
  });

  it('renders an empty-state label with the item noun', () => {
    render(<Pager page={0} pageSize={50} total={0} onPageChange={() => {}} itemNoun="payments" />);
    expect(screen.getByText('0 payments')).toBeInTheDocument();
  });

  it('disables Previous on the first page', () => {
    render(<Pager page={0} pageSize={50} total={123} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('disables Next on the last page and shows the tail range', () => {
    render(<Pager page={2} pageSize={50} total={123} onPageChange={() => {}} />);
    expect(screen.getByText('101–123 of 123')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
  });

  it('calls onPageChange with the next/previous index', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<Pager page={1} pageSize={50} total={123} onPageChange={onPageChange} />);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPageChange).toHaveBeenCalledWith(0);
  });
});
