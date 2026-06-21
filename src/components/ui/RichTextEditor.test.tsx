import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RichTextEditor, type RichTextEditorHandle } from './RichTextEditor';

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

describe('RichTextEditor write-side sanitize (Phase 3)', () => {
  it('sanitizes innerHTML before passing it to onChange on input', () => {
    const onChange = vi.fn();
    render(<RichTextEditor value="" onChange={onChange} />);
    const editable = screen.getByRole('textbox');

    // Disallowed tag + event-handler attribute injected into the editable region.
    editable.innerHTML =
      '<p>safe</p><script>alert(1)</script><img src=x onerror="alert(2)">';
    fireEvent.input(editable);

    expect(onChange).toHaveBeenCalled();
    const calls = onChange.mock.calls;
    const emitted = calls[calls.length - 1][0] as string;
    expect(emitted).not.toContain('<script');
    expect(emitted).not.toContain('onerror');
    expect(emitted).not.toContain('<img');
    expect(emitted).toContain('<p>safe</p>');
  });

  it('sanitizes the HTML source on toggle back from source mode', () => {
    const onChange = vi.fn();
    render(
      <RichTextEditor
        value="<p>start</p>"
        onChange={onChange}
      />,
    );

    // Enter source mode (button labelled "View HTML source").
    fireEvent.click(screen.getByRole('button', { name: 'View HTML source' }));

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: '<p>edited</p><script>evil()</script>' },
    });

    // Toggle back out of source mode -> onChange should receive sanitized HTML.
    fireEvent.click(screen.getByRole('button', { name: 'View HTML source' }));

    expect(onChange).toHaveBeenCalled();
    const calls = onChange.mock.calls;
    const emitted = calls[calls.length - 1][0] as string;
    expect(emitted).not.toContain('<script');
    expect(emitted).toContain('<p>edited</p>');
  });

  it('sanitizes inbound value before rendering it into the editable region (regression)', () => {
    render(
      <RichTextEditor
        value='<p>ok</p><script>bad()</script>'
        onChange={() => {}}
      />,
    );
    const editable = screen.getByRole('textbox');
    expect(editable.innerHTML).not.toContain('<script');
    expect(editable.innerHTML).toContain('<p>ok</p>');
  });
});

describe('RichTextEditor copy + toolbar a11y (Phase 3)', () => {
  it('uses the translated placeholder by default and lets a prop override it', () => {
    const { rerender } = render(<RichTextEditor value="" onChange={() => {}} />);
    let editable = screen.getByRole('textbox');
    expect(editable).toHaveAttribute('data-placeholder', 'Start typing...');

    rerender(
      <RichTextEditor value="" onChange={() => {}} placeholder="My custom prompt" />,
    );
    editable = screen.getByRole('textbox');
    expect(editable).toHaveAttribute('data-placeholder', 'My custom prompt');
  });

  it('exposes a toolbar with translated label and controls the editor', () => {
    render(<RichTextEditor value="" onChange={() => {}} id="rte-tb" />);
    const toolbar = screen.getByRole('toolbar', { name: 'Text formatting' });
    expect(toolbar).toBeInTheDocument();
    expect(toolbar).toHaveAttribute('aria-controls', 'rte-tb');
  });

  it('labels icon-only buttons with their translated accessible name', () => {
    render(<RichTextEditor value="" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Italic' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Underline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bullet list' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Numbered list' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear formatting' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View HTML source' })).toBeInTheDocument();
  });

  it('marks the color/highlight disclosures with aria-haspopup and aria-expanded', () => {
    render(<RichTextEditor value="" onChange={() => {}} />);
    const colorBtn = screen.getByRole('button', { name: 'Text color' });
    expect(colorBtn).toHaveAttribute('aria-haspopup', 'true');
    expect(colorBtn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(colorBtn);
    expect(colorBtn).toHaveAttribute('aria-expanded', 'true');
    const popoverId = colorBtn.getAttribute('aria-controls');
    expect(popoverId).toBeTruthy();
    expect(document.getElementById(popoverId as string)).toBeTruthy();
  });

  it('renders the color popover on bg-surface and never bg-white', () => {
    render(<RichTextEditor value="" onChange={() => {}} />);
    const colorBtn = screen.getByRole('button', { name: 'Text color' });
    fireEvent.click(colorBtn);
    const popover = document.getElementById(
      colorBtn.getAttribute('aria-controls') as string,
    ) as HTMLElement;
    expect(popover.className).toContain('bg-surface');
    expect(popover.className).not.toContain('bg-white');
  });

  it('routes the Quick buttons through the shared status tone maps', () => {
    render(<RichTextEditor value="" onChange={() => {}} />);
    const warning = screen.getByRole('button', { name: 'Insert warning' });
    expect(warning.className).toContain('bg-danger-muted');
    expect(warning.className).toContain('text-danger');

    const important = screen.getByRole('button', { name: 'Insert important note' });
    expect(important.className).toContain('bg-warning-muted');
    expect(important.className).toContain('text-warning');
  });

  describe('RTL logical utilities (Phase 4a proof slice)', () => {
    it('the color popover anchors to the logical start-0, not left-0', () => {
      render(<RichTextEditor value="" onChange={() => {}} />);
      const colorBtn = screen.getByRole('button', { name: 'Text color' });
      fireEvent.click(colorBtn);
      const popover = document.getElementById(
        colorBtn.getAttribute('aria-controls') as string,
      ) as HTMLElement;
      expect(popover.className).toContain('start-0');
      expect(popover.className).not.toMatch(/(^|\s)left-0(\s|$)/);
    });

    it('Quick-format button icons use the logical me-1 gap, not physical mr-1', () => {
      render(<RichTextEditor value="" onChange={() => {}} />);
      const warning = screen.getByRole('button', { name: 'Insert warning' });
      const icon = warning.querySelector('svg') as SVGElement;
      expect(icon.getAttribute('class')).toContain('me-1');
      expect(icon.getAttribute('class')).not.toContain('mr-1');
    });
  });
});

describe('RichTextEditor — link/image/table tools + ref', () => {
  it('renders Link, Image, and Table toolbar buttons', () => {
    render(<RichTextEditor value="" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /insert link/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /insert image/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /insert table/i })).toBeInTheDocument();
  });

  it('exposes an imperative insertAtCursor handle', () => {
    const ref = createRef<RichTextEditorHandle>();
    render(<RichTextEditor ref={ref} value="" onChange={() => {}} />);
    expect(typeof ref.current?.insertAtCursor).toBe('function');
  });
});
