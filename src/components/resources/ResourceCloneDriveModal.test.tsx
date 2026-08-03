import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// The modal only reads catalog lookups on mount; an empty chainable stub keeps
// it mountable without touching the network.
vi.mock('../../lib/supabaseClient', () => {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.is = () => builder;
  builder.order = () => Promise.resolve({ data: [], error: null });
  return {
    supabase: {
      from: () => builder,
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    },
  };
});

import { ResourceCloneDriveModal } from './ResourceCloneDriveModal';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const drive = {
  id: 'drive-1',
  label: 'CLONE-001',
  serial_number: 'WD-WCAV12345678',
  condition: 'Good',
  location: 'Shelf B',
  notes: 'Imaged from patient drive',
};

describe('ResourceCloneDriveModal', () => {
  // The list page keeps this modal mounted, so it first mounts in Add mode with
  // editingDrive=null. Without an edit-load effect the form stays blank and the
  // update wipes the record's stored metadata.
  it('populates the form when the modal is opened for an existing drive', () => {
    const { rerender } = render(
      <ResourceCloneDriveModal isOpen={false} onClose={() => {}} editingDrive={null} />,
      { wrapper },
    );

    rerender(<ResourceCloneDriveModal isOpen onClose={() => {}} editingDrive={drive} />);

    expect(screen.getByDisplayValue('CLONE-001')).toBeInTheDocument();
    expect(screen.getByDisplayValue('WD-WCAV12345678')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Imaged from patient drive')).toBeInTheDocument();
  });

  it('clears the form when the modal is reopened in add mode', () => {
    const { rerender } = render(
      <ResourceCloneDriveModal isOpen onClose={() => {}} editingDrive={drive} />,
      { wrapper },
    );
    expect(screen.getByDisplayValue('CLONE-001')).toBeInTheDocument();

    rerender(<ResourceCloneDriveModal isOpen={false} onClose={() => {}} editingDrive={null} />);
    rerender(<ResourceCloneDriveModal isOpen onClose={() => {}} editingDrive={null} />);

    expect(screen.queryByDisplayValue('CLONE-001')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('WD-WCAV12345678')).not.toBeInTheDocument();
  });
});
