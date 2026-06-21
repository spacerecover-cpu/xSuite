import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { FolderOpen } from 'lucide-react';
import { SidebarNavItem } from './SidebarNavItem';

vi.mock('../../contexts/SidebarPreferencesContext', () => ({
  useSidebarPreferences: () => ({ position: 'left' }),
}));

type ItemProps = Parameters<typeof SidebarNavItem>[0];

function renderItem(props: ItemProps, path = '/dashboard') {
  const router = createMemoryRouter([{ path: '*', element: <SidebarNavItem {...props} /> }], {
    initialEntries: [path],
  });
  return render(<RouterProvider router={router} />);
}

describe('SidebarNavItem', () => {
  it('marks the active item with a solid primary pill + aria-current', () => {
    renderItem({ to: '/cases', icon: FolderOpen, label: 'Cases' }, '/cases');
    const link = screen.getByRole('link', { name: 'Cases' });
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link.className).toContain('bg-primary');
    expect(link.className).toContain('text-primary-foreground');
  });

  it('renders an inactive item without aria-current', () => {
    renderItem({ to: '/cases', icon: FolderOpen, label: 'Cases' }, '/dashboard');
    const link = screen.getByRole('link', { name: 'Cases' });
    expect(link).not.toHaveAttribute('aria-current');
    expect(link.className).toContain('text-slate-700');
  });

  it('renders a badge when provided', () => {
    renderItem({ to: '/cases', icon: FolderOpen, label: 'Cases', badge: 3 }, '/dashboard');
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('exposes an accessible name when collapsed (icon-only)', () => {
    renderItem({ to: '/cases', icon: FolderOpen, label: 'Cases', isCollapsed: true }, '/dashboard');
    // No visible label text, so the name must come from aria-label.
    expect(screen.getByRole('link', { name: 'Cases' })).toBeInTheDocument();
  });
});
