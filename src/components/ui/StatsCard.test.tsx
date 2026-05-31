import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Activity } from 'lucide-react';
import { StatsCard } from './StatsCard';

// The icon chip is the div with `p-3 rounded-lg` wrapping the metric icon.
function getChip(container: HTMLElement): HTMLElement {
  const chip = container.querySelector('div.p-3.rounded-lg');
  if (!chip) throw new Error('chip not found');
  return chip as HTMLElement;
}

describe('StatsCard (STATUS_TONE_MUTED + Skeleton)', () => {
  it('renders the title and value', () => {
    render(<StatsCard title="Open Cases" value="42" icon={Activity} />);
    expect(screen.getByText('Open Cases')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders the provided icon with aria-hidden', () => {
    const { container } = render(<StatsCard title="t" value="1" icon={Activity} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('default color (blue) routes the chip through info via STATUS_TONE_MUTED', () => {
    const { container } = render(<StatsCard title="t" value="1" icon={Activity} />);
    const chip = getChip(container);
    expect(chip.className).toContain('bg-info-muted');
    expect(chip.className).toContain('text-info');
  });

  it('color="green" routes the chip to success', () => {
    const { container } = render(
      <StatsCard title="t" value="1" icon={Activity} color="green" />,
    );
    const chip = getChip(container);
    expect(chip.className).toContain('bg-success-muted');
    expect(chip.className).toContain('text-success');
  });

  it('color="red" routes the chip to danger', () => {
    const { container } = render(
      <StatsCard title="t" value="1" icon={Activity} color="red" />,
    );
    const chip = getChip(container);
    expect(chip.className).toContain('bg-danger-muted');
    expect(chip.className).toContain('text-danger');
  });

  it('orange and yellow both map to warning (dedupe guard)', () => {
    const { container: orange } = render(
      <StatsCard title="t" value="1" icon={Activity} color="orange" />,
    );
    const { container: yellow } = render(
      <StatsCard title="t" value="1" icon={Activity} color="yellow" />,
    );
    const orangeChip = getChip(orange);
    const yellowChip = getChip(yellow);
    expect(orangeChip.className).toContain('bg-warning-muted');
    expect(orangeChip.className).toContain('text-warning');
    expect(yellowChip.className).toContain('bg-warning-muted');
    expect(yellowChip.className).toContain('text-warning');
  });

  it('color="purple" routes the chip to accent (solid, no -muted)', () => {
    const { container } = render(
      <StatsCard title="t" value="1" icon={Activity} color="purple" />,
    );
    const chip = getChip(container);
    expect(chip.className).toContain('bg-accent');
    expect(chip.className).toContain('text-accent-foreground');
    expect(chip.className).not.toContain('bg-accent-muted');
  });

  it('unknown color falls back to info (default blue)', () => {
    const { container } = render(
      <StatsCard title="t" value="1" icon={Activity} color="chartreuse" />,
    );
    const chip = getChip(container);
    expect(chip.className).toContain('bg-info-muted');
    expect(chip.className).toContain('text-info');
  });

  it('positive trend renders TrendingUp with success color and the value%', () => {
    const { container } = render(
      <StatsCard
        title="t"
        value="1"
        icon={Activity}
        trend={{ value: 12, isPositive: true }}
      />,
    );
    expect(screen.getByText('12%')).toBeInTheDocument();
    const trendWrapper = screen.getByText('12%').closest('div') as HTMLElement;
    expect(trendWrapper.className).toContain('text-success');
    expect(trendWrapper.className).not.toContain('text-danger');
    // lucide TrendingUp draws a polyline; assert it is the up icon by the aria-label wrapper
    expect(trendWrapper).toHaveAttribute('aria-label', 'Up 12%');
    expect(container).toBeTruthy();
  });

  it('negative trend renders TrendingDown with danger color and the value%', () => {
    render(
      <StatsCard
        title="t"
        value="1"
        icon={Activity}
        trend={{ value: 8, isPositive: false }}
      />,
    );
    expect(screen.getByText('8%')).toBeInTheDocument();
    const trendWrapper = screen.getByText('8%').closest('div') as HTMLElement;
    expect(trendWrapper.className).toContain('text-danger');
    expect(trendWrapper.className).not.toContain('text-success');
    expect(trendWrapper).toHaveAttribute('aria-label', 'Down 8%');
  });

  it('trend arrow icon is aria-hidden', () => {
    render(
      <StatsCard
        title="t"
        value="1"
        icon={Activity}
        trend={{ value: 12, isPositive: true }}
      />,
    );
    const trendWrapper = screen.getByText('12%').closest('div') as HTMLElement;
    const arrow = trendWrapper.querySelector('svg');
    expect(arrow).toBeTruthy();
    expect(arrow).toHaveAttribute('aria-hidden', 'true');
  });

  it('no trend → no % rendered and no trend wrapper', () => {
    render(<StatsCard title="t" value="1" icon={Activity} />);
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it('CHARACTERIZATION: {value:-5, isPositive:true} renders "-5%" + TrendingUp + success (locks current behavior)', () => {
    render(
      <StatsCard
        title="t"
        value="1"
        icon={Activity}
        trend={{ value: -5, isPositive: true }}
      />,
    );
    expect(screen.getByText('-5%')).toBeInTheDocument();
    const trendWrapper = screen.getByText('-5%').closest('div') as HTMLElement;
    // direction is driven by isPositive (true) → success + Up label, NOT by sign(value)
    expect(trendWrapper.className).toContain('text-success');
    expect(trendWrapper.className).not.toContain('text-danger');
    expect(trendWrapper).toHaveAttribute('aria-label', 'Up -5%');
  });

  it('loading=true swaps the value for a Skeleton (no value text)', () => {
    const { container } = render(
      <StatsCard title="t" value="42" icon={Activity} loading />,
    );
    expect(screen.queryByText('42')).not.toBeInTheDocument();
    // title + chip still present
    expect(screen.getByText('t')).toBeInTheDocument();
    const chip = getChip(container);
    expect(chip.className).toContain('bg-info-muted');
    // skeleton is an aria-hidden animated block
    const skeleton = container.querySelector('[aria-hidden="true"].animate-pulse, [aria-hidden="true"].motion-safe\\:animate-pulse');
    expect(skeleton).toBeTruthy();
    expect((skeleton as HTMLElement).className).toContain('h-9');
    expect((skeleton as HTMLElement).className).toContain('w-24');
  });

  it('not loading renders the value, not a Skeleton', () => {
    const { container } = render(<StatsCard title="t" value="42" icon={Activity} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    const skeleton = container.querySelector('.motion-safe\\:animate-pulse');
    expect(skeleton).toBeFalsy();
  });

  it('PRECEDENCE: consumer className is merged onto the outer Card', () => {
    const { container } = render(
      <StatsCard title="t" value="1" icon={Activity} className="ring-4" />,
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).toContain('ring-4');
  });
});
