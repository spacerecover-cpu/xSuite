import React, { useEffect, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Badge } from '../ui/Badge';
import { AuditInfo } from '../ui/AuditInfo';
import {
  getDocumentInstance,
  getDocumentPdfSignedUrl,
  getDocumentInstanceSections,
} from '../../lib/documentInstanceService';
import type { Database } from '../../types/database.types';

type DocumentInstanceRow = Database['public']['Tables']['document_instances']['Row'];
type DocumentInstanceSectionRow = Database['public']['Tables']['document_instance_sections']['Row'];

interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  instanceId: string;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  isOpen,
  onClose,
  instanceId,
}) => {
  const [instance, setInstance] = useState<DocumentInstanceRow | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [sections, setSections] = useState<DocumentInstanceSectionRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !instanceId) return;
    let alive = true;
    setLoadError(null);
    setSections([]);
    (async () => {
      try {
        const inst = await getDocumentInstance(instanceId);
        if (!alive) return;
        setInstance(inst);
        if (inst?.pdf_storage_path) {
          const signed = await getDocumentPdfSignedUrl(inst);
          if (alive) setUrl(signed);
        } else {
          setUrl(null);
          if (inst) {
            const secs = await getDocumentInstanceSections(instanceId);
            if (alive) setSections(secs);
          }
        }
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : 'Couldn\'t load this document.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [isOpen, instanceId]);

  const visibleSections = sections.filter((s) => s.is_visible);

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      label={instance?.title ?? 'Document'}
      className="max-w-4xl w-full"
    >
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {instance?.title ?? 'Document'}
            </h2>
            {instance?.document_number && (
              <p className="text-sm text-slate-500 mt-0.5">{instance.document_number}</p>
            )}
          </div>
          {instance && (
            <Badge variant="secondary" size="sm">
              {instance.status}
            </Badge>
          )}
        </div>

        <div className="min-h-[480px] border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
          {loadError ? (
            <div className="flex items-center justify-center h-full min-h-[480px] text-danger text-sm">
              {loadError}
            </div>
          ) : url ? (
            <iframe
              title="Document PDF"
              src={url}
              className="w-full h-full min-h-[480px]"
            />
          ) : visibleSections.length > 0 ? (
            <div className="p-6 space-y-6 overflow-y-auto max-h-[600px]" data-testid="sections-fallback">
              {visibleSections
                .slice()
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                .map((sec) => (
                  <div key={sec.id}>
                    {sec.title && (
                      <h3 className="text-sm font-semibold text-slate-800 mb-1">{sec.title}</h3>
                    )}
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{sec.content}</p>
                  </div>
                ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full min-h-[480px] text-slate-400 text-sm">
              No PDF archived yet
            </div>
          )}
        </div>

        {instance && (
          <AuditInfo
            createdAt={instance.created_at}
            updatedAt={instance.updated_at}
            variant="stacked"
          />
        )}
      </div>
    </Dialog>
  );
};
