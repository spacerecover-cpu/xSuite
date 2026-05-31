import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImageUpload } from './ImageUpload';

// jsdom has no real Image decoding. Stub a minimal Image whose `src` setter
// synchronously fires `onload` so getImageDimensions resolves in the happy path.
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 100;
  height = 80;
  private _src = '';
  set src(value: string) {
    this._src = value;
    // microtask so the promise consumers can attach handlers first
    queueMicrotask(() => this.onload?.());
  }
  get src() {
    return this._src;
  }
}

beforeEach(() => {
  vi.stubGlobal('Image', FakeImage as unknown as typeof Image);
  if (!('createObjectURL' in URL)) {
    // jsdom may not define it; ensure it exists before spying
    (URL as unknown as { createObjectURL: (f: Blob) => string }).createObjectURL = () => 'blob:stub';
  }
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:created-url');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

function getFileInput(): HTMLInputElement {
  // The hidden file input is the only input[type=file] in the tree.
  const input = document.querySelector('input[type="file"]');
  if (!input) throw new Error('file input not found');
  return input as HTMLInputElement;
}

describe('ImageUpload (cn + density cva + a11y + loading + dead-API)', () => {
  it('renders the label and an empty dropzone with the localized prompt', () => {
    render(<ImageUpload label="Profile Photo" onChange={() => {}} />);
    expect(screen.getByText('Profile Photo')).toBeInTheDocument();
    expect(screen.getByText('Drag and drop an image here, or')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /browse/i })).toBeInTheDocument();
  });

  it('renders a preview img with a non-generic localized alt when value is set', () => {
    render(<ImageUpload value="blob:existing" onChange={() => {}} />);
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img).toHaveAttribute('src', 'blob:existing');
    const alt = img.getAttribute('alt') ?? '';
    expect(alt).not.toBe('Preview');
    expect(alt).toBe('Image preview');
  });

  it('associates the label htmlFor with the file input id', () => {
    render(<ImageUpload label="Profile Photo" onChange={() => {}} />);
    const label = screen.getByText('Profile Photo');
    const input = getFileInput();
    const htmlFor = label.getAttribute('for');
    expect(htmlFor).toBeTruthy();
    expect(input.id).toBe(htmlFor);
  });

  it('rejects a wrong MIME type: shows an error alert and never calls onChange', async () => {
    const onChange = vi.fn();
    render(<ImageUpload onChange={onChange} acceptedTypes={['image/png']} />);
    const input = getFileInput();
    const bad = makeFile('doc.pdf', 'application/pdf', 1024);
    fireEvent.change(input, { target: { files: [bad] } });
    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute('aria-live', 'polite');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rejects an oversize file: shows an error and never calls onChange', async () => {
    const onChange = vi.fn();
    render(<ImageUpload onChange={onChange} maxSizeMB={1} acceptedTypes={['image/png']} />);
    const input = getFileInput();
    const big = makeFile('huge.png', 'image/png', 5 * 1024 * 1024);
    fireEvent.change(input, { target: { files: [big] } });
    await screen.findByRole('alert');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('happy path: calls onChange(file, objectUrl) exactly once with the created url', async () => {
    const onChange = vi.fn();
    render(<ImageUpload onChange={onChange} acceptedTypes={['image/png']} />);
    const input = getFileInput();
    const good = makeFile('pic.png', 'image/png', 1024);
    fireEvent.change(input, { target: { files: [good] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith(good, 'blob:created-url');
  });

  it('Remove resets the preview and calls onChange(null, null)', async () => {
    const onChange = vi.fn();
    render(<ImageUpload value="blob:existing" onChange={onChange} />);
    const removeBtn = screen.getByRole('button', { name: /remove/i });
    fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith(null, null);
  });

  it('DEAD-API: onUploadComplete is never called on a successful select', async () => {
    const onChange = vi.fn();
    const onUploadComplete = vi.fn();
    render(
      <ImageUpload
        onChange={onChange}
        onUploadComplete={onUploadComplete}
        acceptedTypes={['image/png']}
      />,
    );
    const input = getFileInput();
    fireEvent.change(input, { target: { files: [makeFile('pic.png', 'image/png', 1024)] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onUploadComplete).not.toHaveBeenCalled();
  });

  it('DEAD-API: bucketName has no observable effect (still emits the raw File via onChange)', async () => {
    const onChange = vi.fn();
    render(
      <ImageUpload onChange={onChange} bucketName="company-qrcodes" acceptedTypes={['image/png']} />,
    );
    const input = getFileInput();
    const good = makeFile('pic.png', 'image/png', 1024);
    fireEvent.change(input, { target: { files: [good] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith(good, 'blob:created-url');
  });

  it('density="compact" yields compact dropzone classes', () => {
    const { container } = render(<ImageUpload density="compact" onChange={() => {}} />);
    const dropzone = container.querySelector('[class*="border-dashed"]') as HTMLElement;
    expect(dropzone).toBeTruthy();
    expect(dropzone.className).toContain('p-4');
    expect(dropzone.className).not.toContain('p-8');
  });

  it('legacy className="compact-upload" still yields compact classes (fallback when density undefined)', () => {
    const { container } = render(<ImageUpload className="compact-upload" onChange={() => {}} />);
    const dropzone = container.querySelector('[class*="border-dashed"]') as HTMLElement;
    expect(dropzone).toBeTruthy();
    expect(dropzone.className).toContain('p-4');
    expect(dropzone.className).not.toContain('p-8');
  });

  it('default density yields the spacious dropzone classes', () => {
    const { container } = render(<ImageUpload onChange={() => {}} />);
    const dropzone = container.querySelector('[class*="border-dashed"]') as HTMLElement;
    expect(dropzone).toBeTruthy();
    expect(dropzone.className).toContain('p-8');
  });

  it('loading shows a role=status Spinner in the empty dropzone', () => {
    render(<ImageUpload loading onChange={() => {}} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('consumer className wins via cn() precedence on the container', () => {
    const { container } = render(
      <ImageUpload className="space-y-8" onChange={() => {}} />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('space-y-8');
    expect(root.className).not.toContain('space-y-3');
  });

  it('dropzone is a keyboard-operable button with a localized accessible name', () => {
    render(<ImageUpload onChange={() => {}} />);
    const dropzone = screen.getByRole('button', { name: /upload an image/i });
    expect(dropzone).toBeInTheDocument();
    expect(dropzone).toHaveAttribute('tabindex', '0');
  });

  it('pressing Enter on the dropzone opens the hidden file input', () => {
    render(<ImageUpload onChange={() => {}} />);
    const dropzone = screen.getByRole('button', { name: /upload an image/i });
    const input = getFileInput();
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {});
    fireEvent.keyDown(dropzone, { key: 'Enter' });
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('pressing Space on the dropzone opens the hidden file input', () => {
    render(<ImageUpload onChange={() => {}} />);
    const dropzone = screen.getByRole('button', { name: /upload an image/i });
    const input = getFileInput();
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {});
    fireEvent.keyDown(dropzone, { key: ' ' });
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
