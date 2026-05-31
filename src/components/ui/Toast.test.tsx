import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toast } from './Toast';

// Lucide icon class names (verified in jsdom render):
//   success CheckCircle  -> lucide-circle-check-big
//   error   XCircle      -> lucide-circle-x
//   warning AlertTriangle-> lucide-triangle-alert
//   info    Info         -> lucide-info
//   loading Loader2      -> lucide-loader-circle
const ICON_CLASS = {
  success: 'lucide-circle-check-big',
  error: 'lucide-circle-x',
  warning: 'lucide-triangle-alert',
  info: 'lucide-info',
  loading: 'lucide-loader-circle',
} as const;

function root(container: HTMLElement): HTMLElement {
  return container.firstElementChild as HTMLElement;
}

describe('Toast (Phase 3: aria-live + STATUS_TONE_MUTED tones)', () => {
  it('renders the message text', () => {
    render(<Toast message="Saved successfully" type="success" />);
    expect(screen.getByText('Saved successfully')).toBeInTheDocument();
  });

  it('renders the correct icon per type', () => {
    for (const type of ['success', 'error', 'warning', 'info', 'loading'] as const) {
      const { container, unmount } = render(<Toast message="m" type={type} />);
      const svg = container.querySelector(`svg.${ICON_CLASS[type]}`);
      expect(svg, `expected ${ICON_CLASS[type]} for type=${type}`).toBeTruthy();
      unmount();
    }
  });

  it('marks the status icon aria-hidden', () => {
    const { container } = render(<Toast message="m" type="success" />);
    const svg = container.querySelector(`svg.${ICON_CLASS.success}`);
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  describe('aria-live (the bug fix)', () => {
    it('error -> role="alert" aria-live="assertive" aria-atomic="true"', () => {
      const { container } = render(<Toast message="boom" type="error" />);
      const el = root(container);
      expect(el).toHaveAttribute('role', 'alert');
      expect(el).toHaveAttribute('aria-live', 'assertive');
      expect(el).toHaveAttribute('aria-atomic', 'true');
    });

    it('warning -> role="alert" aria-live="assertive"', () => {
      const { container } = render(<Toast message="careful" type="warning" />);
      const el = root(container);
      expect(el).toHaveAttribute('role', 'alert');
      expect(el).toHaveAttribute('aria-live', 'assertive');
    });

    it('success -> role="status" aria-live="polite"', () => {
      const { container } = render(<Toast message="ok" type="success" />);
      const el = root(container);
      expect(el).toHaveAttribute('role', 'status');
      expect(el).toHaveAttribute('aria-live', 'polite');
      expect(el).toHaveAttribute('aria-atomic', 'true');
    });

    it('info -> role="status" aria-live="polite"', () => {
      const { container } = render(<Toast message="fyi" type="info" />);
      const el = root(container);
      expect(el).toHaveAttribute('role', 'status');
      expect(el).toHaveAttribute('aria-live', 'polite');
    });

    it('loading -> role="status" aria-live="polite"', () => {
      const { container } = render(<Toast message="working" type="loading" />);
      const el = root(container);
      expect(el).toHaveAttribute('role', 'status');
      expect(el).toHaveAttribute('aria-live', 'polite');
    });

    it('explicit role/aria-live props override the type-derived defaults', () => {
      const { container } = render(
        <Toast message="m" type="error" role="status" aria-live="polite" />,
      );
      const el = root(container);
      expect(el).toHaveAttribute('role', 'status');
      expect(el).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('per-type color mapping (covers error->danger / loading->info off-by-one)', () => {
    it('success uses success-muted background + success text', () => {
      const { container } = render(<Toast message="m" type="success" />);
      const el = root(container);
      expect(el.className).toContain('bg-success-muted');
      expect(el.className).toContain('text-success');
      expect(el.className).toContain('border-success');
    });

    it('error maps to the DANGER token, not a literal "error" token', () => {
      const { container } = render(<Toast message="m" type="error" />);
      const el = root(container);
      expect(el.className).toContain('bg-danger-muted');
      expect(el.className).toContain('text-danger');
      expect(el.className).toContain('border-danger');
      expect(el.className).not.toContain('bg-error-muted');
    });

    it('warning uses the warning token', () => {
      const { container } = render(<Toast message="m" type="warning" />);
      const el = root(container);
      expect(el.className).toContain('bg-warning-muted');
      expect(el.className).toContain('text-warning');
      expect(el.className).toContain('border-warning');
    });

    it('info uses the info token', () => {
      const { container } = render(<Toast message="m" type="info" />);
      const el = root(container);
      expect(el.className).toContain('bg-info-muted');
      expect(el.className).toContain('text-info');
      expect(el.className).toContain('border-info');
    });

    it('loading maps to the INFO token (not a literal "loading" token)', () => {
      const { container } = render(<Toast message="m" type="loading" />);
      const el = root(container);
      expect(el.className).toContain('bg-info-muted');
      expect(el.className).toContain('text-info');
      expect(el.className).toContain('border-info');
    });
  });

  describe('close button', () => {
    it('renders a close button when type!=="loading" and onClose is provided', () => {
      render(<Toast message="m" type="success" onClose={() => {}} />);
      expect(
        screen.getByRole('button', { name: 'Close notification' }),
      ).toBeInTheDocument();
    });

    it('does not render a close button when onClose is omitted', () => {
      render(<Toast message="m" type="success" />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('does not render a close button for the loading type even with onClose', () => {
      render(<Toast message="m" type="loading" onClose={() => {}} />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('fires onClose exactly once on click', () => {
      const onClose = vi.fn();
      render(<Toast message="m" type="success" onClose={onClose} />);
      fireEvent.click(screen.getByRole('button', { name: 'Close notification' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('uses t("ui.toast.close") as the default close aria-label', () => {
      render(<Toast message="m" type="success" onClose={() => {}} />);
      const btn = screen.getByRole('button');
      expect(btn).toHaveAttribute('aria-label', 'Close notification');
    });

    it('closeLabel overrides the default close aria-label', () => {
      render(
        <Toast message="m" type="success" onClose={() => {}} closeLabel="Dismiss" />,
      );
      expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
    });
  });

  describe('progress bar', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('renders the neutral progress track (no bg-black) when duration is set and not loading', () => {
      const { container } = render(
        <Toast message="m" type="success" duration={3000} />,
      );
      expect(container.innerHTML).not.toContain('bg-black');
      const track = container.querySelector('.bg-slate-200\\/60');
      expect(track).toBeTruthy();
    });

    it('does not render a progress track without a duration', () => {
      const { container } = render(<Toast message="m" type="success" />);
      expect(container.querySelector('.bg-slate-200\\/60')).toBeFalsy();
    });

    it('does not render a progress track for the loading type', () => {
      const { container } = render(
        <Toast message="m" type="loading" duration={3000} />,
      );
      expect(container.querySelector('.bg-slate-200\\/60')).toBeFalsy();
    });
  });

  it('PRECEDENCE: consumer className max-w-xs beats base max-w-md', () => {
    const { container } = render(
      <Toast message="m" type="success" className="max-w-xs" />,
    );
    const el = root(container);
    expect(el.className).toContain('max-w-xs');
    expect(el.className).not.toContain('max-w-md');
  });

  it('forwards ref to the root div', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Toast message="m" type="success" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.textContent).toContain('m');
  });
});
