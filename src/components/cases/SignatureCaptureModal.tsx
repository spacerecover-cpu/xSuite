import React, { useEffect, useRef, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';

export type CaptureMethod = 'typed' | 'drawn' | 'uploaded_image' | 'click_to_accept';

export interface CapturedSignature {
  method: CaptureMethod;
  typedValue?: string;
  imageBlob?: Blob;
}

interface SignatureCaptureModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  onCapture: (sig: CapturedSignature) => void;
  allowedMethods?: CaptureMethod[];
  errorMessage?: string | null;
}

const METHODS: { id: CaptureMethod; label: string }[] = [
  { id: 'typed', label: 'Type' },
  { id: 'drawn', label: 'Draw' },
  { id: 'uploaded_image', label: 'Upload' },
  { id: 'click_to_accept', label: 'Accept' },
];

export function SignatureCaptureModal({ open, onClose, title, onCapture, allowedMethods, errorMessage }: SignatureCaptureModalProps) {
  const methods = METHODS.filter((m) => !allowedMethods || allowedMethods.includes(m.id));
  const [method, setMethod] = useState<CaptureMethod>(methods[0]?.id ?? 'typed');
  const [typedValue, setTypedValue] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [accepted, setAccepted] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const hasDrawn = useRef(false);

  function resetState() {
    setTypedValue('');
    setUploadedFile(null);
    setAccepted(false);
    hasDrawn.current = false;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  // Reset to initial state whenever the modal is closed so re-opening starts clean.
  useEffect(() => {
    if (!open) {
      setMethod(methods[0]?.id ?? 'typed');
      resetState();
    }
  // resetState and methods are stable across renders — intentionally excluded
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleMethodChange(m: CaptureMethod) {
    setMethod(m);
    resetState();
  }

  function isValid(): boolean {
    if (method === 'typed') return typedValue.trim().length > 0;
    if (method === 'drawn') return hasDrawn.current;
    if (method === 'uploaded_image') return uploadedFile !== null;
    if (method === 'click_to_accept') return accepted;
    return false;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    isDrawing.current = true;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    canvas.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.strokeStyle = 'rgb(15 23 42)'; // slate-950 equivalent
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    hasDrawn.current = true;
  }

  function handlePointerUp() {
    isDrawing.current = false;
  }

  function handleClearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
  }

  function handleApply() {
    if (!isValid()) return;

    if (method === 'typed') {
      onCapture({ method: 'typed', typedValue: typedValue.trim() });
      onClose();
    } else if (method === 'drawn') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.toBlob((blob) => {
        if (blob) {
          onCapture({ method: 'drawn', imageBlob: blob });
          onClose();
        }
      }, 'image/png');
    } else if (method === 'uploaded_image' && uploadedFile) {
      onCapture({ method: 'uploaded_image', imageBlob: uploadedFile });
      onClose();
    } else if (method === 'click_to_accept') {
      onCapture({ method: 'click_to_accept' });
      onClose();
    }
  }

  return (
    <Dialog open={open} onClose={onClose} label={title} className="max-w-lg w-full">
      <div className="p-6 space-y-5">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>

        {/* Segmented control */}
        <div className="flex rounded-md border border-border overflow-hidden" role="group" aria-label="Signature method">
          {methods.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => handleMethodChange(m.id)}
              className={[
                'flex-1 px-3 py-2 text-sm font-medium transition-colors',
                method === m.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-surface text-slate-700 hover:bg-surface-muted',
              ].join(' ')}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Method panels */}
        {method === 'typed' && (
          <div className="space-y-2">
            <label htmlFor="sig-typed" className="block text-sm font-medium text-slate-700">
              Type your name
            </label>
            <input
              id="sig-typed"
              type="text"
              aria-label="Type your name"
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              placeholder="Full name"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}

        {method === 'drawn' && (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">Draw your signature below</p>
            <canvas
              ref={canvasRef}
              width={448}
              height={160}
              className="w-full rounded-md border border-border bg-white cursor-crosshair touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
            <Button type="button" variant="ghost" size="sm" onClick={handleClearCanvas}>
              Clear
            </Button>
          </div>
        )}

        {method === 'uploaded_image' && (
          <div className="space-y-2">
            <label htmlFor="sig-upload" className="block text-sm font-medium text-slate-700">
              Upload signature image
            </label>
            <input
              id="sig-upload"
              type="file"
              accept="image/*"
              aria-label="Upload signature image"
              onChange={(e) => setUploadedFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:opacity-90"
            />
            {uploadedFile && (
              <p className="text-xs text-slate-500">{uploadedFile.name}</p>
            )}
          </div>
        )}

        {method === 'click_to_accept' && (
          <div className="flex items-start gap-3">
            <input
              id="sig-accept"
              type="checkbox"
              aria-label="I confirm that this action constitutes my electronic signature"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary accent-primary"
            />
            <label htmlFor="sig-accept" className="text-sm text-slate-700">
              I confirm that this action constitutes my electronic signature
            </label>
          </div>
        )}

        {errorMessage && (
          <div role="alert" className="rounded-md border border-danger/30 bg-danger-muted px-3 py-2 text-sm text-danger">
            {errorMessage}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleApply} disabled={!isValid()}>
            Apply signature
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
