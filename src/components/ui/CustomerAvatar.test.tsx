import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomerAvatar } from './CustomerAvatar';

describe('CustomerAvatar (cva + token + inert-without-photo fix)', () => {
  it('renders uppercase initials from first and last name', () => {
    render(<CustomerAvatar firstName="john" lastName="doe" />);
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('renders a single initial when lastName is empty (no crash)', () => {
    render(<CustomerAvatar firstName="john" lastName="" />);
    expect(screen.getByText('J')).toBeInTheDocument();
  });

  it('renders an img with alt of the full name when photoUrl is set', () => {
    render(
      <CustomerAvatar firstName="John" lastName="Doe" photoUrl="http://x/p.png" />,
    );
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img).toHaveAttribute('alt', 'John Doe');
    expect(img).toHaveAttribute('src', 'http://x/p.png');
  });

  it('is non-interactive by default (no role/tabIndex)', () => {
    const { container } = render(<CustomerAvatar firstName="John" lastName="Doe" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toHaveAttribute('role', 'button');
    expect(root).not.toHaveAttribute('tabindex');
  });

  it('interactive WITH photo: has role/tabIndex and fires onClick + Enter + Space', () => {
    const onClick = vi.fn();
    const { container } = render(
      <CustomerAvatar
        firstName="John"
        lastName="Doe"
        photoUrl="http://x/p.png"
        clickable
        onClick={onClick}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('role', 'button');
    expect(root).toHaveAttribute('tabindex', '0');
    root.click();
    fireEvent.keyDown(root, { key: 'Enter' });
    fireEvent.keyDown(root, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('REGRESSION: interactive WITHOUT photo now fires onClick + Enter + Space', () => {
    const onClick = vi.fn();
    const { container } = render(
      <CustomerAvatar
        firstName="John"
        lastName="Doe"
        clickable
        onClick={onClick}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('role', 'button');
    expect(root).toHaveAttribute('tabindex', '0');
    expect(screen.getByText('JD')).toBeInTheDocument();
    root.click();
    fireEvent.keyDown(root, { key: 'Enter' });
    fireEvent.keyDown(root, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('treats onClick alone (without clickable) as interactive', () => {
    const onClick = vi.fn();
    const { container } = render(
      <CustomerAvatar firstName="John" lastName="Doe" onClick={onClick} />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('role', 'button');
    root.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps a role="button" DIV, never a real <button> (nested-button hazard)', () => {
    const { container } = render(
      <CustomerAvatar firstName="John" lastName="Doe" clickable onClick={() => {}} />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.tagName).toBe('DIV');
  });

  it('falls back to initials when the img fails to load (onError)', () => {
    render(
      <CustomerAvatar firstName="John" lastName="Doe" photoUrl="http://x/broken.png" />,
    );
    const img = screen.getByRole('img');
    fireEvent.error(img);
    expect(screen.getByText('JD')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('PRECEDENCE: consumer className rounded-full beats base rounded-2xl', () => {
    const { container } = render(
      <CustomerAvatar firstName="John" lastName="Doe" className="rounded-full" />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('rounded-full');
    expect(root.className).not.toContain('rounded-2xl');
  });

  it('uses ring-ring + focus-visible and never cyan or text-white', () => {
    const { container } = render(
      <CustomerAvatar firstName="John" lastName="Doe" clickable onClick={() => {}} />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toContain('cyan');
    expect(root.className).not.toContain('text-white');
    expect(root.className).toContain('hover:ring-ring');
    expect(root.className).toContain('focus-visible:ring-ring');
    expect(root.className).toContain('focus-visible:ring-offset-2');
  });

  it('non-photo background uses bg-primary text-primary-foreground (no cyan)', () => {
    const { container } = render(<CustomerAvatar firstName="John" lastName="Doe" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('bg-primary');
    expect(root.className).toContain('text-primary-foreground');
    expect(root.className).not.toContain('cyan');
  });

  it('ariaLabel defaults to the translated viewPhoto string on the interactive avatar', () => {
    const { container } = render(
      <CustomerAvatar
        firstName="John"
        lastName="Doe"
        clickable
        onClick={() => {}}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('aria-label', 'View photo of John Doe');
  });

  it('ariaLabel prop wins over the default (default-only)', () => {
    const { container } = render(
      <CustomerAvatar
        firstName="John"
        lastName="Doe"
        clickable
        onClick={() => {}}
        ariaLabel="custom label"
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('aria-label', 'custom label');
  });

  it('does not set an aria-label when non-interactive', () => {
    const { container } = render(<CustomerAvatar firstName="John" lastName="Doe" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toHaveAttribute('aria-label');
  });

  it('applies the size class per size and never inline fontSize', () => {
    const cases: Array<[NonNullable<React.ComponentProps<typeof CustomerAvatar>['size']>, string]> = [
      ['sm', 'w-10'],
      ['md', 'w-14'],
      ['lg', 'w-20'],
      ['xl', 'w-24'],
    ];
    for (const [size, cls] of cases) {
      const { container, unmount } = render(
        <CustomerAvatar firstName="John" lastName="Doe" size={size} />,
      );
      const root = container.firstElementChild as HTMLElement;
      expect(root.className).toContain(cls);
      expect(root.style.fontSize).toBe('');
      unmount();
    }
  });

  it('forwards ref to the underlying element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<CustomerAvatar firstName="John" lastName="Doe" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.textContent).toBe('JD');
  });
});
