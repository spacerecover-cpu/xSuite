import React, { useEffect, useRef, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';
import {
  getDocumentInstance,
  getDocumentInstanceSections,
  createReportInstance,
  archiveDocumentInstance,
  transitionDocument,
} from '../../lib/documentInstanceService';
import { captureStaffSignature, listInstanceSignatures } from '../../lib/documentSignatureService';
import { reportSectionGuidance as sectionGuidance } from '../../lib/pdf/engine/adapters/reportAdapter';
import type { CapturedSignature } from './SignatureCaptureModal';
import { SignatureCaptureModal } from './SignatureCaptureModal';
import { reportPDFService } from '../../lib/reportPDFService';
import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../types/database.types';

type DocumentInstanceRow = Database['public']['Tables']['document_instances']['Row'];
type DocumentInstanceSectionRow = Database['public']['Tables']['document_instance_sections']['Row'];

interface DocumentDraftReviewProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  /** Provide instanceId to edit; omit + provide newSubtype to create. */
  instanceId?: string;
  newSubtype?: string;
  newTitle?: string;
  onSaved: () => void;
}

interface SectionState {
  section_key: string;
  title: string;
  content: string;
  sort_order: number;
  is_visible: boolean;
}

function toSectionState(s: DocumentInstanceSectionRow): SectionState {
  return {
    section_key: s.section_key,
    title: s.title ?? s.section_key,
    content: s.content ?? '',
    sort_order: s.sort_order,
    is_visible: s.is_visible,
  };
}

type SignatureSlot = Database['public']['Enums']['signature_slot'];

interface PendingSlot {
  slot: SignatureSlot;
  title: string;
  signerRole: string;
}

// A data-destruction certificate attests three independent parties. These are the slots
// that must be signed by three distinct, named people (separation of duties).
const DESTRUCTION_SIGNATORY_SLOTS: SignatureSlot[] = ['engineer', 'witness', 'approver'];

/**
 * Validates that a data-destruction certificate's three signatories are distinct, named
 * people. Returns an error message when a slot is unnamed or two slots share the same
 * name (trimmed, case-insensitive); null when all three are distinct.
 */
function destructionSignatoryError(names: Record<string, string>): string | null {
  const seen = new Map<string, SignatureSlot>();
  for (const slot of DESTRUCTION_SIGNATORY_SLOTS) {
    const norm = (names[slot] ?? '').trim().toLowerCase();
    if (!norm) {
      return 'Every signatory (operator, witness, approver) must be named before this destruction certificate can be approved.';
    }
    if (seen.has(norm)) {
      return 'The operator, witness and approver must be three different people — the same name cannot sign more than one slot.';
    }
    seen.set(norm, slot);
  }
  return null;
}

