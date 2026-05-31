import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders children inside a <button>', () => {
    render(<Button>Click me</Button>);
    const btn = screen.getByRole('button', { name: 'Click me' });
    expect(btn.tagName).toBe('BUTTON');
  });

  it('applies primary + md classes by default', () => {
    render(<Button>Go</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveClass('bg-primary', 'text-primary-foreground', 'px-4', 'py-2', 'text-base');
  });

  it('aliases outline -> ghost styling', () => {
    render(<Button variant="outline">Ghosty</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveClass('text-slate-700', 'hover:bg-slate-100');
    expect(btn).not.toHaveClass('bg-primary');
  });

  it('aliases default -> primary styling', () => {
    render(<Button variant="default">Def</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-primary', 'text-primary-foreground');
  });

  it('aliases destructive -> danger styling', () => {
    render(<Button variant="destructive">Del</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-danger', 'text-danger-foreground');
  });

  it('applies size classes', () => {
    const { rerender } = render(<Button size="sm">S</Button>);
    expect(screen.getByRole('button')).toHaveClass('px-3', 'py-1.5', 'text-sm');
    rerender(<Button size="lg">L</Button>);
    expect(screen.getByRole('button')).toHaveClass('px-6', 'py-3', 'text-lg');
  });

  it('lets a conflicting consumer className win over base/size utilities (tailwind-merge)', () => {
    render(<Button className="px-8">Wide</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveClass('px-8');
    expect(btn).not.toHaveClass('px-4');
  });

  it('uses focus-visible ring utilities, not click-time focus ring', () => {
    render(<Button>Focus</Button>);
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('focus-visible:ring-2');
    expect(cls).toContain('focus-visible:ring-offset-2');
    expect(cls).toContain('focus-visible:ring-primary');
    expect(cls).not.toContain('focus:ring-2');
    expect(cls).not.toContain('focus:ring-offset-2');
    expect(cls).not.toContain('focus:ring-primary');
  });

  it('renders a spinner + aria-busy + disabled when isLoading', () => {
    render(<Button isLoading>Saving</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toBeDisabled();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('forwards loadingLabel to the spinner', () => {
    render(<Button isLoading loadingLabel="Please wait">Saving</Button>);
    expect(screen.getByRole('status')).toHaveAccessibleName('Please wait');
  });

  it('disabled alone sets no aria-busy and renders no spinner', () => {
    render(<Button disabled>Off</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).not.toHaveAttribute('aria-busy');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('is disabled when isLoading even if disabled={false}', () => {
    render(
      <Button disabled={false} isLoading>
        Saving
      </Button>,
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('fires onClick when enabled', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Tap</Button>);
    screen.getByRole('button').click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Tap
      </Button>,
    );
    screen.getByRole('button').click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not fire onClick when loading', () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} isLoading>
        Tap
      </Button>,
    );
    screen.getByRole('button').click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('forwards aria-label and native props', () => {
    render(
      <Button aria-label="Save document" type="submit" data-testid="save-btn">
        S
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Save document' });
    expect(btn).toHaveAttribute('type', 'submit');
    expect(btn).toHaveAttribute('data-testid', 'save-btn');
  });

  it('forwards a ref to the underlying button', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.textContent).toBe('Ref');
  });
});
