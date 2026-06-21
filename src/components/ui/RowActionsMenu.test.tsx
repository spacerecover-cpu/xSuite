import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pencil } from 'lucide-react';
import { RowActionsMenu } from './RowActionsMenu';

describe('RowActionsMenu', () => {
  it('keeps the menu closed until the trigger is clicked', () => {
    render(<RowActionsMenu ariaLabel="Row actions" actions={[{ label: 'Edit', onClick: vi.fn() }]} />);
    expect(screen.getByLabelText('Row actions')).toBeInTheDocument();
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });

  it('opens on click, fires the chosen action, then closes', () => {
    const onClick = vi.fn();
    render(<RowActionsMenu ariaLabel="Row actions" actions={[{ label: 'Edit', icon: Pencil, onClick }]} />);

    fireEvent.click(screen.getByLabelText('Row actions'));
    const item = screen.getByText('Edit');
    expect(item).toBeInTheDocument();

    fireEvent.click(item);
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });

  it('renders a non-interactive note when provided', () => {
    render(
      <RowActionsMenu
        ariaLabel="Row actions"
        actions={[{ label: 'Open', onClick: vi.fn() }]}
        note={{ label: 'Read-only (converted)' }}
      />,
    );
    fireEvent.click(screen.getByLabelText('Row actions'));
    expect(screen.getByText('Read-only (converted)')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    render(<RowActionsMenu ariaLabel="Row actions" actions={[{ label: 'Edit', onClick: vi.fn() }]} />);
    fireEvent.click(screen.getByLabelText('Row actions'));
    expect(screen.getByText('Edit')).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });
});
