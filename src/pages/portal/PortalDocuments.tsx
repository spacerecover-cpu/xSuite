import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { SignatureCaptureModal } from '../../components/cases/SignatureCaptureModal';
import type { CapturedSignature } from '../../components/cases/SignatureCaptureModal';
import type { Database } from '../../types/database.types';
import {
  fetchPortalDocuments,
  getPortalDocumentPdfUrl,
  portalSignOffDocument,
} from '../../lib/portalDocumentService';

type DocumentInstance = Database['public']['Tables']['document_instances']['Row'];

export const PortalDocuments: React.FC = () => {
  const { t } = useTranslation();
  const { customer } = usePortalAuth();
  const queryClient = useQueryClient();

  const [selectedDoc, setSelectedDoc] = useState<DocumentInstance | null>(null);
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [signOffError, setSignOffError] = useState<string | null>(null);

  const { data: documents = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['portal_documents', customer?.id],
    queryFn: () => fetchPortalDocuments(customer!.id),
    enabled: !!customer?.id,
  });

  const { data: pdfUrl } = useQuery({
    queryKey: ['portal_document_pdf', selectedDoc?.id],
    queryFn: () => getPortalDocumentPdfUrl(selectedDoc!),
    enabled: !!selectedDoc?.pdf_storage_path,
  });

  const signOffMutation = useMutation({
    mutationFn: ({ docId, sig }: { docId: string; sig: CapturedSignature }) =>
      portalSignOffDocument(docId, sig),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal_documents', customer?.id] });
      setIsSignModalOpen(false);
      setSignOffError(null);
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error
          ? err.message
          : t('portal.documents.signOffErrorFallback', { defaultValue: 'Sign-off failed. Please try again.' });
      setSignOffError(message);
      setIsSignModalOpen(true);
    },
  });

  const handleSelectDoc = (doc: DocumentInstance) => {
    setSelectedDoc(doc);
  };

  const handleSignOff = () => {
    setIsSignModalOpen(true);
  };

  const handleCapture = (sig: CapturedSignature) => {
    if (!selectedDoc) return;
    setSignOffError(null);
    signOffMutation.mutate({ docId: selectedDoc.id, sig });
  };

  const statusBadgeVariant = (status: string) => {
    if (status === 'delivered') return 'info' as const;
    if (status === 'signed_off') return 'success' as const;
    return 'default' as const;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen max-w-3xl mx-auto px-4 py-6 space-y-4">
        {[0, 1].map((i) => (
          <div key={i} className="bg-surface rounded-lg border border-slate-200 p-6 animate-pulse">
            <div className="h-5 w-1/2 bg-slate-200 rounded mb-2" />
            <div className="h-3 w-1/3 bg-slate-200 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">
          {t('portal.documents.heading', { defaultValue: 'Documents' })}
        </h1>
        <p className="text-slate-600">
          {t('portal.documents.subtitle', { defaultValue: 'Review and sign off your delivered documents.' })}
        </p>
      </div>

      {isError && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-muted p-4 text-sm">
          <p className="text-danger font-medium">
            {t('portal.documents.loadError', { defaultValue: 'Could not load documents.' })}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-2 text-primary underline"
          >
            {t('portal.documents.retry', { defaultValue: 'Retry' })}
          </button>
        </div>
      )}

      {!isError && documents.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" aria-hidden="true" />
          <p className="text-lg text-slate-600">
            {t('portal.documents.noDocuments', { defaultValue: 'No documents' })}
          </p>
        </Card>
      ) : !isError && (
        <div className="grid grid-cols-1 gap-4">
          {documents.map((doc) => (
            <Card
              key={doc.id}
              className="p-5 cursor-pointer hover:shadow-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-primary/40"
              onClick={() => handleSelectDoc(doc)}
              role="button"
              tabIndex={0}
              aria-label={t('portal.documents.openDocument', { defaultValue: `Open ${doc.title ?? doc.document_number}`, title: doc.title ?? doc.document_number })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectDoc(doc);
                }
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-slate-900 truncate mb-1">
                    {doc.title ?? doc.document_number}
                  </h3>
                  <p className="text-sm text-slate-500 mb-1">{doc.document_number}</p>
                  {doc.report_subtype && (
                    <p className="text-xs text-slate-400 capitalize">{doc.report_subtype.replace(/_/g, ' ')}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <Badge variant={statusBadgeVariant(doc.status)}>
                    {doc.status === 'signed_off'
                      ? t('portal.documents.status.signed_off', { defaultValue: 'Signed off' })
                      : doc.status === 'delivered'
                        ? t('portal.documents.status.delivered', { defaultValue: 'Delivered' })
                        : t(`portal.documents.status.${doc.status}`, { defaultValue: doc.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) })}
                  </Badge>
                  {doc.status === 'delivered' && (
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectDoc(doc);
                        handleSignOff();
                      }}
                      aria-label={t('portal.documents.signOffButton', { defaultValue: 'Sign off' })}
                    >
                      {t('portal.documents.signOffButton', { defaultValue: 'Sign off' })}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selectedDoc && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-800">
            {selectedDoc.title ?? selectedDoc.document_number}
          </h2>
          {pdfUrl ? (
            <iframe
              title="Document"
              src={pdfUrl}
              className="w-full rounded-lg border border-slate-200 min-h-[60vh]"
            />
          ) : (
            <div className="w-full flex items-center justify-center py-16 text-slate-400">
              {t('portal.documents.loadingPdf', { defaultValue: 'Loading PDF…' })}
            </div>
          )}

          {selectedDoc.status === 'delivered' && (
            <Button onClick={handleSignOff} disabled={signOffMutation.isPending} aria-label={t('portal.documents.signOffButton', { defaultValue: 'Sign off' })}>
              {signOffMutation.isPending
                ? t('portal.documents.signingOff', { defaultValue: 'Signing off…' })
                : t('portal.documents.signOffButton', { defaultValue: 'Sign off' })}
            </Button>
          )}
        </div>
      )}

      <SignatureCaptureModal
        open={isSignModalOpen}
        allowedMethods={['typed', 'click_to_accept']}
        title={t('portal.documents.signOff', { defaultValue: 'Sign off' })}
        onCapture={handleCapture}
        onClose={() => {
          if (!signOffMutation.isPending) {
            setIsSignModalOpen(false);
            setSignOffError(null);
          }
        }}
        errorMessage={signOffError}
      />
    </div>
  );
};
