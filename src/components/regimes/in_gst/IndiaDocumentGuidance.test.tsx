// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IndiaDocumentGuidance } from './IndiaDocumentGuidance';

describe('IndiaDocumentGuidance', () => {
  it('renders nothing when there is no guidance', () => {
    const { container } = render(<IndiaDocumentGuidance />);
    expect(container.firstChild).toBeNull();
  });
  it('renders both the wholly-exempt block and the goods guidance when present', () => {
    render(<IndiaDocumentGuidance whollyExemptMessage="Needs a Bill of Supply." goodsGuidanceMessage="Bill goods separately." />);
    expect(screen.getByText('Needs a Bill of Supply.')).toBeInTheDocument();
    expect(screen.getByText('Bill goods separately.')).toBeInTheDocument();
  });
});
