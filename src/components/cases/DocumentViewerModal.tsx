import React, { useEffect, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Badge } from '../ui/Badge';
import { AuditInfo } from '../ui/AuditInfo';
import {
  getDocumentInstance,
  getDocumentPdfSignedUrl,
} from '../../lib/documentInstanceService';
import type { Database } from '../../types/database.types';

type DocumentInstanceRow = Database['public']['Tables']['document_instances']['Row'];

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
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !instanceId) return;
    let alive = true;
    setLoadError(null);
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
        }
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : 'Couldn\'t load this document.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [isOpen, instanceId]);

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
            <h2 className="text-base font-semibold text-slate-900">
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
