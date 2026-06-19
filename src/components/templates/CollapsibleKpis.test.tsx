import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { readHint, loadFlag, setFlag } = vi.hoisted(() => ({
  readHint: vi.fn(() => false),
  loadFlag: vi.fn(async () => false),
  setFlag: vi.fn(async () => {}),
}));
vi.mock('../../lib/uiPrefsService', () => ({
  UI_FLAG_KPIS_COLLAPSED: 'kpisCollapsed',
  readUiFlagHint: readHint,
  loadUiFlag: loadFlag,
  setUiFlag: setFlag,
}));

import { CollapsibleKpis } from './CollapsibleKpis';

describe('CollapsibleKpis', () => {
  beforeEach(() => {
    readHint.mockReturnValue(false);
    loadFlag.mockResolvedValue(false);
    setFlag.mockClear();
  });

  it('renders the kpis and a "Hide stats" toggle when expanded', () => {
    render(<CollapsibleKpis><div>KPIS</div></CollapsibleKpis>);
    expect(screen.getByText('KPIS')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide stats' })).toBeInTheDocument();
  });

  it('collapses on click — hides kpis, swaps to "Show stats", and persists true', () => {
    render(<CollapsibleKpis><div>KPIS</div></CollapsibleKpis>);
    fireEvent.click(screen.getByRole('button', { name: 'Hide stats' }));
    expect(screen.queryByText('KPIS')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show stats' })).toBeInTheDocument();
    expect(setFlag).toHaveBeenCalledWith('kpisCollapsed', true);
  });

  it('starts collapsed when the persisted localStorage hint is true', () => {
    readHint.mockReturnValue(true);
    render(<CollapsibleKpis><div>KPIS</div></CollapsibleKpis>);
    expect(screen.queryByText('KPIS')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show stats' })).toBeInTheDocument();
  });

  it('reconciles to the server value (collapsed) on mount', async () => {
    loadFlag.mockResolvedValue(true); // hint says expanded, server says collapsed
    render(<CollapsibleKpis><div>KPIS</div></CollapsibleKpis>);
    expect(screen.getByText('KPIS')).toBeInTheDocument(); // first paint from hint
    await waitFor(() => expect(screen.queryByText('KPIS')).toBeNull());
  });
});
