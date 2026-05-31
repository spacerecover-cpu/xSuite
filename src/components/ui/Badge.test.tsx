import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Badge } from './Badge';

describe('Badge (cva + cn precedence + active color)', () => {
  it('renders children inside a single span', () => {
    render(<Badge>hello</Badge>);
    const child = screen.getByText('hello');
    expect(child.tagName).toBe('SPAN');
  });

  it('default variant uses bg-slate-100 + text-slate-800 and md size', () => {
    render(<Badge>x</Badge>);
    const span = screen.getByText('x');
    expect(span.className).toContain('bg-slate-100');
    expect(span.className).toContain('text-slate-800');
    expect(span.className).toContain('text-sm');
  });

  it('aliases error -> danger', () => {
    render(<Badge variant="error">x</Badge>);
    const span = screen.getByText('x');
    expect(span.className).toContain('bg-danger-muted');
    expect(span.className).toContain('text-danger');
    expect(span.className).toContain('ring-danger/30');
  });

  it('aliases outline -> secondary', () => {
    render(<Badge variant="outline">x</Badge>);
    const span = screen.getByText('x');
    expect(span.className).toContain('bg-slate-200');
    expect(span.className).toContain('text-slate-700');
    expect(span.className).toContain('ring-slate-300');
  });

  it('renders each status variant via STATUS_TONE_MUTED + ring suffix', () => {
    const { rerender } = render(<Badge variant="success">x</Badge>);
    let span = screen.getByText('x');
    expect(span.className).toContain('bg-success-muted');
    expect(span.className).toContain('text-success');
    expect(span.className).toContain('ring-success/30');

    rerender(<Badge variant="warning">x</Badge>);
    span = screen.getByText('x');
    expect(span.className).toContain('bg-warning-muted');
    expect(span.className).toContain('text-warning');
    expect(span.className).toContain('ring-warning/30');

    rerender(<Badge variant="info">x</Badge>);
    span = screen.getByText('x');
    expect(span.className).toContain('bg-info-muted');
    expect(span.className).toContain('text-info');
    expect(span.className).toContain('ring-info/30');
  });

  it('PRECEDENCE: consumer className bg-primary beats base bg-slate-100', () => {
    render(<Badge className="bg-primary">x</Badge>);
    const span = screen.getByText('x');
    expect(span.className).toContain('bg-primary');
    expect(span.className).not.toContain('bg-slate-100');
  });

  it('PRECEDENCE: consumer className px-4 beats size px-2.5', () => {
    render(<Badge size="md" className="px-4">x</Badge>);
    const span = screen.getByText('x');
    expect(span.className).toContain('px-4');
    expect(span.className).not.toContain('px-2.5');
  });

  it('applies each size class', () => {
    const { rerender } = render(<Badge size="sm">x</Badge>);
    expect(screen.getByText('x').className).toContain('px-2 py-0.5 text-xs');

    rerender(<Badge size="md">x</Badge>);
    expect(screen.getByText('x').className).toContain('px-2.5 py-1 text-sm');

    rerender(<Badge size="lg">x</Badge>);
    expect(screen.getByText('x').className).toContain('px-3 py-1.5 text-base');
  });

  it('onClick adds cursor-pointer and fires on click', () => {
    let clicks = 0;
    render(<Badge onClick={() => { clicks += 1; }}>x</Badge>);
    const span = screen.getByText('x');
    expect(span.className).toContain('cursor-pointer');
    span.click();
    expect(clicks).toBe(1);
  });

  it('onClick badge is keyboard-operable (role=button, tabIndex=0, Enter/Space)', () => {
    let clicks = 0;
    render(<Badge onClick={() => { clicks += 1; }}>x</Badge>);
    const span = screen.getByText('x');
    expect(span).toHaveAttribute('role', 'button');
    expect(span).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(span, { key: 'Enter' });
    expect(clicks).toBe(1);
    fireEvent.keyDown(span, { key: ' ' });
    expect(clicks).toBe(2);
  });

  it('non-interactive badge has no role/tabIndex/cursor-pointer', () => {
    render(<Badge>x</Badge>);
    const span = screen.getByText('x');
    expect(span).not.toHaveAttribute('role');
    expect(span).not.toHaveAttribute('tabindex');
    expect(span.className).not.toContain('cursor-pointer');
  });

  it('color WITHOUT custom now applies a background (active color prop)', () => {
    render(<Badge color="green">x</Badge>);
    const span = screen.getByText('x');
    expect(span.style.backgroundColor).toBe('green');
  });

  it('color + variant=custom still works (legacy path)', () => {
    render(<Badge variant="custom" color="#3b82f6">x</Badge>);
    const span = screen.getByText('x');
    expect(span.style.backgroundColor).not.toBe('');
  });

  it('explicit style prop wins over color-derived style', () => {
    render(<Badge color="green" style={{ backgroundColor: 'rgb(1, 2, 3)' }}>x</Badge>);
    const span = screen.getByText('x');
    expect(span.style.backgroundColor).toBe('rgb(1, 2, 3)');
  });

  it('passes ...rest props (data-testid) through to the span', () => {
    render(<Badge data-testid="my-badge">x</Badge>);
    expect(screen.getByTestId('my-badge')).toBeInTheDocument();
  });

  it('explicit onClick prop wins over a rest onClick', () => {
    let explicit = 0;
    render(<Badge onClick={() => { explicit += 1; }}>x</Badge>);
    screen.getByText('x').click();
    expect(explicit).toBe(1);
  });

  it('forwards ref to the underlying span', () => {
    const ref = createRef<HTMLSpanElement>();
    render(<Badge ref={ref}>x</Badge>);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    expect(ref.current?.textContent).toBe('x');
  });
});
