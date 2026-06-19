import React, { useState, useEffect, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { getNextCaseNumber } from '../../lib/caseService';
import { MessageCircle, Printer, FileText, Tag, CheckCircle2, Copy, User, HardDrive, FileStack, AlertCircle, Package, Activity, Settings, History, Users, DollarSign, Trash2, Grid2x2 as Grid, Eye, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { formatDate } from '../../lib/format';
import { quotesService } from '../../lib/quotesService';
import { invoiceService } from '../../lib/invoiceService';
import { useCurrency } from '../../hooks/useCurrency';
import { CaseStageBanner } from '../../components/cases/detail/CaseStageBanner';
import type { CasePhase } from '../../lib/caseStateMachineService';
import { useTenantFeatures } from '../../contexts/TenantConfigContext';
import { CASE_TAB_FEATURE } from '../../lib/features/registry';
import { SendMessageModal } from '../../components/communications/SendMessageModal';
import { DeviceCheckoutModal } from '../../components/cases/DeviceCheckoutModal';
import { DuplicateCaseConfirmationModal } from '../../components/cases/DuplicateCaseConfirmationModal';
import { DeleteCaseConfirmationModal } from '../../components/cases/DeleteCaseConfirmationModal';
import { DeviceFormModal } from '../../components/cases/DeviceFormModal';
import { MarkAsDeliveredModal } from '../../components/cases/MarkAsDeliveredModal';
import { PreserveLongTermModal } from '../../components/cases/PreserveLongTermModal';
import type { CreateCloneDriveFormValues } from '../../components/cases/CreateCloneDriveModal';
import { AuditInfo } from '../../components/ui/AuditInfo';
import { DetailPageTemplate } from '../../components/templates/DetailPageTemplate';
import { DetailPageSkeleton } from '../../components/templates/DetailPageSkeleton';
import { DetailPageNotFound } from '../../components/templates/DetailPageNotFound';
import { ReportTypeSelectionModal } from '../../components/cases/ReportTypeSelectionModal';
import { StreamlinedReportEditor } from '../../components/cases/StreamlinedReportEditor';
import ReportViewModal from '../../components/cases/ReportViewModal';
import { reportsService } from '../../lib/reportsService';
import { PDFPreviewModal } from '../../components/cases/PDFPreviewModal';
import { EmailDocumentModal } from '../../components/cases/EmailDocumentModal';
import { QuoteFormModal } from '../../components/cases/QuoteFormModal';
import { InvoiceFormModal } from '../../components/cases/InvoiceFormModal';
import { ConvertProformaToTaxModal } from '../../components/cases/ConvertProformaToTaxModal';
import { RecordPaymentModal } from '../../components/financial/RecordPaymentModal';
import { createQuote as createQuoteService, type Quote as QuoteShape, type QuoteItem as QuoteItemShape } from '../../lib/quotesService';
import { createInvoice as createInvoiceService, updateInvoice as updateInvoiceService, convertProformaToTaxInvoice, type Invoice as InvoiceShape, type InvoiceItem as InvoiceItemShape } from '../../lib/invoiceService';
import type { Payment as PaymentShape } from '../../lib/paymentsService';
import type { Database } from '../../types/database.types';
import { CaseOverviewTab } from '../../components/cases/detail/CaseOverviewTab';
import { lazyWithRetry } from '../../lib/lazyWithRetry';
import { ContentLoadingFallback } from '../../components/shared/ContentLoadingFallback';
import { useCaseModals } from '../../components/cases/detail/useCaseModals';
import { useCaseQueries } from '../../components/cases/detail/useCaseQueries';
import { useCaseMutations } from '../../components/cases/detail/useCaseMutations';

// Every tab except the default Overview is code-split (direct file imports, not
// the barrel, so each panel gets its own chunk). CaseDetail was the heaviest
// route chunk in the app (~312K raw) because all 14 panels shipped eagerly;
// now they load on first activation and stay cached for the session.
const ClientTab = lazyWithRetry(() => import('../../components/cases/ClientTab').then(m => ({ default: m.ClientTab })));
const CaseBackupDevicesTab = lazyWithRetry(() => import('../../components/cases/CaseBackupDevicesTab').then(m => ({ default: m.CaseBackupDevicesTab })));
const ChainOfCustodyTab = lazyWithRetry(() => import('../../components/cases/ChainOfCustodyTab').then(m => ({ default: m.ChainOfCustodyTab })));
const CaseCommunicationsTab = lazyWithRetry(() => import('../../components/cases/detail/CaseCommunicationsTab').then(m => ({ default: m.CaseCommunicationsTab })));
const CaseActivityTab = lazyWithRetry(() => import('../../components/cases/detail/CaseActivityTab').then(m => ({ default: m.CaseActivityTab })));
const CaseDevicesTab = lazyWithRetry(() => import('../../components/cases/detail/CaseDevicesTab').then(m => ({ default: m.CaseDevicesTab })));
const CaseCloneDrivesTab = lazyWithRetry(() => import('../../components/cases/detail/CaseCloneDrivesTab').then(m => ({ default: m.CaseCloneDrivesTab })));
const CaseReportsTab = lazyWithRetry(() => import('../../components/cases/detail/CaseReportsTab').then(m => ({ default: m.CaseReportsTab })));
const CaseFinancesTab = lazyWithRetry(() => import('../../components/cases/detail/CaseFinancesTab').then(m => ({ default: m.CaseFinancesTab })));
const CaseFilesTab = lazyWithRetry(() => import('../../components/cases/detail/CaseFilesTab').then(m => ({ default: m.CaseFilesTab })));
const CaseEngineersTab = lazyWithRetry(() => import('../../components/cases/detail/CaseEngineersTab').then(m => ({ default: m.CaseEngineersTab })));
const CaseRecoveryQaTab = lazyWithRetry(() => import('../../components/cases/detail/CaseRecoveryQaTab').then(m => ({ default: m.CaseRecoveryQaTab })));
const CaseNotesTab = lazyWithRetry(() => import('../../components/cases/detail/CaseNotesTab').then(m => ({ default: m.CaseNotesTab })));
const CasePortalTab = lazyWithRetry(() => import('../../components/cases/detail/CasePortalTab').then(m => ({ default: m.CasePortalTab })));

type TabType = 'overview' | 'client' | 'devices' | 'clones' | 'reports' | 'quotes' | 'communications' | 'files' | 'engineers' | 'recovery_qa' | 'notes' | 'portal' | 'history' | 'stock';

export const CaseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  // History tab sub-view: the forensic custody ledger vs the workflow activity log.
  const [historyView, setHistoryView] = useState<'custody' | 'activity'>('custody');
  const { isEnabled } = useTenantFeatures();
  const modals = useCaseModals();

  const { formatCurrency } = useCurrency();

  const {
    caseData, isLoading, caseError,
    caseStatuses, devices, cloneDrives, attachments,
    quotes, invoices, caseFinancialSummary, reports,
    caseEngineers, portalSettings, notes,
  } = useCaseQueries(id, {
    reportTypeFilter: modals.reportTypeFilter,
    reportStatusFilter: modals.reportStatusFilter,
    showLatestOnly: modals.showLatestOnly,
  });


  const {
    addNoteMutation, updateNoteMutation, updateCaseStatusMutation, updateCasePriorityMutation,
    updateAssignedEngineerMutation, updateCaseInfoMutation,
    updateDeviceInfoMutation, updateCustomerInfoMutation, markAsDeliveredMutation,
    preserveLongTermMutation, duplicateCaseMutation, deleteCaseMutation,
    createCloneDriveMutation, extractCloneMutation, archiveCloneMutation,
    createPaymentMutation,
    queryClient, navigate, profile, toast,
  } = useCaseMutations({ id, caseData, devices, modals });

  // Reserve the next job number when the duplicate confirmation opens so the
  // user sees the exact number the copy will receive. get_next_number advances
  // the sequence, so the reserved number is reused on confirm; cancelling just
  // leaves a (harmless) gap. staleTime keeps the same number across re-opens.
  const nextCaseNumberQuery = useQuery({
    queryKey: ['next_case_number', 'duplicate', id],
    queryFn: getNextCaseNumber,
    enabled: modals.showDuplicateModal,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
  });

  // Holds a pending submission while the SpaceInsufficientWarningModal asks
  // the user to confirm before we INSERT into clone_drives.
  const handleCreateCloneSubmit = (values: CreateCloneDriveFormValues) => {
    createCloneDriveMutation.mutate({
      deviceId: values.deviceId,
      driveLabel: values.driveLabel,
      capacity: values.capacity,
      storageServer: values.storageServer,
      storagePath: values.storagePath,
      storageType: values.storageType,
      imageFormat: values.imageFormat,
      expectedSizeGb: values.expectedSizeGb,
      resourceCloneDriveId: values.resourceCloneDriveId,
    });
  };

  const handleProceedSpaceWarning = () => {
    modals.setShowSpaceWarningModal(false);
    if (modals.pendingCloneCreate) {
      handleCreateCloneSubmit(modals.pendingCloneCreate);
      modals.setPendingCloneCreate(null);
    }
  };

  const [isConvertingProforma, setIsConvertingProforma] = useState(false);

  const invalidateCaseFinanceQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['quotes', 'case', id] });
    queryClient.invalidateQueries({ queryKey: ['invoices', 'case', id] });
    queryClient.invalidateQueries({ queryKey: ['case_financial_summary', id] });
    queryClient.invalidateQueries({ queryKey: ['quotes'] });
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
  };

  // Header quick action — opens the templated WhatsApp handoff modal (renders
  // a tenant template with case context, logs to case_communications).
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);
  const handleWhatsApp = () => {
    setWhatsAppModalOpen(true);
  };

  const handlePrintOfficeReceipt = () => {
    modals.setPreviewDocumentType('office_receipt');
    modals.setShowPDFPreviewModal(true);
  };

  const handlePrintCustomerCopy = () => {
    modals.setPreviewDocumentType('customer_copy');
    modals.setShowPDFPreviewModal(true);
  };

  const handlePrintLabel = () => {
    modals.setPreviewDocumentType('case_label');
    modals.setShowPDFPreviewModal(true);
  };

  const handleSendEmailFromPreview = (_blobUrl: string, blob: Blob, filename: string) => {
    modals.setEmailPdfBlob(blob);
    modals.setEmailPdfFilename(filename);
    modals.setShowEmailModal(true);
    // Close PDF preview so the email modal isn't stacked behind it.
    modals.setShowPDFPreviewModal(false);
  };

  const handleOpenCheckoutPreview = () => {
    modals.setPreviewDocumentType('checkout_form');
    modals.setShowPDFPreviewModal(true);
  };

  const handleRecordPayment = (invoice: { id: string; invoice_type: string | null }): void => {
    // Only allow payment recording for tax invoices, not proforma invoices
    if (invoice.invoice_type !== 'tax_invoice') {
      toast.error('Payments can only be recorded against Tax Invoices, not Proforma Invoices. Please convert this to a Tax Invoice first.');
      return;
    }
    void (async () => {
      const invoiceId = invoice.id;
      if (!invoiceId) return;
      const fullInvoice = await invoiceService.fetchInvoiceById(invoiceId);
      modals.setSelectedInvoiceForPayment(fullInvoice);
      modals.setShowRecordPaymentModal(true);
    })();
  };

  const handleIssueInvoice = (invoice: { id: string; invoice_number?: string | null }): void => {
    void (async () => {
      try {
        await invoiceService.issueInvoice(invoice.id);
        toast.success(`Invoice ${invoice.invoice_number ?? ''} issued — payments can now be recorded`.trim());
        queryClient.invalidateQueries({ queryKey: ['invoices', 'case', id] });
        queryClient.invalidateQueries({ queryKey: ['case_financial_summary', id] });
      } catch (e) {
        toast.error((e as Error).message || 'Failed to issue invoice');
      }
    })();
  };

  const handleDuplicateCase = () => {
    modals.setShowDuplicateModal(true);
  };

  const handleConfirmDuplicate = () => {
    duplicateCaseMutation.mutate(nextCaseNumberQuery.data);
  };

  const handleDeleteCase = () => {
    modals.setShowDeleteModal(true);
  };

  const handleConfirmDelete = () => {
    deleteCaseMutation.mutate();
  };

  const handleAddNote = () => {
    if (modals.newNote.trim()) {
      addNoteMutation.mutate(modals.newNote);
    }
  };


  const getStatusColor = (statusName: string | null | undefined) => {
    if (!statusName) return '#6b7280';
    const status = caseStatuses.find(s => s.name === statusName);
    return status?.color || '#6b7280';
  };

  const getStatusDisplayName = (statusName: string | null | undefined) => {
    if (!statusName) return '';
    const status = caseStatuses.find(s => s.name === statusName);
    return status?.name || statusName;
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Grid },
    { id: 'client', label: 'Client', icon: User },
    { id: 'devices', label: 'Devices', icon: HardDrive },
    { id: 'clones', label: 'Clone Drives', icon: Copy },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'quotes', label: 'Quotes/Invoices', icon: DollarSign },
    { id: 'communications', label: 'Communications', icon: Mail },
    { id: 'stock', label: 'Backup Devices', icon: Package },
    { id: 'files', label: 'Files', icon: FileStack },
    { id: 'engineers', label: 'Engineers', icon: Users },
    { id: 'recovery_qa', label: 'Recovery & QA', icon: Activity },
    { id: 'notes', label: 'Internal Notes', icon: FileText },
    { id: 'portal', label: 'Client Portal', icon: Eye },
    { id: 'history', label: 'History', icon: History },
  ].filter((tab) => isEnabled(CASE_TAB_FEATURE[tab.id] ?? ''));

  // If the active tab is disabled by a tenant feature flag, fall back to Overview
  // (always-on core) so the content pane never goes blank.
  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab('overview');
    }
  }, [tabs, activeTab]);

  if (isLoading) {
    return <DetailPageSkeleton />;
  }

  if (caseError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-danger/40 mx-auto mb-4" />
          <p className="text-slate-500 text-lg">Error loading case</p>
          <p className="text-slate-400 text-sm mt-2">{(caseError as Error).message}</p>
          <Button onClick={() => navigate('/cases')} className="mt-4">
            Back to Cases
          </Button>
        </div>
      </div>
    );
  }

  if (!caseData) {
    return <DetailPageNotFound backTo={{ to: '/cases', label: 'Back to Cases' }} />;
  }

  return (
    <DetailPageTemplate
      header={{
        breadcrumbs: [{ label: 'Cases', to: '/cases' }, { label: `Case #${caseData.case_no}` }],
        badges: (
          <Badge variant="custom" color={getStatusColor(caseData.status)} size="lg">
            {getStatusDisplayName(caseData.status)}
          </Badge>
        ),
        actions: (
          <>
            <Button
              onClick={handleWhatsApp}
              style={{ backgroundColor: '#25D366' }}
              size="sm"
              title="Send WhatsApp Message"
            >
              <MessageCircle className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">WhatsApp</span>
            </Button>
            <Button
              onClick={handlePrintOfficeReceipt}
              className="bg-cat-5 text-white hover:bg-cat-5/90"
              size="sm"
              title="Print Office Receipt"
            >
              <Printer className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Office Receipt</span>
            </Button>
            <Button
              onClick={handlePrintCustomerCopy}
              className="bg-cat-2 text-white hover:bg-cat-2/90"
              size="sm"
              title="Print Customer Copy"
            >
              <FileText className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Customer Copy</span>
            </Button>
            <Button
              onClick={handlePrintLabel}
              className="bg-cat-7 text-white hover:bg-cat-7/90"
              size="sm"
              title="Print Label"
            >
              <Tag className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Print Label</span>
            </Button>
            <Button
              onClick={() => modals.setShowCheckoutModal(true)}
              variant="accent"
              size="sm"
              title="Device Checkout"
            >
              <CheckCircle2 className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Checkout</span>
            </Button>
            <Button
              onClick={handleDuplicateCase}
              variant="secondary"
              size="sm"
              title="Duplicate Case"
            >
              <Copy className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Duplicate</span>
            </Button>
            {profile?.role === 'admin' && (
              <Button
                onClick={handleDeleteCase}
                variant="danger"
                size="sm"
                title="Delete Case Permanently"
              >
                <Trash2 className="w-4 h-4 md:mr-2" />
                <span className="hidden md:inline">Delete</span>
              </Button>
            )}
          </>
        ),
        meta: (
          <AuditInfo
            className="mt-2"
            createdAt={caseData.created_at}
            createdByName={caseData.created_by_profile?.full_name}
            updatedAt={caseData.updated_at}
            updatedByName={caseData.updated_by_profile?.full_name}
          />
        ),
      }}
      outside={
        <>
          {/* WhatsApp handoff (header quick action) */}
          {whatsAppModalOpen && caseData && (
            <SendMessageModal
              isOpen={whatsAppModalOpen}
              onClose={() => setWhatsAppModalOpen(false)}
              channel="whatsapp"
              caseId={id!}
              customerId={caseData.customer_id ?? undefined}
              defaultPhone={caseData.contact?.mobile_number || caseData.customer?.mobile_number || caseData.customer?.phone || ''}
              contextRefs={{ caseId: id! }}
            />
          )}

          {/* Checkout Modal */}
          {modals.showCheckoutModal && (
            <DeviceCheckoutModal
              isOpen={modals.showCheckoutModal}
              onClose={() => modals.setShowCheckoutModal(false)}
              caseId={id!}
              caseNumber={caseData.case_no ?? ''}
              devices={devices as unknown as React.ComponentProps<typeof DeviceCheckoutModal>['devices']}
              customerName={caseData.customer?.customer_name || ''}
              customerMobileNumber={caseData.customer?.mobile_number || caseData.customer?.phone || ''}
              onCheckoutComplete={() => {
                queryClient.invalidateQueries({ queryKey: ['case', id] });
                queryClient.invalidateQueries({ queryKey: ['case_history', id] });
              }}
              onShowCheckoutPreview={handleOpenCheckoutPreview}
            />
          )}

          {/* Duplicate Case Confirmation Modal */}
          {modals.showDuplicateModal && (
            <DuplicateCaseConfirmationModal
              isOpen={modals.showDuplicateModal}
              onClose={() => modals.setShowDuplicateModal(false)}
              onConfirm={handleConfirmDuplicate}
              originalCaseNumber={caseData.case_no ?? ''}
              customerName={caseData.customer?.customer_name || 'Unknown'}
              serviceName={caseData.service_type?.name || 'Unknown'}
              newCaseNumber={nextCaseNumberQuery.data}
              isGeneratingNumber={nextCaseNumberQuery.isFetching}
              isLoading={duplicateCaseMutation.isPending}
            />
          )}

          {/* Delete Case Confirmation Modal */}
          {modals.showDeleteModal && (
            <DeleteCaseConfirmationModal
              isOpen={modals.showDeleteModal}
              onClose={() => modals.setShowDeleteModal(false)}
              onConfirm={handleConfirmDelete}
              caseNumber={caseData.case_no ?? ''}
              caseTitle={caseData.title || 'Untitled Case'}
              isDeleting={deleteCaseMutation.isPending}
            />
          )}

          {/* Device Form Modal */}
          {modals.showDeviceModal && (
            <DeviceFormModal
              isOpen={modals.showDeviceModal}
              onClose={() => {
                modals.setShowDeviceModal(false);
                modals.setEditingDevice(null);
              }}
              caseId={id!}
              deviceData={modals.editingDevice}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['case_devices', id] });
                modals.setShowDeviceModal(false);
                modals.setEditingDevice(null);
              }}
            />
          )}

          {/* View Clone Drive Modal */}
          {modals.viewCloneModal && (
            <Modal
              isOpen={!!modals.viewCloneModal}
              onClose={() => modals.setViewCloneModal(null)}
              title={`Clone Drive Details - ${caseData.case_no}`}
              icon={Copy}
              maxWidth="3xl"
            >
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-600">Clone ID</label>
                    <p className="text-sm text-slate-900 font-semibold">Clone #{caseData.case_no}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600">Status</label>
                    <p className="text-sm text-slate-900 capitalize">{modals.viewCloneModal.status}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600">Storage Path</label>
                    <p className="text-sm text-slate-900 font-mono break-all">{modals.viewCloneModal.storage_path}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600">Storage Server</label>
                    <p className="text-sm text-slate-900">{modals.viewCloneModal.storage_server || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600">Image Format</label>
                    <p className="text-sm text-slate-900 uppercase">{modals.viewCloneModal.image_format || 'DD'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600">Image Size</label>
                    <p className="text-sm text-slate-900">{modals.viewCloneModal.image_size_gb ? `${modals.viewCloneModal.image_size_gb} GB` : 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600">Clone Date</label>
                    <p className="text-sm text-slate-900">{formatDate(modals.viewCloneModal.clone_date)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600">Cloned By</label>
                    <p className="text-sm text-slate-900">{modals.viewCloneModal.cloned_by_name || 'Unknown'}</p>
                  </div>
                  {modals.viewCloneModal.extracted_date && (
                    <>
                      <div>
                        <label className="text-sm font-medium text-slate-600">Extracted Date</label>
                        <p className="text-sm text-slate-900">{formatDate(modals.viewCloneModal.extracted_date)}</p>
                      </div>
                    </>
                  )}
                </div>
                {modals.viewCloneModal.notes && (
                  <div>
                    <label className="text-sm font-medium text-slate-600">Notes</label>
                    <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded">{modals.viewCloneModal.notes}</p>
                  </div>
                )}
                <div className="flex justify-end pt-4 border-t border-slate-200">
                  <Button variant="secondary" onClick={() => modals.setViewCloneModal(null)}>
                    Close
                  </Button>
                </div>
              </div>
            </Modal>
          )}

          {/* Mark As Delivered Modal */}
          <MarkAsDeliveredModal
            isOpen={modals.showMarkAsDeliveredModal}
            onClose={() => {
              modals.setShowMarkAsDeliveredModal(false);
              modals.setSelectedClone(null);
            }}
            onConfirm={(updateCaseStatus, deliveryNotes, retentionDays) => {
              if (modals.selectedClone) {
                markAsDeliveredMutation.mutate({ cloneId: modals.selectedClone.id, updateCaseStatus, deliveryNotes, retentionDays });
              }
            }}
            clone={modals.selectedClone}
            caseNo={caseData?.case_no ?? undefined}
            caseStatus={caseData?.status ?? undefined}
            patientDeviceName={
              modals.selectedClone && devices.length > 0
                ? (() => {
                    const patientDevice = devices.find(d => d.id === modals.selectedClone.patient_device_id);
                    return patientDevice
                      ? `${patientDevice.device_type?.name || 'Device'} ${patientDevice.serial_number ? `(${patientDevice.serial_number})` : ''}`
                      : 'Unknown Device';
                  })()
                : undefined
            }
            isLoading={markAsDeliveredMutation.isPending}
          />

          {/* Preserve Long-term Modal */}
          <PreserveLongTermModal
            isOpen={modals.showPreserveLongTermModal}
            onClose={() => {
              modals.setShowPreserveLongTermModal(false);
              modals.setSelectedClone(null);
            }}
            onConfirm={(preserveReason) => {
              if (modals.selectedClone) {
                preserveLongTermMutation.mutate({ cloneId: modals.selectedClone.id, preserveReason });
              }
            }}
            clone={modals.selectedClone}
            caseNo={caseData?.case_no ?? undefined}
            patientDeviceName={
              modals.selectedClone && devices.length > 0
                ? (() => {
                    const patientDevice = devices.find(d => d.id === modals.selectedClone.patient_device_id);
                    return patientDevice
                      ? `${patientDevice.device_type?.name || 'Device'} ${patientDevice.serial_number ? `(${patientDevice.serial_number})` : ''}`
                      : 'Unknown Device';
                  })()
                : undefined
            }
            isLoading={preserveLongTermMutation.isPending}
          />

          {/* Quote View Modal */}
          {modals.viewingQuote && (
            <PDFPreviewModal
              isOpen={!!modals.viewingQuote}
              onClose={() => modals.setViewingQuote(null)}
              documentType="quote"
              documentId={modals.viewingQuote.id}
              documentNumber={modals.viewingQuote.quote_number}
              customerEmail={modals.viewingQuote.customers?.email}
            />
          )}

          {/* Invoice View Modal */}
          {modals.viewingInvoice && (
            <PDFPreviewModal
              isOpen={!!modals.viewingInvoice}
              onClose={() => modals.setViewingInvoice(null)}
              documentType="invoice"
              documentId={modals.viewingInvoice.id}
              documentNumber={modals.viewingInvoice.invoice_number}
              customerEmail={modals.viewingInvoice.customers_enhanced?.email || modals.viewingInvoice.customers?.email}
            />
          )}

          {/* Report Type Selection Modal */}
          {caseData && (
            <ReportTypeSelectionModal
              isOpen={modals.showReportTypeSelector}
              onClose={() => modals.setShowReportTypeSelector(false)}
              onSelectType={(type) => {
                modals.setSelectedReportType(type);
                modals.setShowReportTypeSelector(false);
              }}
              caseNumber={caseData.case_no || caseData.case_number || ''}
              serviceType={caseData.service_type?.name || 'Data Recovery'}
            />
          )}

          {/* Streamlined Report Editor */}
          {caseData && (modals.selectedReportType || modals.editingReport || modals.reportVersioningId) && (
            <StreamlinedReportEditor
              isOpen={!!(modals.selectedReportType || modals.editingReport || modals.reportVersioningId)}
              onClose={() => {
                modals.setSelectedReportType(null);
                modals.setEditingReport(null);
                modals.setReportVersioningId(null);
              }}
              reportType={modals.editingReport?.report_type || modals.selectedReportType}
              caseId={id!}
              caseData={{
                case_no: caseData.case_no || caseData.case_number || '',
                title: caseData.title || '',
                service_type: caseData.service_type ?? undefined,
                customer: caseData.customer
                  ? {
                      first_name: caseData.customer.customer_name,
                    }
                  : undefined,
                assigned_engineer: caseData.assigned_engineer ?? undefined,
                created_at: caseData.created_at,
              }}
              deviceData={devices && devices.length > 0 ? {
                device_type: devices[0].device_type?.name || '',
                brand: devices[0].brand?.name || '',
                model: devices[0].model || '',
                capacity: devices[0].capacity?.name || '',
                serial_number: devices[0].serial_number || '',
                symptoms: devices[0].symptoms || '',
              } : undefined}
              reportId={modals.editingReport?.id}
              existingReport={modals.editingReport}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['case_reports', id] });
                modals.setSelectedReportType(null);
                modals.setEditingReport(null);
                modals.setReportVersioningId(null);
              }}
            />
          )}

          {/* Report View Modal */}
          <ReportViewModal
            isOpen={!!modals.viewReportId}
            onClose={() => modals.setViewReportId(null)}
            reportId={modals.viewReportId || ''}
            onNewVersion={() => {
              modals.setReportVersioningId(modals.viewReportId);
              modals.setViewReportId(null);
            }}
            onApprove={async (reportId) => {
              await reportsService.approveReport(reportId, profile?.id || '');
              queryClient.invalidateQueries({ queryKey: ['case_reports', id] });
            }}
            onSend={async (reportId) => {
              await reportsService.sendReportToCustomer(reportId);
              queryClient.invalidateQueries({ queryKey: ['case_reports', id] });
            }}
          />

          {/* PDF Preview Modal */}
          {modals.showPDFPreviewModal && modals.previewDocumentType && caseData && (
            <PDFPreviewModal
              isOpen={modals.showPDFPreviewModal}
              onClose={() => {
                modals.setShowPDFPreviewModal(false);
                modals.setPreviewDocumentType(null);
              }}
              documentId={id!}
              documentNumber={caseData.case_no || caseData.case_number || ''}
              documentType={modals.previewDocumentType}
              customerEmail={caseData.customer?.email ?? undefined}
              onSendEmail={handleSendEmailFromPreview}
            />
          )}

          {/* Email Document Modal */}
          {modals.showEmailModal && modals.emailPdfBlob && modals.previewDocumentType && caseData && (
            <EmailDocumentModal
              isOpen={modals.showEmailModal}
              onClose={() => {
                modals.setShowEmailModal(false);
                modals.setEmailPdfBlob(null);
                modals.setEmailPdfFilename('');
              }}
              blob={modals.emailPdfBlob}
              filename={modals.emailPdfFilename}
              documentType={modals.previewDocumentType}
              caseId={id!}
              caseNumber={caseData.case_no || caseData.case_number || ''}
              customerName={caseData.customer?.customer_name || 'Customer'}
              customerEmail={caseData.customer?.email ?? undefined}
              companyName="Data Recovery"
            />
          )}

          {/* Quote Form Modal — create / edit */}
          {modals.showQuoteModal && (
            <QuoteFormModal
              isOpen={modals.showQuoteModal}
              onClose={() => {
                modals.setShowQuoteModal(false);
                modals.setEditingQuote(null);
              }}
              caseId={id!}
              customerId={caseData?.customer_id ?? null}
              companyId={caseData?.company_id ?? null}
              initialData={modals.editingQuote ?? undefined}
              clientReference={caseData?.client_reference ?? undefined}
              onSave={async (quoteData, items) => {
                try {
                  const stateEditingId = (modals.editingQuote as { id?: string } | null)?.id;
                  const payloadEditingId = typeof quoteData.id === 'string' && quoteData.id ? quoteData.id : undefined;
                  const editingQuoteId = payloadEditingId ?? stateEditingId;
                  if (editingQuoteId) {
                    // Edit path — patch quote + replace line items inline
                    const updatePayload: Database['public']['Tables']['quotes']['Update'] = {
                      status: typeof quoteData.status === 'string' ? quoteData.status : 'draft',
                      valid_until: typeof quoteData.valid_until === 'string' && quoteData.valid_until ? quoteData.valid_until : null,
                      tax_rate: typeof quoteData.tax_rate === 'number' ? quoteData.tax_rate : 0,
                      discount_amount: typeof quoteData.discount_amount === 'number' ? quoteData.discount_amount : 0,
                      discount_type: typeof quoteData.discount_type === 'string' ? quoteData.discount_type : 'fixed',
                      title: typeof quoteData.title === 'string' ? quoteData.title : null,
                      client_reference: typeof quoteData.client_reference === 'string' ? quoteData.client_reference : null,
                      bank_account_id: typeof quoteData.bank_account_id === 'string' ? quoteData.bank_account_id : null,
                      terms: typeof quoteData.terms_and_conditions === 'string' ? quoteData.terms_and_conditions : null,
                      notes: typeof quoteData.notes === 'string' ? quoteData.notes : null,
                      updated_at: new Date().toISOString(),
                    };
                    const { error: upErr } = await supabase
                      .from('quotes')
                      .update(updatePayload)
                      .eq('id', editingQuoteId);
                    if (upErr) throw upErr;

                    await supabase
                      .from('quote_items')
                      .update({ deleted_at: new Date().toISOString() })
                      .eq('quote_id', editingQuoteId);

                    const itemsToInsert = items.map((item, index) => ({
                      quote_id: editingQuoteId,
                      description: item.description,
                      quantity: item.quantity,
                      unit_price: item.unit_price,
                      total: Math.round(item.quantity * item.unit_price * 100) / 100,
                      sort_order: index,
                    })) as Database['public']['Tables']['quote_items']['Insert'][];
                    if (itemsToInsert.length > 0) {
                      const { error: itemsErr } = await supabase
                        .from('quote_items')
                        .insert(itemsToInsert);
                      if (itemsErr) throw itemsErr;
                    }
                    toast.success('Quote updated successfully');
                  } else {
                    // Create path — use service so number generation + totals are centralised
                    const newQuote: QuoteShape = {
                      case_id: id!,
                      customer_id: caseData?.customer_id ?? null,
                      company_id: caseData?.company_id ?? null,
                      status: (typeof quoteData.status === 'string' ? quoteData.status : 'draft') as QuoteShape['status'],
                      title: typeof quoteData.title === 'string' ? quoteData.title : undefined,
                      client_reference: typeof quoteData.client_reference === 'string' ? quoteData.client_reference : undefined,
                      valid_until: typeof quoteData.valid_until === 'string' && quoteData.valid_until ? quoteData.valid_until : undefined,
                      tax_rate: typeof quoteData.tax_rate === 'number' ? quoteData.tax_rate : 0,
                      discount_amount: typeof quoteData.discount_amount === 'number' ? quoteData.discount_amount : 0,
                      discount_type: (typeof quoteData.discount_type === 'string' ? quoteData.discount_type : 'fixed') as QuoteShape['discount_type'],
                      bank_account_id: typeof quoteData.bank_account_id === 'string' ? quoteData.bank_account_id : null,
                      terms: typeof quoteData.terms_and_conditions === 'string' ? quoteData.terms_and_conditions : undefined,
                      notes: typeof quoteData.notes === 'string' ? quoteData.notes : undefined,
                    };
                    const quoteItems: QuoteItemShape[] = items.map((item, index) => ({
                      description: item.description,
                      quantity: item.quantity,
                      unit_price: item.unit_price,
                      sort_order: index,
                    }));
                    await createQuoteService(newQuote, quoteItems);
                    toast.success('Quote created successfully');
                  }
                  invalidateCaseFinanceQueries();
                } catch (error: unknown) {
                  const msg = error instanceof Error ? error.message : 'Failed to save quote';
                  toast.error(msg);
                  throw error;
                }
              }}
            />
          )}

          {/* Invoice Form Modal — create / edit */}
          {modals.showInvoiceModal && (
            <InvoiceFormModal
              isOpen={modals.showInvoiceModal}
              onClose={() => {
                modals.setShowInvoiceModal(false);
                modals.setEditingInvoice(null);
              }}
              caseId={id!}
              customerId={caseData?.customer_id ?? null}
              companyId={caseData?.company_id ?? null}
              initialData={modals.editingInvoice ?? undefined}
              quotes={(quotes || []).map((q) => ({
                id: q.id,
                quote_number: q.quote_number ?? null,
                title: null,
                total_amount: q.total_amount ?? null,
              }))}
              clientReference={caseData?.client_reference ?? undefined}
              onSave={async (invoiceData, items) => {
                try {
                  const stateEditingId = (modals.editingInvoice as { id?: string } | null)?.id;
                  const payload = invoiceData as Partial<InvoiceShape> & { id?: string };
                  const payloadEditingId = typeof payload.id === 'string' && payload.id ? payload.id : undefined;
                  const editingInvoiceId = payloadEditingId ?? stateEditingId;
                  const lineItems = items as InvoiceItemShape[];
                  if (editingInvoiceId) {
                    await updateInvoiceService(editingInvoiceId, {
                      case_id: payload.case_id,
                      customer_id: payload.customer_id,
                      company_id: payload.company_id,
                      title: payload.title,
                      invoice_type: payload.invoice_type,
                      invoice_date: payload.invoice_date,
                      due_date: payload.due_date,
                      status: payload.status,
                      notes: payload.notes,
                      internal_notes: payload.internal_notes,
                      discount_amount: payload.discount_amount,
                      discount_type: payload.discount_type,
                      tax_rate: payload.tax_rate,
                      client_reference: payload.client_reference,
                      bank_account_id: payload.bank_account_id,
                      terms_and_conditions: payload.terms_and_conditions,
                      quote_id: payload.quote_id,
                    }, lineItems);
                    toast.success('Invoice updated successfully');
                  } else {
                    await createInvoiceService({
                      title: payload.title,
                      case_id: id!,
                      customer_id: payload.customer_id ?? caseData?.customer_id ?? null,
                      company_id: payload.company_id ?? caseData?.company_id ?? null,
                      invoice_type: payload.invoice_type ?? 'tax_invoice',
                      invoice_date: payload.invoice_date ?? new Date().toISOString().split('T')[0],
                      due_date: payload.due_date ?? new Date().toISOString().split('T')[0],
                      status: payload.status ?? 'draft',
                      notes: payload.notes,
                      discount_amount: payload.discount_amount,
                      discount_type: payload.discount_type,
                      tax_rate: payload.tax_rate,
                      client_reference: payload.client_reference,
                      bank_account_id: payload.bank_account_id,
                      terms_and_conditions: payload.terms_and_conditions,
                      quote_id: payload.quote_id,
                    }, lineItems);
                    toast.success('Invoice created successfully');
                  }
                  invalidateCaseFinanceQueries();
                } catch (error: unknown) {
                  const msg = error instanceof Error ? error.message : 'Failed to save invoice';
                  toast.error(msg);
                  throw error;
                }
              }}
            />
          )}

          {/* Convert Proforma to Tax Invoice Modal */}
          {modals.showConvertProformaModal && modals.convertingInvoice && (
            <ConvertProformaToTaxModal
              isOpen={modals.showConvertProformaModal}
              onClose={() => {
                modals.setShowConvertProformaModal(false);
                modals.setConvertingInvoice(null);
              }}
              source={{
                number: (modals.convertingInvoice as { invoice_number?: string | null }).invoice_number ?? null,
                customerName: caseData.customer?.customer_name ?? null,
                totalAmount: (modals.convertingInvoice as { total_amount?: number | null }).total_amount ?? null,
              }}
              isConverting={isConvertingProforma}
              onConvert={async (data) => {
                const convertingId = (modals.convertingInvoice as { id?: string } | null)?.id;
                if (!convertingId) return;
                try {
                  setIsConvertingProforma(true);
                  await convertProformaToTaxInvoice(
                    convertingId,
                    data.dueDate,
                    data.notes
                  );
                  invalidateCaseFinanceQueries();
                  toast.success('Converted to Tax Invoice');
                  modals.setShowConvertProformaModal(false);
                  modals.setConvertingInvoice(null);
                } catch (error: unknown) {
                  const msg = error instanceof Error ? error.message : 'Failed to convert';
                  toast.error(msg);
                } finally {
                  setIsConvertingProforma(false);
                }
              }}
            />
          )}

          {/* Record Payment Modal */}
          {modals.showRecordPaymentModal && (
            <RecordPaymentModal
              isOpen={modals.showRecordPaymentModal}
              onClose={() => {
                modals.setShowRecordPaymentModal(false);
                modals.setSelectedInvoiceForPayment(null);
              }}
              preselectedCaseId={id ?? undefined}
              preselectedInvoiceId={(modals.selectedInvoiceForPayment as { id?: string } | null)?.id ?? undefined}
              onSave={async (paymentData, allocations) => {
                await createPaymentMutation.mutateAsync({
                  paymentData: paymentData as Omit<PaymentShape, 'id' | 'payment_number' | 'created_at' | 'updated_at'>,
                  allocations,
                });
                invalidateCaseFinanceQueries();
              }}
            />
          )}
        </>
      }
    >

      {/* Stage banner + Quick Info Cards */}
      <div className="bg-white rounded-lg p-6 mb-6 shadow-sm border border-slate-200">
        {/* Stage banner: shows current phase + Next Action CTA + allowed transitions */}
        {isEnabled('workflow.stage_banner') && (
          <div className="mb-6">
            <CaseStageBanner
              caseId={id!}
              currentStatusId={caseData.status_id ?? null}
              currentStatusName={caseData.status ?? null}
              currentPhase={(() => {
                if (!caseData.status_id) return null;
                const match = caseStatuses.find((s) => s.id === caseData.status_id);
                return (match?.type as CasePhase | undefined) ?? null;
              })()}
            />
          </div>
        )}

        {/* Quick Info Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-info-muted/30 border border-slate-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-info-muted rounded-lg flex items-center justify-center">
                <User className="w-5 h-5 text-info" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-500 font-medium">Customer</div>
                <div className="text-sm font-bold text-slate-900 truncate">{caseData.customer?.customer_name || '-'}</div>
              </div>
            </div>
          </div>

          <div className="bg-success-muted/30 border border-slate-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-success-muted rounded-lg flex items-center justify-center">
                <Settings className="w-5 h-5 text-success" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-500 font-medium">Service</div>
                <div className="text-sm font-bold text-slate-900 truncate">{caseData.service_type?.name || '-'}</div>
              </div>
            </div>
          </div>

          <div className="bg-accent/10 border border-slate-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent/20 rounded-lg flex items-center justify-center">
                <Package className="w-5 h-5 text-accent-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-500 font-medium">Devices</div>
                <div className="text-sm font-bold text-slate-900">{devices.length} item{devices.length !== 1 ? 's' : ''}</div>
              </div>
            </div>
          </div>

          <div className="bg-warning-muted/30 border border-slate-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-warning-muted rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-warning" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-500 font-medium">Priority</div>
                <div className="text-sm font-bold text-slate-900 capitalize">{caseData.priority}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabbed Navigation */}
      <div className="mb-6 border-b border-slate-200 overflow-x-auto">
        <nav className="flex gap-1 min-w-max">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary bg-primary/10'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <CaseOverviewTab
          caseData={caseData}
          devices={devices || []}
          isSavingCaseInfo={updateCaseInfoMutation.isPending}
          isSavingDeviceInfo={updateDeviceInfoMutation.isPending}
          isSavingClientInfo={updateCustomerInfoMutation.isPending}
          onSaveCaseInfo={(updates) => updateCaseInfoMutation.mutate(updates)}
          onSaveDeviceInfo={(deviceId, updates) => updateDeviceInfoMutation.mutate({ deviceId, updates })}
          onSaveClientInfo={(customerUpdates, deviceUpdates) => {
            if (Object.keys(customerUpdates).length > 0) {
              updateCustomerInfoMutation.mutate(customerUpdates);
            }
            if (deviceUpdates.password !== undefined && devices[0]) {
              updateDeviceInfoMutation.mutate({ deviceId: devices[0].id, updates: { password: deviceUpdates.password } });
            }
          }}
          onUpdateStatus={(newStatus) => updateCaseStatusMutation.mutate(newStatus)}
          onUpdatePriority={(newPriority) => updateCasePriorityMutation.mutate(newPriority)}
          onUpdateEngineer={(engineerId) => updateAssignedEngineerMutation.mutate(engineerId)}
          profile={profile ? { role: profile.role, case_access_level: profile.case_access_level } : null}
        />
      )}

      {/* Other tabs content (code-split; fallback covers first activation) */}
      {activeTab !== 'overview' && (
        <Suspense fallback={<ContentLoadingFallback />}>
          {/* Client Tab */}
          {activeTab === 'client' && (
            <ClientTab caseId={id!} caseData={caseData} />
          )}

          {/* Devices Tab */}
          {activeTab === 'devices' && (
            <CaseDevicesTab
              caseData={caseData}
              devices={devices || []}
              expandedDevices={modals.expandedDevices}
              showPassword={modals.showPassword}
              onToggleDeviceDetails={modals.toggleDeviceDetails}
              onSetShowDeviceModal={modals.setShowDeviceModal}
              onSetEditingDevice={modals.setEditingDevice}
              onSetShowPassword={modals.setShowPassword}
            />
          )}


          {/* Clone Drives Tab */}
          {activeTab === 'clones' && (
            <CaseCloneDrivesTab
              caseId={id!}
              caseData={caseData}
              devices={devices || []}
              cloneDrives={cloneDrives || []}
              onSetViewCloneModal={modals.setViewCloneModal}
              onSetSelectedClone={modals.setSelectedClone}
              onSetShowMarkAsDeliveredModal={modals.setShowMarkAsDeliveredModal}
              onSetShowPreserveLongTermModal={modals.setShowPreserveLongTermModal}
              showCreateModal={modals.showCreateCloneModal}
              onOpenCreateModal={() => modals.setShowCreateCloneModal(true)}
              onCloseCreateModal={() => {
                modals.setShowCreateCloneModal(false);
                modals.setPendingCloneCreate(null);
              }}
              onCreateCloneSubmit={handleCreateCloneSubmit}
              onCreateCloneSpaceShort={({ values, resource }) => {
                modals.setPendingCloneCreate(values);
                modals.setSpaceWarningInfo({
                  cloneLabel: resource.label,
                  totalCapacity: resource.capacity_gb,
                  currentUsed: resource.used_gb,
                  availableSpace: resource.available_gb,
                  requiredSpace: values.expectedSizeGb ?? 0,
                });
                modals.setShowSpaceWarningModal(true);
                return true;
              }}
              isCreatingClone={createCloneDriveMutation.isPending}
              showExtractModal={modals.showExtractCloneModal}
              selectedClone={modals.selectedClone as Record<string, unknown> | null}
              onCloseExtractModal={() => {
                modals.setShowExtractCloneModal(false);
                modals.setSelectedClone(null);
              }}
              onConfirmExtract={() => {
                if (modals.selectedClone?.id) {
                  extractCloneMutation.mutate({ cloneId: modals.selectedClone.id });
                }
              }}
              isExtracting={extractCloneMutation.isPending}
              onRequestExtract={(clone) => {
                modals.setSelectedClone(clone);
                modals.setShowExtractCloneModal(true);
              }}
              showArchiveModal={modals.showArchiveCloneModal}
              onCloseArchiveModal={() => {
                modals.setShowArchiveCloneModal(false);
                modals.setSelectedClone(null);
              }}
              onConfirmArchive={() => {
                if (modals.selectedClone?.id) {
                  archiveCloneMutation.mutate({ cloneId: modals.selectedClone.id });
                }
              }}
              isArchiving={archiveCloneMutation.isPending}
              onRequestArchive={(clone) => {
                modals.setSelectedClone(clone);
                modals.setShowArchiveCloneModal(true);
              }}
              showSpaceWarningModal={modals.showSpaceWarningModal}
              spaceWarningInfo={modals.spaceWarningInfo}
              onCloseSpaceWarning={() => {
                modals.setShowSpaceWarningModal(false);
                modals.setSpaceWarningInfo(null);
                modals.setPendingCloneCreate(null);
              }}
              onProceedSpaceWarning={handleProceedSpaceWarning}
            />
          )}


          {/* Reports Tab */}
          {activeTab === 'reports' && (
            <CaseReportsTab
              reports={(reports || []).map((r) => {
                const content = (r.content && typeof r.content === 'object' && !Array.isArray(r.content))
                  ? (r.content as Record<string, unknown>)
                  : {};
                const validReportTypes: readonly string[] = ['evaluation', 'service', 'server', 'malware', 'forensic', 'data_destruction', 'prevention'];
                const reportType = (typeof content.report_type === 'string' && validReportTypes.includes(content.report_type) ? content.report_type : 'evaluation') as
                  'evaluation' | 'service' | 'server' | 'malware' | 'forensic' | 'data_destruction' | 'prevention';
                return {
                  id: r.id,
                  title: r.title,
                  report_number: r.report_number ?? '',
                  report_type: reportType,
                  status: (r.status ?? 'draft') as 'draft' | 'review' | 'approved' | 'sent',
                  version_number: typeof content.version_number === 'number' ? content.version_number : 1,
                  visible_to_customer: content.visible_to_customer === true,
                  approved_at: typeof content.approved_at === 'string' ? content.approved_at : null,
                  sent_to_customer_at: typeof content.sent_to_customer_at === 'string' ? content.sent_to_customer_at : null,
                  created_at: r.created_at,
                };
              })}
              reportTypeFilter={modals.reportTypeFilter}
              reportStatusFilter={modals.reportStatusFilter}
              showLatestOnly={modals.showLatestOnly}
              onSetShowReportTypeSelector={modals.setShowReportTypeSelector}
              onSetReportTypeFilter={modals.setReportTypeFilter}
              onSetReportStatusFilter={modals.setReportStatusFilter}
              onSetShowLatestOnly={modals.setShowLatestOnly}
              onSetViewReportId={modals.setViewReportId}
              onSetEditingReport={modals.setEditingReport}
            />
          )}


          {/* Quotes Tab */}
          {activeTab === 'quotes' && (
            <CaseFinancesTab
              caseId={id!}
              quotes={quotes || []}
              invoices={invoices || []}
              caseFinancialSummary={caseFinancialSummary}
              formatCurrency={formatCurrency}
              onSetShowQuoteModal={modals.setShowQuoteModal}
              onSetShowInvoiceModal={modals.setShowInvoiceModal}
              onSetEditingQuote={modals.setEditingQuote}
              onSetEditingInvoice={modals.setEditingInvoice}
              onSetViewingQuote={modals.setViewingQuote}
              onSetViewingInvoice={modals.setViewingInvoice}
              onHandleRecordPayment={handleRecordPayment}
              onHandleIssueInvoice={handleIssueInvoice}
              onSetConvertingInvoice={modals.setConvertingInvoice}
              onSetShowConvertProformaModal={modals.setShowConvertProformaModal}
              quotesService={quotesService}
              invoiceService={invoiceService}
            />
          )}


          {/* Files Tab */}
          {activeTab === 'files' && (
            <CaseFilesTab
              caseId={id!}
              attachments={(attachments || []).map((a) => ({
                id: a.id,
                file_name: a.file_name,
                file_url: a.file_url,
                file_size: a.file_size,
                file_type: a.file_type,
                category: a.category,
                created_at: a.created_at,
              }))}
              uploadedBy={profile?.id || ''}
            />
          )}

          {/* Engineers Tab */}
          {activeTab === 'engineers' && (
            <CaseEngineersTab
              caseId={id!}
              caseEngineers={(caseEngineers || []).map((e) => ({
                id: e.id,
                user_id: e.user_id,
                role_text: e.role_text ?? undefined,
                created_at: e.created_at,
              }))}
            />
          )}

          {/* Recovery & QA Tab */}
          {activeTab === 'recovery_qa' && (
            <CaseRecoveryQaTab caseId={id!} />
          )}

          {/* Notes Tab */}
          {activeTab === 'notes' && (
            <CaseNotesTab
              caseId={id!}
              notes={(notes || []).map((n) => ({
                id: n.id,
                note_text: n.content,
                created_at: n.created_at,
                updated_at: n.updated_at,
                created_by: n.created_by,
                updated_by: n.updated_by,
              }))}
              newNote={modals.newNote}
              onNoteChange={modals.setNewNote}
              onAddNote={handleAddNote}
              isAdding={addNoteMutation.isPending}
              onUpdateNote={async (noteId, content) => {
                await updateNoteMutation.mutateAsync({ noteId, content });
              }}
            />
          )}

          {/* Communications Tab */}
          {activeTab === 'communications' && (
            <CaseCommunicationsTab
              caseId={id!}
              caseNumber={caseData.case_no || caseData.case_number || ''}
              customerId={caseData.customer_id}
              customerName={caseData.customer?.customer_name || 'Customer'}
              customerEmail={caseData.customer?.email ?? undefined}
              customerPhone={caseData.contact?.mobile_number || caseData.customer?.mobile_number || caseData.customer?.phone || ''}
              companyName="Data Recovery"
            />
          )}

          {/* Client Portal Tab */}
          {activeTab === 'portal' && (
            <CasePortalTab
              caseId={id!}
              portalSettings={portalSettings as unknown as React.ComponentProps<typeof CasePortalTab>['portalSettings']}
            />
          )}

          {/* Stock Tab - Backup Devices & Stock Usage */}
          {activeTab === 'stock' && (
            <CaseBackupDevicesTab
              caseId={id!}
              customerId={caseData.customer_id ?? ''}
              companyId={caseData.company_id}
            />
          )}

          {/* History Tab — forensic Chain of Custody ledger + workflow activity log */}
          {activeTab === 'history' && (
            <div>
              <div
                className="mb-4 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5"
                role="group"
                aria-label="History view"
              >
                <button
                  type="button"
                  onClick={() => setHistoryView('custody')}
                  aria-pressed={historyView === 'custody'}
                  className={`min-h-[2.75rem] rounded-md px-4 text-sm font-medium transition-colors duration-150 ${
                    historyView === 'custody'
                      ? 'bg-surface text-primary shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Chain of Custody
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryView('activity')}
                  aria-pressed={historyView === 'activity'}
                  className={`min-h-[2.75rem] rounded-md px-4 text-sm font-medium transition-colors duration-150 ${
                    historyView === 'activity'
                      ? 'bg-surface text-primary shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Case Activity
                </button>
              </div>

              {historyView === 'custody' ? (
                <ChainOfCustodyTab
                  caseId={id!}
                  caseNumber={caseData.case_no ?? ''}
                  caseStatus={caseData.status ?? null}
                  caseDevices={(devices ?? []).map((d) => ({
                    id: d.id,
                    model: d.model ?? null,
                    serial_number: d.serial_number ?? null,
                  }))}
                />
              ) : (
                <CaseActivityTab caseId={id!} />
              )}
            </div>
          )}
        </Suspense>
      )}

    </DetailPageTemplate>
  );
};

export default CaseDetail;
