import { useState } from 'react';
import type { DocumentType } from '@/lib/pdf/types';
import type { CreateCloneDriveFormValues } from '../CreateCloneDriveModal';

export function useCaseModals() {
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [viewCloneModal, setViewCloneModal] = useState<any>(null);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [showMarkAsDeliveredModal, setShowMarkAsDeliveredModal] = useState(false);
  const [showPreserveLongTermModal, setShowPreserveLongTermModal] = useState(false);
  const [showCreateCloneModal, setShowCreateCloneModal] = useState(false);
  const [showExtractCloneModal, setShowExtractCloneModal] = useState(false);
  const [showArchiveCloneModal, setShowArchiveCloneModal] = useState(false);
  const [showSpaceWarningModal, setShowSpaceWarningModal] = useState(false);
  const [spaceWarningInfo, setSpaceWarningInfo] = useState<{
    cloneLabel: string;
    totalCapacity: number;
    currentUsed: number;
    availableSpace: number;
    requiredSpace: number;
  } | null>(null);
  const [pendingCloneCreate, setPendingCloneCreate] = useState<CreateCloneDriveFormValues | null>(null);
  const [selectedClone, setSelectedClone] = useState<any>(null);
  const [editingDevice, setEditingDevice] = useState<any>(null);
  const [newNote, setNewNote] = useState('');
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [viewingQuote, setViewingQuote] = useState<any>(null);
  const [viewingInvoice, setViewingInvoice] = useState<any>(null);
  const [editingQuote, setEditingQuote] = useState<any>(null);
  const [editingInvoice, setEditingInvoice] = useState<any>(null);
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<any>(null);
  const [showConvertProformaModal, setShowConvertProformaModal] = useState(false);
  const [convertingInvoice, setConvertingInvoice] = useState<any>(null);
  const [showPDFPreviewModal, setShowPDFPreviewModal] = useState(false);
  const [previewDocumentType, setPreviewDocumentType] = useState<DocumentType | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailPdfBlob, setEmailPdfBlob] = useState<Blob | null>(null);
  const [emailPdfFilename, setEmailPdfFilename] = useState<string>('');
  const [showDocTypeSelector, setShowDocTypeSelector] = useState(false);
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [viewDocumentId, setViewDocumentId] = useState<string | null>(null);
  const [docCreateSubtype, setDocCreateSubtype] = useState<string | null>(null);

  return {
    showCheckoutModal, setShowCheckoutModal,
    showDuplicateModal, setShowDuplicateModal,
    showDeleteModal, setShowDeleteModal,
    viewCloneModal, setViewCloneModal,
    showDeviceModal, setShowDeviceModal,
    showMarkAsDeliveredModal, setShowMarkAsDeliveredModal,
    showPreserveLongTermModal, setShowPreserveLongTermModal,
    showCreateCloneModal, setShowCreateCloneModal,
    showExtractCloneModal, setShowExtractCloneModal,
    showArchiveCloneModal, setShowArchiveCloneModal,
    showSpaceWarningModal, setShowSpaceWarningModal,
    spaceWarningInfo, setSpaceWarningInfo,
    pendingCloneCreate, setPendingCloneCreate,
    selectedClone, setSelectedClone,
    editingDevice, setEditingDevice,
    newNote, setNewNote,
    showQuoteModal, setShowQuoteModal,
    showInvoiceModal, setShowInvoiceModal,
    viewingQuote, setViewingQuote,
    viewingInvoice, setViewingInvoice,
    editingQuote, setEditingQuote,
    editingInvoice, setEditingInvoice,
    showRecordPaymentModal, setShowRecordPaymentModal,
    selectedInvoiceForPayment, setSelectedInvoiceForPayment,
    showConvertProformaModal, setShowConvertProformaModal,
    convertingInvoice, setConvertingInvoice,
    showPDFPreviewModal, setShowPDFPreviewModal,
    previewDocumentType, setPreviewDocumentType,
    showEmailModal, setShowEmailModal,
    emailPdfBlob, setEmailPdfBlob,
    emailPdfFilename, setEmailPdfFilename,
    showDocTypeSelector, setShowDocTypeSelector,
    editingDocumentId, setEditingDocumentId,
    viewDocumentId, setViewDocumentId,
    docCreateSubtype, setDocCreateSubtype,
  };
}
