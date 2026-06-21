import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VirtualizedTableBody } from './VirtualizedTableBody';

type MockItem = { index: number; start: number; end: number; size: number; key: number };

const DEFAULT_WINDOW: MockItem[] = [
  { index: 10, start: 440, end: 484, size: 44, key: 10 },
  { index: 11, start: 484, end: 528, size: 44, key: 11 },
  { index: 12, start: 528, end: 572, size: 44, key: 12 },
];

// jsdom has no layout, so the real useVirtualizer can't measure. Mock it to
// return a deterministic, per-test-configurable window so we can assert our
// spacer math + row slicing without depending on layout.
const { mockState } = vi.hoisted(() => ({
  mockState: { virtualItems: [] as MockItem[], totalSize: 0 },
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => mockState.virtualItems,
    getTotalSize: () => mockState.totalSize,
  }),
}));

beforeEach(() => {
  mockState.virtualItems = [...DEFAULT_WINDOW];
  mockState.totalSize = 44000;
});

function renderBody(ui: React.ReactNode) {
  return render(
    <table>
      <tbody>{ui}</tbody>
    </table>,
  );
}

const scrollRef = { current: null } as React.RefObject<HTMLElement | null>;

describe('VirtualizedTableBody', () => {
  it('passthrough: renders every row and no spacer when count <= threshold', () => {
    const items = ['A', 'B', 'C'];
    const { container } = renderBody(
      <VirtualizedTableBody
        items={items}
        scrollRef={scrollRef}
        colSpan={1}
        threshold={100}
        renderRow={(item) => (
          <tr key={item}>
            <td>{item}</td>
          </tr>
        )}
      />,
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(container.querySelectorAll('tr[aria-hidden="true"]')).toHaveLength(0);
  });

  it('virtualized: renders only the windowed rows plus top/bottom spacer rows', () => {
    const items = Array.from({ length: 1000 }, (_, i) => `Item ${i}`);
    const { container } = renderBody(
      <VirtualizedTableBody
        items={items}
        scrollRef={scrollRef}
        colSpan={1}
        threshold={100}
        renderRow={(item) => (
          <tr key={item}>
            <td>{item}</td>
          </tr>
        )}
      />,
    );

    expect(screen.getByText('Item 10')).toBeInTheDocument();
    expect(screen.getByText('Item 11')).toBeInTheDocument();
    expect(screen.getByText('Item 12')).toBeInTheDocument();
    expect(screen.queryByText('Item 0')).not.toBeInTheDocument();
    expect(screen.queryByText('Item 500')).not.toBeInTheDocument();

    const spacers = container.querySelectorAll('tr[aria-hidden="true"] > td');
    expect(spacers).toHaveLength(2);
    expect((spacers[0] as HTMLElement).style.height).toBe('440px'); // firstItem.start
    expect((spacers[1] as HTMLElement).style.height).toBe('43428px'); // totalSize - lastItem.end (44000 - 572)
  });

  it('virtualized with an empty window: renders no rows and no spacers', () => {
    mockState.virtualItems = [];
    mockState.totalSize = 0;
    const items = Array.from({ length: 1000 }, (_, i) => `Item ${i}`);
    const { container } = renderBody(
      <VirtualizedTableBody
        items={items}
        scrollRef={scrollRef}
        colSpan={1}
        threshold={100}
        renderRow={(item) => (
          <tr key={item}>
            <td>{item}</td>
          </tr>
        )}
      />,
    );
    expect(container.querySelectorAll('tr[aria-hidden="true"]')).toHaveLength(0);
    expect(container.querySelectorAll('tbody > tr')).toHaveLength(0);
  });
});
