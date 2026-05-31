import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { Card } from './Card';

describe('Card (cva pilot)', () => {
  it('renders children inside a single div', () => {
    render(
      <Card>
        <span>card body</span>
      </Card>,
    );
    const child = screen.getByText('card body');
    expect(child).toBeInTheDocument();
    expect(child.parentElement?.tagName).toBe('DIV');
  });

  it('default variant has shadow-sm + border-t-4 and not border/border-2', () => {
    const { container } = render(<Card>x</Card>);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain('shadow-sm');
    expect(div.className).toContain('border-t-4');
    expect(div.className).not.toContain(' border ');
    expect(div.className).not.toContain('border-2');
  });

  it('bordered variant uses border border-slate-200', () => {
    const { container } = render(<Card variant="bordered">x</Card>);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain('border');
    expect(div.className).toContain('border-slate-200');
    expect(div.className).not.toContain('shadow-sm');
  });

  it('outlined variant uses border-2', () => {
    const { container } = render(<Card variant="outlined">x</Card>);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain('border-2');
    expect(div.className).not.toContain('shadow-sm');
  });

  it('uses bg-surface and never bg-white', () => {
    const { container } = render(<Card>x</Card>);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain('bg-surface');
    expect(div.className).not.toContain('bg-white');
  });

  it('hoverable adds cursor-pointer', () => {
    const { container } = render(<Card hoverable>x</Card>);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain('cursor-pointer');
  });

  it('non-hoverable does not add cursor-pointer', () => {
    const { container } = render(<Card>x</Card>);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).not.toContain('cursor-pointer');
  });

  it('PRECEDENCE: consumer className shadow-lg beats base shadow-sm', () => {
    const { container } = render(<Card className="shadow-lg">x</Card>);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain('shadow-lg');
    expect(div.className).not.toContain('shadow-sm');
  });

  it('applies borderColor inline only on the default variant', () => {
    const { container, rerender } = render(
      <Card borderColor="rgb(1, 2, 3)">x</Card>,
    );
    const defaultDiv = container.firstElementChild as HTMLElement;
    expect(defaultDiv.style.borderTopColor).toBe('rgb(1, 2, 3)');

    rerender(
      <Card variant="bordered" borderColor="rgb(1, 2, 3)">
        x
      </Card>,
    );
    const borderedDiv = container.firstElementChild as HTMLElement;
    expect(borderedDiv.style.borderTopColor).toBe('');
  });

  it('passes onClick, role, tabIndex and aria-label through to the div', async () => {
    let clicks = 0;
    const { container } = render(
      <Card
        onClick={() => {
          clicks += 1;
        }}
        role="button"
        tabIndex={0}
        aria-label="open card"
      >
        x
      </Card>,
    );
    const div = container.firstElementChild as HTMLElement;
    expect(div).toHaveAttribute('role', 'button');
    expect(div).toHaveAttribute('tabindex', '0');
    expect(div).toHaveAttribute('aria-label', 'open card');
    div.click();
    expect(clicks).toBe(1);
  });

  it('forwards ref to the underlying div', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Card ref={ref}>x</Card>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.textContent).toBe('x');
  });
});
