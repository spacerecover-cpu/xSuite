import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  it('shows on hover and hides on mouse leave', async () => {
    const user = userEvent.setup();
    render(<Tooltip label="Cases"><button>icon</button></Tooltip>);

    expect(screen.queryByRole('tooltip')).toBeNull();
    await user.hover(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Cases');
    await user.unhover(screen.getByRole('button'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows on keyboard focus (not hover-only)', async () => {
    const user = userEvent.setup();
    render(<Tooltip label="Cases"><button>icon</button></Tooltip>);

    await user.tab();
    expect(screen.getByRole('button')).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Cases');
  });

  it('dismisses on Escape', async () => {
    const user = userEvent.setup();
    render(<Tooltip label="Cases"><button>icon</button></Tooltip>);

    await user.tab();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('never renders a tooltip when disabled', async () => {
    const user = userEvent.setup();
    render(<Tooltip label="Cases" disabled><button>icon</button></Tooltip>);

    await user.hover(screen.getByRole('button'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
