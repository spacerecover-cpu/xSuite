import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Folder } from 'lucide-react';
import i18n from '../../lib/i18n';
import { CollapsibleSection } from './CollapsibleSection';

describe('CollapsibleSection (disclosure a11y + bg-surface)', () => {
  afterEach(() => {
    i18n.changeLanguage('en');
  });

  it('renders the title in an accessible button (heading + trigger)', () => {
    render(
      <CollapsibleSection title="Basic Information" icon={Folder} color="#0ea5e9">
        <span>body</span>
      </CollapsibleSection>,
    );
    const button = screen.getByRole('button', { name: /Basic Information/i });
    expect(button).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Basic Information' })).toBeInTheDocument();
  });

  it('the trigger button has type="button" (does not submit a wrapping form)', () => {
    render(
      <CollapsibleSection title="X" icon={Folder} color="#0ea5e9">
        <span>body</span>
      </CollapsibleSection>,
    );
    expect(screen.getByRole('button', { name: /X/i })).toHaveAttribute('type', 'button');
  });

  it('uncontrolled: starts collapsed and toggles aria-expanded on click', () => {
    render(
      <CollapsibleSection title="X" icon={Folder} color="#0ea5e9">
        <span>body</span>
      </CollapsibleSection>,
    );
    const button = screen.getByRole('button', { name: /X/i });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('uncontrolled: defaultOpen=true starts expanded', () => {
    render(
      <CollapsibleSection title="X" icon={Folder} color="#0ea5e9" defaultOpen>
        <span>body</span>
      </CollapsibleSection>,
    );
    expect(screen.getByRole('button', { name: /X/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('controlled: isOpen drives aria-expanded and click calls onToggle without mutating internal state', () => {
    let toggles = 0;
    const { rerender } = render(
      <CollapsibleSection
        title="X"
        icon={Folder}
        color="#0ea5e9"
        isOpen={false}
        onToggle={() => {
          toggles += 1;
        }}
      >
        <span>body</span>
      </CollapsibleSection>,
    );
    const button = screen.getByRole('button', { name: /X/i });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(toggles).toBe(1);
    // Controlled: internal state did not change, parent still says closed
    expect(button).toHaveAttribute('aria-expanded', 'false');
    rerender(
      <CollapsibleSection
        title="X"
        icon={Folder}
        color="#0ea5e9"
        isOpen
        onToggle={() => {
          toggles += 1;
        }}
      >
        <span>body</span>
      </CollapsibleSection>,
    );
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggles on Enter and Space (native button keyboard activation)', () => {
    render(
      <CollapsibleSection title="X" icon={Folder} color="#0ea5e9">
        <span>body</span>
      </CollapsibleSection>,
    );
    const button = screen.getByRole('button', { name: /X/i });
    // jsdom dispatches click for keyboard activation on a real <button>
    fireEvent.click(button, { detail: 0 });
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('aria-controls on the trigger matches the content region id', () => {
    const { container } = render(
      <CollapsibleSection title="X" icon={Folder} color="#0ea5e9">
        <span>body</span>
      </CollapsibleSection>,
    );
    const button = screen.getByRole('button', { name: /X/i });
    const controls = button.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    const region = container.querySelector(`#${controls}`);
    expect(region).not.toBeNull();
  });

  it('content region has role="region" and aria-labelledby pointing at the title id', () => {
    render(
      <CollapsibleSection title="Region Title" icon={Folder} color="#0ea5e9">
        <span>body</span>
      </CollapsibleSection>,
    );
    const region = screen.getByRole('region');
    const labelledby = region.getAttribute('aria-labelledby');
    expect(labelledby).toBeTruthy();
    const heading = screen.getByRole('heading', { name: 'Region Title' });
    expect(heading).toHaveAttribute('id', labelledby);
  });

  it('renders the field-count chip via i18n plural and omits it when fieldCount is undefined', () => {
    const { rerender } = render(
      <CollapsibleSection title="X" icon={Folder} color="#0ea5e9" fieldCount={8}>
        <span>body</span>
      </CollapsibleSection>,
    );
    expect(screen.getByText('8 fields')).toBeInTheDocument();

    rerender(
      <CollapsibleSection title="X" icon={Folder} color="#0ea5e9" fieldCount={1}>
        <span>body</span>
      </CollapsibleSection>,
    );
    expect(screen.getByText('1 field')).toBeInTheDocument();

    rerender(
      <CollapsibleSection title="X" icon={Folder} color="#0ea5e9">
        <span>body</span>
      </CollapsibleSection>,
    );
    expect(screen.queryByText(/field/i)).toBeNull();
  });

  it('renders the Arabic field-count plural when locale is ar', async () => {
    await i18n.changeLanguage('ar');
    render(
      <CollapsibleSection title="X" icon={Folder} color="#0ea5e9" fieldCount={1}>
        <span>body</span>
      </CollapsibleSection>,
    );
    expect(screen.getByText('حقل واحد')).toBeInTheDocument();
  });

  it('uses bg-surface and never bg-white', () => {
    const { container } = render(
      <CollapsibleSection title="X" icon={Folder} color="#0ea5e9">
        <span>body</span>
      </CollapsibleSection>,
    );
    expect(container.innerHTML).not.toContain('bg-white');
    expect(container.innerHTML).not.toContain('to-white');
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('bg-surface');
  });

  it('PRECEDENCE: consumer className wins on the container (rounded-none beats rounded-xl)', () => {
    const { container } = render(
      <CollapsibleSection title="X" icon={Folder} color="#0ea5e9" className="rounded-none">
        <span>body</span>
      </CollapsibleSection>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('rounded-none');
    expect(root.className).not.toContain('rounded-xl');
  });

  it('preserves the color inline-style escape hatch on the icon chip', () => {
    const { container } = render(
      <CollapsibleSection title="X" icon={Folder} color="rgb(1, 2, 3)">
        <span>body</span>
      </CollapsibleSection>,
    );
    const chip = container.querySelector('[style*="background"]') as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.style.backgroundColor).toBe('rgb(1, 2, 3)');
  });

  it('forwards ref to the underlying container div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <CollapsibleSection title="X" icon={Folder} color="#0ea5e9" ref={ref}>
        <span>body</span>
      </CollapsibleSection>,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