export const DocumentDraftReview: React.FC<DocumentDraftReviewProps> = ({
  isOpen,
  onClose,
  caseId,
  instanceId,
  newSubtype,
  newTitle,
  onSaved,
}) => {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [id, setId] = useState<string | null>(instanceId ?? null);
  const [instance, setInstance] = useState<DocumentInstanceRow | null>(null);
  const [sections, setSections] = useState<SectionState[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const createdRef = useRef(false);

  // Signature capture state
  const [signing, setSigning] = useState(false);
  const [currentSlot, setCurrentSlot] = useState<PendingSlot | null>(null);
  // Queue of slots to capture; after all queued slots → approve
  const pendingSlots = useRef<PendingSlot[]>([]);
  // Collected signatureIds from queued slots (keyed by slot name)
  const capturedIds = useRef<Record<string, string>>({});
  // Resolved signer names per slot — used to enforce distinct destruction signatories.
  const capturedNames = useRef<Record<string, string>>({});

  // Reset all per-open state when the modal closes so re-opens start clean.
  useEffect(() => {
    if (isOpen) return;
    setInstance(null);
    setSections([]);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setId(instanceId ?? null);
    createdRef.current = false;
    // Phase-6 signature queue reset — clear refs and modal state so a re-open starts clean.
    pendingSlots.current = [];
    capturedIds.current = {};
    capturedNames.current = {};
    setSigning(false);
    setCurrentSlot(null);
  // previewUrl intentionally omitted — we only want this on isOpen toggle
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Create-once on open with a subtype, else load the given instance.
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    (async () => {
      try {
        let resolvedId = instanceId ?? null;
        if (!resolvedId && newSubtype && !createdRef.current) {
          createdRef.current = true;
          const created = await createReportInstance({
            caseId,
            reportSubtype: newSubtype,
            title: newTitle ?? 'Report',
          });
          resolvedId = created.id;
        }
        if (!resolvedId || !alive) return;
        setId(resolvedId);
        const [inst, secs] = await Promise.all([
          getDocumentInstance(resolvedId),
          getDocumentInstanceSections(resolvedId),
        ]);
        if (!alive) return;
        setInstance(inst);
        setSections(secs.map(toSectionState));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load document');
      }
    })();
    return () => {
      alive = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, instanceId, newSubtype]);

  // Revoke the object URL when we re-preview or close to avoid leaks.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const isAuthor = !!instance && instance.created_by === (user?.id ?? '');
  const status = instance?.status;

  async function saveSections() {
    if (!id) return;
    setBusy(true);
    try {
      for (const s of sections) {
        const { error } = await supabase
          .from('document_instance_sections')
          .update({ content: s.content })
          .eq('document_instance_id', id)
          .eq('section_key', s.section_key);
        if (error) throw error;
      }
      toast.success('Saved');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function preview() {
    if (!id) return;
    setBusy(true);
    try {
      const res = await reportPDFService.generateDocumentInstanceAsBlob(id);
      if (!res.success || !res.blob) throw new Error(res.error || 'Preview failed');
      setPreviewUrl(URL.createObjectURL(res.blob));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setBusy(false);
    }
  }

  async function runSend() {
    if (!id) return;
    setBusy(true);
    try {
      await archiveDocumentInstance(id);
      await transitionDocument(id, 'delivered');
      toast.success('Document delivered');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setBusy(false);
    }
  }

  async function runSubmit() {
    if (!id) return;
    setBusy(true);
    try {
      await transitionDocument(id, 'in_review');
      toast.success('Document submitted for review');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Transition failed');
    } finally {
      setBusy(false);
    }
  }

  /** Opens the capture modal for the next slot in the queue. */
  function startNextCapture() {
    const next = pendingSlots.current[0];
    if (next) {
      setCurrentSlot(next);
      setSigning(true);
    }
  }

  /** Initiates the approve flow: builds the required-slot queue and starts it. Fully idempotent — safe to retry after any failure. */
  async function initiateApprove() {
    if (!id || !instance) return;
    setBusy(true);
    try {
      // Always read current signatures first so we skip already-captured slots on retry.
      const existing = await listInstanceSignatures(id);
      const existingSlots = new Set(existing.map((s) => s.slot));
      // Seed known signer names from persisted rows so distinctness is enforced across
      // retries / re-opens (a later slot must not reuse an already-signed signatory).
      for (const row of existing) {
        if (row.signer_name) capturedNames.current[row.slot] = row.signer_name;
      }

      const allRequired: PendingSlot[] =
        instance.report_subtype === 'data_destruction'
          ? [
              { slot: 'engineer', title: 'Operator signature', signerRole: 'Operator' },
              { slot: 'witness', title: 'Witness signature', signerRole: 'Witness' },
              { slot: 'approver', title: 'Approver signature', signerRole: 'Approver' },
            ]
          : [{ slot: 'approver', title: 'Approver signature', signerRole: 'Approver' }];

      // Skip any slot that already has a persisted row (idempotency).
      const toCapture = allRequired.filter((s) => !existingSlots.has(s.slot));

      if (toCapture.length === 0) {
        // Every required slot already signed — go straight to transition (retry path).
        // A destruction certificate must still prove three distinct signatories.
        if (instance.report_subtype === 'data_destruction') {
          const dupErr = destructionSignatoryError(capturedNames.current);
          if (dupErr) {
            toast.error(dupErr);
            return;
          }
        }
        const approverRow = existing.find((s) => s.slot === 'approver');
        const approverSigId = capturedIds.current['approver'] ?? approverRow?.id;
        await transitionDocument(id, 'approved', { signatureId: approverSigId });
        toast.success('Document approved');
        onSaved();
        onClose();
        return;
      }

      pendingSlots.current = toCapture;
      // Seed capturedIds with any approver row already persisted so handleCapture can find it.
      const existingApprover = existing.find((s) => s.slot === 'approver');
      if (existingApprover) {
        capturedIds.current['approver'] = existingApprover.id;
      }
      startNextCapture();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to start approval');
      // Reset cleanly so the user can click Approve again.
      setSigning(false);
      setCurrentSlot(null);
      pendingSlots.current = [];
    } finally {
      setBusy(false);
    }
  }

  /**
   * Resolve the identity to attribute THIS slot's signature to. A data-destruction
   * certificate must attest three independent signatories, so we must never blanket-stamp
   * every slot with the logged-in approver. The capture modal's "Type" method collects the
   * signer's own name (sig.typedValue) — use it when present. Only the authenticated
   * approver falls back to their account name; the operator and witness fall back to their
   * role label so they are never silently mis-attributed to the approver.
   */
  function resolveSlotSignerName(slot: PendingSlot, sig: CapturedSignature): string {
    // Type method carries the name in typedValue; other methods carry it in signerName.
    const entered = sig.method === 'typed' ? sig.typedValue?.trim() : sig.signerName?.trim();
    if (entered) return entered;
    if (slot.slot === 'approver') return profile?.full_name?.trim() || 'Staff';
    return slot.signerRole;
  }

  /** Called when SignatureCaptureModal fires onCapture for the current slot. */
  async function handleCapture(sig: CapturedSignature) {
    if (!id || !currentSlot) return;
    const signerName = resolveSlotSignerName(currentSlot, sig);

    // Separation-of-duties gate for destruction certificates: the operator, witness and
    // approver must be three different, named people. Reject a blank or duplicate signatory
    // BEFORE persisting, so no self-signed row is ever written and the same modal stays open
    // for the current slot to accept a different signatory.
    if (instance?.report_subtype === 'data_destruction') {
      const norm = signerName.trim().toLowerCase();
      const collides =
        !!norm &&
        Object.entries(capturedNames.current).some(
          ([slotKey, name]) => slotKey !== currentSlot.slot && name.trim().toLowerCase() === norm,
        );
      if (!norm || collides) {
        toast.error(
          !norm
            ? 'Please enter the signatory’s name.'
            : 'The operator, witness and approver must be three different people — this name has already signed another slot.',
        );
        return;
      }
    }

    setBusy(true);
    try {
      const sigId = await captureStaffSignature({
        instanceId: id,
        slot: currentSlot.slot,
        method: sig.method,
        signerName,
        // Only the approver is the authenticated system user; operator/witness are
        // external signatories with no account, so their row's identity stays null.
        signerUserId: currentSlot.slot === 'approver' ? (user?.id ?? null) : null,
        signerRole: currentSlot.signerRole,
        typedValue: sig.typedValue,
        imageBlob: sig.imageBlob,
      });
      // Capture succeeded — record id + name and close modal for this slot.
      capturedIds.current[currentSlot.slot] = sigId;
      capturedNames.current[currentSlot.slot] = signerName;
      setSigning(false);

      // Pop the captured slot and check if more remain.
      pendingSlots.current = pendingSlots.current.slice(1);
      setCurrentSlot(null);

      if (pendingSlots.current.length > 0) {
        // More slots to capture — open the next one.
        startNextCapture();
      } else {
        // All captured — transition to approved using the approver's sigId.
        const approverSigId = capturedIds.current['approver'];
        await transitionDocument(id, 'approved', { signatureId: approverSigId });
        toast.success('Document approved');
        onSaved();
        onClose();
      }
    } catch (e) {
      // On any failure, reset cleanly so the user can click Approve again.
      // capturedIds.current is preserved — retry in initiateApprove will re-read DB and skip already-signed slots.
      toast.error(e instanceof Error ? e.message : 'Approval failed');
      setSigning(false);
      setCurrentSlot(null);
      pendingSlots.current = [];
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      label={instance?.title ?? 'Document'}
      className="max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden"
    >
      <div className="shrink-0 px-6 pt-6 pb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          {instance?.title ?? 'Document'}
        </h2>
      </div>

      <div className="px-6 pb-6 overflow-y-auto flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: editable sections */}
          <div className="space-y-4">
            {sections.length === 0 && (
              <p className="text-sm text-slate-400">Loading sections…</p>
            )}
            {sections.map((s, i) => (
              <div key={s.section_key}>
                <Textarea
                  label={s.title}
                  value={s.content}
                  placeholder={sectionGuidance(s.section_key)}
                  onChange={(e) =>
                    setSections((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)),
                    )
                  }
                  rows={4}
                />
              </div>
            ))}

          </div>

          {/* Right: PDF preview iframe */}
          <div className="min-h-[400px] border border-slate-200 rounded-lg overflow-hidden">
            {previewUrl ? (
              <iframe
                title="Document preview"
                src={previewUrl}
                className="w-full h-full min-h-[400px]"
              />
            ) : (
              <div className="flex items-center justify-center h-full min-h-[400px] text-slate-400 text-sm">
                Click Preview to render the PDF
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pinned footer — workflow actions + dismiss */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-border px-6 py-3">
        <div className="flex flex-wrap gap-2">
          <Button onClick={saveSections} disabled={busy} size="sm">
            Save
          </Button>
          <Button variant="secondary" onClick={preview} disabled={busy} size="sm">
            Preview
          </Button>
          {status === 'draft' && (
            <Button size="sm" onClick={runSubmit} disabled={busy}>
              Submit for Review
            </Button>
          )}
          {status === 'in_review' && (
            <Button
              size="sm"
              onClick={initiateApprove}
              disabled={busy || isAuthor}
              title={isAuthor ? 'The approver must be different from the author' : undefined}
            >
              Approve
            </Button>
          )}
          {status === 'approved' && (
            <Button size="sm" onClick={runSend} disabled={busy}>
              Send to Customer
            </Button>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      {currentSlot && (
        <SignatureCaptureModal
          open={signing}
          onClose={() => {
            setSigning(false);
            setCurrentSlot(null);
            pendingSlots.current = [];
            capturedIds.current = {};
            capturedNames.current = {};
          }}
          title={currentSlot.title}
          onCapture={handleCapture}
        />
      )}
    </Dialog>
  );
};
