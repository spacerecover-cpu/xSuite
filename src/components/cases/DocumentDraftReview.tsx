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

export const DocumentDraftReview: React.FC<DocumentDraftReviewProps> = ({
  isOpen,
  onClose,
  caseId,
  instanceId,
  newSubtype,
  newTitle,
  onSaved,
}) => {
  const { user } = useAuth();
  const toast = useToast();
  const [id, setId] = useState<string | null>(instanceId ?? null);
  const [instance, setInstance] = useState<DocumentInstanceRow | null>(null);
  const [sections, setSections] = useState<SectionState[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const createdRef = useRef(false);

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

  async function runTransition(to: 'in_review' | 'approved') {
    if (!id) return;
    setBusy(true);
    try {
      await transitionDocument(id, to);
      toast.success(`Document ${to === 'in_review' ? 'submitted for review' : 'approved'}`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Transition failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      label={instance?.title ?? 'Document'}
      className="max-w-5xl w-full"
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {instance?.title ?? 'Document'}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

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
                  onChange={(e) =>
                    setSections((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)),
                    )
                  }
                  rows={4}
                />
              </div>
            ))}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={saveSections} disabled={busy} size="sm">
                Save
              </Button>
              <Button variant="secondary" onClick={preview} disabled={busy} size="sm">
                Preview
              </Button>
              {status === 'draft' && (
                <Button
                  size="sm"
                  onClick={() => runTransition('in_review')}
                  disabled={busy}
                >
                  Submit for Review
                </Button>
              )}
              {status === 'in_review' && (
                <Button
                  size="sm"
                  onClick={() => runTransition('approved')}
                  disabled={busy || isAuthor}
                  title={
                    isAuthor
                      ? 'The approver must be different from the author'
                      : undefined
                  }
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
    </Dialog>
  );
};
