import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RichTextEditor } from './RichTextEditor';

describe('RichTextEditor a11y props (additive, for FormField association)', () => {
  it('forwards id, aria-describedby, aria-invalid and aria-labelledby onto the editable region', () => {
    render(
      <RichTextEditor
        value=""
        onChange={() => {}}
        id="rte-1"
        aria-invalid
        aria-describedby="rte-1-hint"
        aria-labelledby="rte-1-label"
      />,
    );
    const editable = screen.getByRole('textbox');
    expect(editable).toHaveAttribute('id', 'rte-1');
    expect(editable).toHaveAttribute('aria-describedby', 'rte-1-hint');
    expect(editable).toHaveAttribute('aria-invalid', 'true');
    expect(editable).toHaveAttribute('aria-labelledby', 'rte-1-label');
    expect(editable).toHaveAttribute('aria-multiline', 'true');
  });

  it('exposes the editable region as a textbox role even without a11y props (existing behavior unaffected)', () => {
    render(<RichTextEditor value="<p>hi</p>" onChange={() => {}} label="Notes" />);
    const editable = screen.getByRole('textbox');
    expect(editable).toBeInTheDocument();
    expect(editable).not.toHaveAttribute('id');
    expect(editable).not.toHaveAttribute('aria-describedby');
    expect(editable).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('Notes')).toBeInTheDocument();
  });
});
