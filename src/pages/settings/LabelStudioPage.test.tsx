import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Settings → Label Studio: the three thermal label cards live here (moved out
// of the Documents Studio) and open the dedicated LabelStudio editor.
// ---------------------------------------------------------------------------

const { roleRef } = vi.hoisted(() => ({ roleRef: { current: 'admin' } }));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { role: roleRef.current } }),
}));
vi.mock('../../components/layout/SettingsPageHeader', () => ({
  SettingsPageHeader: () => null,
}));
vi.mock('../../components/settings/labels/LabelStudio', () => ({
  LabelStudio: ({ label }: { label: string }) => <div data-testid="label-studio">{label}</div>,
}));

import { LabelStudioPage } from './LabelStudioPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <LabelStudioPage />
    </MemoryRouter>,
  );
}

describe('LabelStudioPage', () => {
  it('shows case, stock AND inventory thermal label cards', () => {
    roleRef.current = 'admin';
    renderPage();

    expect(screen.getByRole('heading', { name: 'Case label' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Stock label' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Inventory label' })).toBeInTheDocument();
  });

  it('opens the LabelStudio when a label card is designed', async () => {
    roleRef.current = 'admin';
    renderPage();

    const card = screen.getByRole('heading', { name: 'Inventory label' }).closest('div.flex.flex-col')!;
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: /Design/ }));
    const studio = await screen.findByTestId('label-studio');
    expect(studio).toHaveTextContent('Inventory label');
  });

  it('viewers get Preview buttons and the read-only notice', () => {
    roleRef.current = 'viewer';
    renderPage();

    expect(screen.getAllByRole('button', { name: /Preview/ })).toHaveLength(3);
    expect(screen.getByText(/only managers and admins can edit/i)).toBeInTheDocument();
  });
});
