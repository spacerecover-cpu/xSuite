import React from 'react';
import { FileStack, Plus, Calendar, Eye, CreditCard as Edit } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Card } from '../../ui/Card';
import { formatDate } from '@/lib/format';
import type { DocumentInstanceStatus } from '@/lib/documentInstanceService';

interface DocumentRow {
  id: string;
  title: string;
  document_number: string | null;
  report_subtype: string | null;
  status: DocumentInstanceStatus;
  version_number: number;
  visible_to_customer: boolean | null;
  created_at: string;
}

interface CaseDocumentsTabProps {
  documents: DocumentRow[];
  onNewDocument: () => void;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
}

/** Status → label + semantic Badge variant (icon+text, never colour-only). */
const STATUS_META: Record<DocumentInstanceStatus, { label: string; variant: 'default' | 'info' | 'success' | 'warning' | 'danger' }> = {
  draft: { label: 'Draft', variant: 'default' },
  in_review: { label: 'In Review', variant: 'info' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
  issued: { label: 'Issued', variant: 'info' },
  delivered: { label: 'Delivered', variant: 'success' },
  signed_off: { label: 'Signed Off', variant: 'success' },
  superseded: { label: 'Superseded', variant: 'warning' },
  void: { label: 'Void', variant: 'danger' },
};

const EDITABLE: DocumentInstanceStatus[] = ['draft', 'in_review'];

export const CaseDocumentsTab: React.FC<CaseDocumentsTabProps> = ({ documents, onNewDocument, onView, onEdit }) => (
  <Card>
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-900">Documents</h2>
        <Button size="sm" onClick={onNewDocument}>
          <Plus className="w-4 h-4 mr-2" />
          New Document
        </Button>
      </div>

      {documents.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <FileStack className="w-16 h-16 mx-auto mb-3 text-slate-300" />
          <p className="text-lg font-medium mb-1">No documents yet</p>
          <p className="text-sm">Create a report or certificate to get started</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {documents.map((doc) => {
            const meta = STATUS_META[doc.status] ?? STATUS_META.draft;
            return (
              <div key={doc.id} className="border border-slate-200 rounded-lg p-4 hover:border-primary/40 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <FileStack className="w-8 h-8 text-primary flex-shrink-0 mt-1" />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900 text-lg">{doc.title}</h3>
                      <p className="text-sm text-slate-600">
                        {doc.document_number}
                        {doc.version_number > 1 && (
                          <span className="ml-2 text-xs px-2 py-0.5 bg-slate-200 text-slate-700 rounded">v{doc.version_number}</span>
                        )}
                      </p>
                      <span className="mt-1 flex items-center gap-1 text-sm text-slate-600">
                        <Calendar className="w-4 h-4" />
                        {formatDate(doc.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                    {doc.visible_to_customer && (
                      <Badge variant="success" size="sm">
                        <Eye className="w-3 h-3 mr-1" />
                        Visible to Customer
                      </Badge>
                    )}
                    <div className="flex gap-1">
                      <Button variant="secondary" size="sm" onClick={() => onView(doc.id)} title="View document">
                        <Eye className="w-4 h-4" />
                      </Button>
                      {EDITABLE.includes(doc.status) && (
                        <Button variant="secondary" size="sm" onClick={() => onEdit(doc.id)} title="Edit draft">
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  </Card>
);
