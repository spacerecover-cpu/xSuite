import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import i18n from '../../lib/i18n';
import { DeviceRoleBadge } from './DeviceRoleBadge';

const getBadge = (container: HTMLElement) =>
  container.firstElementChild as HTMLElement;

describe('DeviceRoleBadge (self-contained cva + i18n labels)', () => {
  afterEach(() => {
    // ensure each test starts from the pinned English locale
    if (i18n.language !== 'en') i18n.changeLanguage('en');
  });

  it('renders the patient role label + icon by default classes', () => {
    const { container } = render(<DeviceRoleBadge role="patient" />);
    const badge = getBadge(container);
    expect(badge).toHaveTextContent('Patient');
    expect(badge.className).toContain('bg-info-muted');
    expect(badge.className).toContain('text-info');
    expect(badge.className).toContain('border-info/30');
    // default md size + icon
    expect(badge.querySelector('svg')).not.toBeNull();
  });

  it('renders the backup role with success tone', () => {
    const { container } = render(<DeviceRoleBadge role="backup" />);
    const badge = getBadge(container);
    expect(badge).toHaveTextContent('Backup');
    expect(badge.className).toContain('bg-success-muted');
    expect(badge.className).toContain('text-success');
    expect(badge.className).toContain('border-success/30');
  });

  it('renders the donor role with warning tone', () => {
    const { container } = render(<DeviceRoleBadge role="donor" />);
    const badge = getBadge(container);
    expect(badge).toHaveTextContent('Donor');
    expect(badge.className).toContain('bg-warning-muted');
    expect(badge.className).toContain('text-warning');
    expect(badge.className).toContain('border-warning/30');
  });

  it('renders the clone role with the self-contained accent map (not the shared muted map)', () => {
    const { container } = render(<DeviceRoleBadge role="clone" />);
    const badge = getBadge(container);
    expect(badge).toHaveTextContent('Clone');
    expect(badge.className).toContain('bg-accent');
    expect(badge.className).toContain('text-accent-foreground');
    expect(badge.className).toContain('border-accent-foreground/20');
  });

  it('case-insensitive: DONOR resolves to the donor role', () => {
    const { container } = render(<DeviceRoleBadge role="DONOR" />);
    const badge = getBadge(container);
    expect(badge).toHaveTextContent('Donor');
    expect(badge.className).toContain('bg-warning-muted');
  });

  it('case-insensitive: Donor resolves to the donor role', () => {
    const { container } = render(<DeviceRoleBadge role="Donor" />);
    const badge = getBadge(container);
    expect(badge).toHaveTextContent('Donor');
    expect(badge.className).toContain('text-warning');
  });

  it('unknown role falls back to patient (label + info tone)', () => {
    const { container } = render(<DeviceRoleBadge role="not-a-real-role" />);
    const badge = getBadge(container);
    expect(badge).toHaveTextContent('Patient');
    expect(badge.className).toContain('bg-info-muted');
  });

  it('empty role falls back to patient', () => {
    const { container } = render(<DeviceRoleBadge role="" />);
    const badge = getBadge(container);
    expect(badge).toHaveTextContent('Patient');
    expect(badge.className).toContain('bg-info-muted');
  });

  it('showIcon=false renders the label without an svg icon', () => {
    const { container } = render(<DeviceRoleBadge role="patient" showIcon={false} />);
    const badge = getBadge(container);
    expect(badge).toHaveTextContent('Patient');
    expect(badge.querySelector('svg')).toBeNull();
  });

  it('applies size classes (sm)', () => {
    const { container } = render(<DeviceRoleBadge role="patient" size="sm" />);
    const badge = getBadge(container);
    expect(badge.className).toContain('text-xs');
    expect(badge.className).toContain('px-2');
    expect(badge.className).toContain('py-0.5');
  });

  it('applies size classes (lg)', () => {
    const { container } = render(<DeviceRoleBadge role="patient" size="lg" />);
    const badge = getBadge(container);
    expect(badge.className).toContain('text-base');
    expect(badge.className).toContain('px-3');
    expect(badge.className).toContain('py-1.5');
  });

  it('PRECEDENCE: consumer className px-8 wins over size px-* but role bg is retained', () => {
    const { container } = render(
      <DeviceRoleBadge role="donor" size="sm" className="px-8" />,
    );
    const badge = getBadge(container);
    expect(badge.className).toContain('px-8');
    expect(badge.className).not.toContain('px-2');
    // role tone survives the merge
    expect(badge.className).toContain('bg-warning-muted');
  });

  it('marks the decorative icon as aria-hidden', () => {
    const { container } = render(<DeviceRoleBadge role="donor" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('forwards ref to the underlying span', () => {
    const ref = createRef<HTMLSpanElement>();
    render(<DeviceRoleBadge role="patient" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    expect(ref.current?.textContent).toContain('Patient');
  });

  it('spreads rest props (data-testid) onto the span', () => {
    render(<DeviceRoleBadge role="patient" data-testid="role-badge" />);
    expect(screen.getByTestId('role-badge')).toBeInTheDocument();
  });

  it('routes the label through i18n: ar locale shows the Arabic donor term', () => {
    i18n.changeLanguage('ar');
    const { container } = render(<DeviceRoleBadge role="donor" />);
    const badge = getBadge(container);
    expect(badge).toHaveTextContent('المتبرع');
    // tone is locale-independent
    expect(badge.className).toContain('bg-warning-muted');
  });
});
