import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginForm } from './LoginForm';
import { supabase } from '../../../lib/supabaseClient';

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { auth: { resetPasswordForEmail: vi.fn(async () => ({ error: null })) } },
}));

function renderForm(over: Partial<{ onSubmit: (e: string, p: string) => Promise<void>; error: string; loading: boolean }> = {}) {
  const onSubmit = over.onSubmit ?? vi.fn(async () => {});
  render(
    <MemoryRouter>
      <LoginForm onSubmit={onSubmit} error={over.error ?? ''} loading={over.loading ?? false} />
    </MemoryRouter>,
  );
  return { onSubmit };
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.mocked(supabase.auth.resetPasswordForEmail).mockClear();
  });

  it('submits email + password through the onSubmit contract', async () => {
    const { onSubmit } = renderForm();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'tech@lab.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Passw0rd' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in to xSuite/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('tech@lab.com', 'Passw0rd'));
  });

  it('has a real "Remember me" checkbox, checked by default', () => {
    renderForm();
    const checkbox = screen.getByRole('checkbox', { name: 'Remember me' });
    expect(checkbox).toBeChecked();
  });

  it('writes the persistence flag BEFORE onSubmit when unchecked (session must land in sessionStorage)', async () => {
    let flagAtSubmit: string | null = 'unset';
    const onSubmit = vi.fn(async () => {
      flagAtSubmit = localStorage.getItem('xsuite_auth_persist');
    });
    renderForm({ onSubmit });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Remember me' }));
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'tech@lab.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Passw0rd' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in to xSuite/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(flagAtSubmit).toBe('0');
  });

  it('writes the persistence flag as "1" when left checked', async () => {
    let flagAtSubmit: string | null = 'unset';
    const onSubmit = vi.fn(async () => {
      flagAtSubmit = localStorage.getItem('xsuite_auth_persist');
    });
    renderForm({ onSubmit });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'tech@lab.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Passw0rd' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in to xSuite/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(flagAtSubmit).toBe('1');
  });

  it('reveals the forgot-password sub-view and requests a reset link with the /reset-password redirect', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'tech@lab.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Forgot Password?' }));

    expect(await screen.findByText('Reset your password')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    await waitFor(() => {
      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'tech@lab.com',
        { redirectTo: `${window.location.origin}/reset-password` },
      );
    });

    // Neutral, non-enumerating confirmation + resend cooldown
    expect(await screen.findByText(/a reset link is on its way/)).toBeInTheDocument();
    expect(screen.getByText(/Resend in \d+s/)).toBeInTheDocument();
  });

  it('returns from the forgot view to sign-in', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Forgot Password?' }));
    expect(await screen.findByText('Reset your password')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(await screen.findByRole('button', { name: /Sign in to xSuite/ })).toBeInTheDocument();
  });

  it('shows the error banner from props', () => {
    renderForm({ error: 'Invalid login credentials' });
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid login credentials');
  });
});
