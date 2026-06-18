import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Building2, Mail, Phone, MapPin, Globe, FileText, Edit, ArrowLeft,
  User, MessageSquare, FileStack, TrendingUp, Package, Activity,
  CheckCircle, Star, DollarSign
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { DataTable, type Column } from '../../components/shared/DataTable';
import SupplierFormModal from '../../components/suppliers/SupplierFormModal';
import CommunicationFormModal from '../../components/suppliers/CommunicationFormModal';
import ContactFormModal from '../../components/suppliers/ContactFormModal';
import DocumentUploadModal from '../../components/suppliers/DocumentUploadModal';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../hooks/useToast';
import { useCurrency } from '../../hooks/useCurrency';
import { format } from 'date-fns';
import { logger } from '../../lib/logger';
import type { Database } from '../../types/database.types';

type TabType = 'overview' | 'contacts' | 'communications' | 'documents' | 'performance' | 'orders' | 'audit';

type SupplierRow = Database['public']['Tables']['suppliers']['Row'];
type SupplierContactRow = Database['public']['Tables']['supplier_contacts']['Row'];
type SupplierCommunicationRow = Database['public']['Tables']['supplier_communications']['Row'];
type SupplierDocumentRow = Database['public']['Tables']['supplier_documents']['Row'];
type SupplierPerformanceMetricRow = Database['public']['Tables']['supplier_performance_metrics']['Row'];
type SupplierAuditTrailRow = Database['public']['Tables']['supplier_audit_trail']['Row'];
type PurchaseOrderRow = Database['public']['Tables']['purchase_orders']['Row'];
type SupplierCategoryRow = Database['public']['Tables']['master_supplier_categories']['Row'];
type SupplierPaymentTermRow = Database['public']['Tables']['master_supplier_payment_terms']['Row'];
type PurchaseOrderStatusRow = Database['public']['Tables']['master_purchase_order_statuses']['Row'];

type SupplierWithRelations = SupplierRow & {
  category: Pick<SupplierCategoryRow, 'name'> | null;
  payment_terms: Pick<SupplierPaymentTermRow, 'name' | 'days'> | null;
};

type PurchaseOrderWithStatus = PurchaseOrderRow & {
  status: Pick<PurchaseOrderStatusRow, 'name' | 'color'> | null;
};

export default function SupplierProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { error: showError } = useToast();
  const [supplier, setSupplier] = useState<SupplierWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCommunicationModal, setShowCommunicationModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [editingContact, setEditingContact] = useState<SupplierContactRow | null>(null);
  const [contacts, setContacts] = useState<SupplierContactRow[]>([]);
  const [communications, setCommunications] = useState<SupplierCommunicationRow[]>([]);
  const [documents, setDocuments] = useState<SupplierDocumentRow[]>([]);
  const [performance, setPerformance] = useState<SupplierPerformanceMetricRow[]>([]);
  const [orders, setOrders] = useState<PurchaseOrderWithStatus[]>([]);
  const [auditTrail, setAuditTrail] = useState<SupplierAuditTrailRow[]>([]);

  useEffect(() => {
    if (id) {
      loadSupplier();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (id) {
      loadTabData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, id]);

  const loadSupplier = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('suppliers')
        .select(`
          *,
          category:master_supplier_categories(name),
          payment_terms:master_supplier_payment_terms(name, days)
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      setSupplier(data as SupplierWithRelations | null);
    } catch (err: unknown) {
      logger.error('Error loading supplier:', err);
      showError(err instanceof Error ? err.message : 'Failed to load supplier');
      navigate('/suppliers');
    } finally {
      setLoading(false);
    }
  };

  const loadTabData = async () => {
    if (!id) return;

    try {
      switch (activeTab) {
        case 'contacts':
          await loadContacts();
          break;
        case 'communications':
          await loadCommunications();
          break;
        case 'documents':
          await loadDocuments();
          break;
        case 'performance':
          await loadPerformance();
          break;
        case 'orders':
          await loadOrders();
          break;
        case 'audit':
          await loadAuditTrail();
          break;
      }
    } catch (err) {
      logger.error('Error loading tab data:', err);
    }
  };

  const loadContacts = async () => {
    if (!id) return;
    const { data } = await supabase
      .from('supplier_contacts')
      .select('*')
      .eq('supplier_id', id)
      .order('is_primary', { ascending: false });
    setContacts(data ?? []);
  };

  const loadCommunications = async () => {
    if (!id) return;
    const { data } = await supabase
      .from('supplier_communications')
      .select('*')
      .eq('supplier_id', id)
      .order('created_at', { ascending: false });
    setCommunications(data ?? []);
  };

  const loadDocuments = async () => {
    if (!id) return;
    const { data } = await supabase
      .from('supplier_documents')
      .select('*')
      .eq('supplier_id', id)
      .order('created_at', { ascending: false });
    setDocuments(data ?? []);
  };

  const loadPerformance = async () => {
    if (!id) return;
    const { data } = await supabase
      .from('supplier_performance_metrics')
      .select('*')
      .eq('supplier_id', id)
      .order('period_end', { ascending: false });
    setPerformance(data ?? []);
  };

  const loadOrders = async () => {
    if (!id) return;
    const { data } = await supabase
      .from('purchase_orders')
      .select('*, status:master_purchase_order_statuses(name, color)')
      .eq('supplier_id', id)
      .order('created_at', { ascending: false });
    setOrders((data ?? []) as PurchaseOrderWithStatus[]);
  };

  const loadAuditTrail = async () => {
    if (!id) return;
    const { data } = await supabase
      .from('supplier_audit_trail')
      .select('*')
      .eq('supplier_id', id)
      .order('created_at', { ascending: false });
    setAuditTrail(data ?? []);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading supplier...</div>
      </div>
    );
  }

  if (!supplier) {
    return null;
  }

  const tabs: { id: TabType; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
    { id: 'overview', label: 'Overview', icon: Building2 },
    { id: 'contacts', label: 'Contacts', icon: User, count: contacts.length },
    { id: 'communications', label: 'Communications', icon: MessageSquare, count: communications.length },
    { id: 'documents', label: 'Documents', icon: FileStack, count: documents.length },
    { id: 'performance', label: 'Performance', icon: TrendingUp },
    { id: 'orders', label: 'Purchase Orders', icon: Package, count: orders.length },
    { id: 'audit', label: 'Audit Trail', icon: Activity, count: auditTrail.length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="secondary" onClick={() => navigate('/suppliers')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{supplier.name}</h1>
              <Badge variant={supplier.is_active ? 'success' : 'default'}>
                {supplier.is_active ? (
                  <>
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Active
                  </>
                ) : 'Inactive'}
              </Badge>
            </div>
            <p className="text-gray-500 mt-1">{supplier.supplier_number ?? ''}</p>
          </div>
        </div>
        <Button onClick={() => setShowEditModal(true)}>
          <Edit className="w-4 h-4 mr-2" />
          Edit Supplier
        </Button>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-1 py-4 border-b-2 font-medium text-sm whitespace-nowrap
                  ${activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                    activeTab === tab.id ? 'bg-info-muted text-info' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mt-6">
        {activeTab === 'overview' && <OverviewTab supplier={supplier} />}
        {activeTab === 'contacts' && (
          <ContactsTab
            contacts={contacts}
            onAdd={() => {
              setEditingContact(null);
              setShowContactModal(true);
            }}
            onEdit={(contact) => {
              setEditingContact(contact);
              setShowContactModal(true);
            }}
          />
        )}
        {activeTab === 'communications' && (
          <CommunicationsTab
            communications={communications}
            onAdd={() => setShowCommunicationModal(true)}
          />
        )}
        {activeTab === 'documents' && (
          <DocumentsTab
            documents={documents}
            onAdd={() => setShowDocumentModal(true)}
          />
        )}
        {activeTab === 'performance' && <PerformanceTab supplier={supplier} performance={performance} />}
        {activeTab === 'orders' && <OrdersTab orders={orders} supplierId={id ?? ''} />}
        {activeTab === 'audit' && <AuditTab auditTrail={auditTrail} />}
      </div>

      {showEditModal && (
        <SupplierFormModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            loadSupplier();
            setShowEditModal(false);
          }}
          supplier={{
            id: supplier.id,
            name: supplier.name,
            supplier_number: supplier.supplier_number ?? undefined,
            email: supplier.email ?? undefined,
            phone: supplier.phone ?? undefined,
            address: supplier.address ?? undefined,
            website: supplier.website ?? undefined,
            category_id: supplier.category_id ?? undefined,
            payment_terms_id: supplier.payment_terms_id ?? undefined,
            is_active: supplier.is_active ?? undefined,
            // Map DB columns -> the modal's form-field prop names so the edit form
            // loads these instead of blanking them (the modal's save maps back).
            tax_id: supplier.tax_number ?? undefined,
            description: supplier.notes ?? undefined,
            primary_contact_name: supplier.contact_person ?? undefined,
            primary_contact_email: supplier.contact_email ?? undefined,
            primary_contact_phone: supplier.contact_phone ?? undefined,
          }}
        />
      )}

      {showCommunicationModal && id && (
        <CommunicationFormModal
          isOpen={showCommunicationModal}
          onClose={() => setShowCommunicationModal(false)}
          onSuccess={() => {
            loadCommunications();
            setShowCommunicationModal(false);
          }}
          supplierId={id}
        />
      )}

      {showContactModal && id && (
        <ContactFormModal
          isOpen={showContactModal}
          onClose={() => {
            setShowContactModal(false);
            setEditingContact(null);
          }}
          onSuccess={() => {
            loadContacts();
            setShowContactModal(false);
            setEditingContact(null);
          }}
          supplierId={id}
          contact={editingContact ? {
            id: editingContact.id,
            name: editingContact.name,
            title: editingContact.title ?? undefined,
            email: editingContact.email ?? undefined,
            phone: editingContact.phone ?? undefined,
            mobile: editingContact.mobile ?? undefined,
            notes: editingContact.notes ?? undefined,
            is_primary: editingContact.is_primary ?? undefined,
          } : null}
        />
      )}

      {showDocumentModal && id && (
        <DocumentUploadModal
          isOpen={showDocumentModal}
          onClose={() => setShowDocumentModal(false)}
          onSuccess={() => {
            loadDocuments();
            setShowDocumentModal(false);
          }}
          supplierId={id}
        />
      )}
    </div>
  );
}

function OverviewTab({ supplier }: { supplier: SupplierWithRelations }) {
  const { formatCurrency } = useCurrency();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Company Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-500">Category</label>
                <p className="font-medium">{supplier.category?.name ?? '-'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Payment Terms</label>
                <p className="font-medium">{supplier.payment_terms?.name ?? '-'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Tax Number / VAT</label>
                <p className="font-medium">{supplier.tax_number ?? '-'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Website</label>
                {supplier.website ? (
                  <a href={supplier.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    <Globe className="inline w-4 h-4 mr-1" />
                    Visit Website
                  </a>
                ) : (
                  <p className="font-medium">-</p>
                )}
              </div>
              <div>
                <label className="text-sm text-gray-500">Registration Number</label>
                <p className="font-medium">{supplier.registration_number ?? '-'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Rating</label>
                <p className="font-medium">{supplier.rating != null ? `${supplier.rating}/5` : '-'}</p>
              </div>
            </div>
            {supplier.notes && (
              <div className="mt-4">
                <label className="text-sm text-gray-500">Notes</label>
                <p className="mt-1 text-gray-700">{supplier.notes}</p>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <label className="text-sm text-gray-500">Email</label>
                  <p className="font-medium">{supplier.email ?? '-'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <label className="text-sm text-gray-500">Phone</label>
                  <p className="font-medium">{supplier.phone ?? '-'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <label className="text-sm text-gray-500">Address</label>
                  <p className="font-medium">{supplier.address ?? '-'}</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {(supplier.contact_person || supplier.contact_email) && (
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Primary Contact</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-500">Name</label>
                  <p className="font-medium">{supplier.contact_person ?? '-'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Email</label>
                  <p className="font-medium">{supplier.contact_email ?? '-'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Phone</label>
                  <p className="font-medium">{supplier.contact_phone ?? '-'}</p>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      <div className="space-y-6">
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-500">Credit Limit</label>
                <p className="font-medium">{supplier.credit_limit != null ? formatCurrency(supplier.credit_limit) : '-'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Outstanding Balance</label>
                <p className="font-medium">{supplier.outstanding_balance != null ? formatCurrency(supplier.outstanding_balance) : '-'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Bank</label>
                <p className="font-medium">{supplier.bank_name ?? '-'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Account</label>
                <p className="font-medium">{supplier.bank_account ?? '-'}</p>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Info</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-500">Created</label>
                <p className="font-medium">{format(new Date(supplier.created_at), 'MMM dd, yyyy')}</p>
              </div>
              {supplier.updated_at && (
                <div>
                  <label className="text-sm text-gray-500">Last Updated</label>
                  <p className="font-medium">{format(new Date(supplier.updated_at), 'MMM dd, yyyy')}</p>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ContactsTab({
  contacts,
  onAdd,
  onEdit,
}: {
  contacts: SupplierContactRow[];
  onAdd: () => void;
  onEdit: (contact: SupplierContactRow) => void;
}) {
  return (
    <Card>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Contacts</h3>
          <Button size="sm" onClick={onAdd}>
            <User className="w-4 h-4 mr-2" />
            Add Contact
          </Button>
        </div>
        {contacts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No contacts added yet
          </div>
        ) : (
          <div className="space-y-4">
            {contacts.map((contact) => (
              <div key={contact.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-gray-900">{contact.name}</h4>
                      {contact.is_primary && (
                        <Badge variant="info" size="sm">Primary</Badge>
                      )}
                    </div>
                    {contact.title && (
                      <p className="text-sm text-gray-600 mt-1">{contact.title}</p>
                    )}
                    <div className="mt-3 space-y-1">
                      {contact.email && (
                        <p className="text-sm text-gray-600">
                          <Mail className="inline w-4 h-4 mr-1" />
                          {contact.email}
                        </p>
                      )}
                      {contact.phone && (
                        <p className="text-sm text-gray-600">
                          <Phone className="inline w-4 h-4 mr-1" />
                          {contact.phone}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(contact)}
                    aria-label={`Edit ${contact.name}`}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function CommunicationsTab({
  communications,
  onAdd,
}: {
  communications: SupplierCommunicationRow[];
  onAdd: () => void;
}) {
  return (
    <Card>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Communications</h3>
          <Button size="sm" onClick={onAdd}>
            <MessageSquare className="w-4 h-4 mr-2" />
            Add Communication
          </Button>
        </div>
        {communications.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No communications logged yet
          </div>
        ) : (
          <div className="space-y-4">
            {communications.map((comm) => (
              <div key={comm.id} className="border-l-4 border-primary bg-gray-50 p-4 rounded">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={comm.type === 'email' ? 'info' : comm.type === 'phone' ? 'warning' : 'default'}>
                        {comm.type}
                      </Badge>
                      <span className="text-sm text-gray-500">{format(new Date(comm.created_at), 'MMM dd, yyyy HH:mm')}</span>
                    </div>
                    {comm.subject && (
                      <h4 className="font-semibold text-gray-900 mt-2">{comm.subject}</h4>
                    )}
                    {comm.content && (
                      <p className="text-sm text-gray-600 mt-1">{comm.content}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function DocumentsTab({
  documents,
  onAdd,
}: {
  documents: SupplierDocumentRow[];
  onAdd: () => void;
}) {
  return (
    <Card>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Documents</h3>
          <Button size="sm" onClick={onAdd}>
            <FileStack className="w-4 h-4 mr-2" />
            Upload Document
          </Button>
        </div>
        {documents.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No documents uploaded yet
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.map((doc) => (
              <div key={doc.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <FileText className="w-8 h-8 text-primary" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 truncate">{doc.name}</h4>
                    {doc.file_type && (
                      <p className="text-sm text-gray-500 mt-1">{doc.file_type}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Uploaded {format(new Date(doc.created_at), 'MMM dd, yyyy')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function PerformanceTab({ supplier, performance }: { supplier: SupplierWithRelations; performance: SupplierPerformanceMetricRow[] }) {
  const { formatCurrency } = useCurrency();
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="p-4">
            <div className="flex items-center gap-2 text-gray-600 mb-2">
              <TrendingUp className="w-4 h-4" />
              <span className="text-sm">Rating</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{supplier.rating != null ? `${supplier.rating}/5` : '-'}</div>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <div className="flex items-center gap-2 text-gray-600 mb-2">
              <Star className="w-4 h-4" />
              <span className="text-sm">Metrics Tracked</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{performance.length}</div>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <div className="flex items-center gap-2 text-gray-600 mb-2">
              <DollarSign className="w-4 h-4" />
              <span className="text-sm">Credit Limit</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{supplier.credit_limit != null ? formatCurrency(supplier.credit_limit) : '-'}</div>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <div className="flex items-center gap-2 text-gray-600 mb-2">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm">Outstanding</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{supplier.outstanding_balance != null ? formatCurrency(supplier.outstanding_balance) : '-'}</div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance History</h3>
          {performance.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No performance evaluations recorded yet
            </div>
          ) : (
            <div className="space-y-4">
              {performance.map((perf) => (
                <div key={perf.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">
                      {perf.period_end ? format(new Date(perf.period_end), 'MMM dd, yyyy') : '-'}
                    </span>
                    <Badge variant="info">{perf.metric_type}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Value:</span>
                      <span className="ml-1 font-medium">{perf.value ?? '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Period Start:</span>
                      <span className="ml-1 font-medium">
                        {perf.period_start ? format(new Date(perf.period_start), 'MMM dd, yyyy') : '-'}
                      </span>
                    </div>
                  </div>
                  {perf.notes && (
                    <p className="text-sm text-gray-600 mt-2">{perf.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function OrdersTab({ orders, supplierId }: { orders: PurchaseOrderWithStatus[]; supplierId: string }) {
  const navigate = useNavigate();
  const { formatCurrency } = useCurrency();

  const columns: Column<PurchaseOrderWithStatus>[] = [
    {
      key: 'po_number',
      header: 'PO Number',
      render: (order) => (
        <button
          onClick={() => navigate(`/purchase-orders/${order.id}`)}
          className="text-primary hover:text-primary/80 font-medium"
        >
          {order.po_number ?? '-'}
        </button>
      ),
    },
    {
      key: 'order_date',
      header: 'Order Date',
      render: (order) => order.order_date ? format(new Date(order.order_date), 'MMM dd, yyyy') : '-',
    },
    {
      key: 'expected_delivery_date',
      header: 'Expected Delivery',
      render: (order) => order.expected_delivery_date ? format(new Date(order.expected_delivery_date), 'MMM dd, yyyy') : '-',
    },
    {
      key: 'total_amount',
      header: 'Amount',
      render: (order) => formatCurrency(order.total_amount ?? 0),
    },
    {
      key: 'status',
      header: 'Status',
      render: (order) => (
        <Badge variant="custom" color={order.status?.color ?? '#3b82f6'}>
          {order.status?.name ?? 'Unknown'}
        </Badge>
      ),
    },
  ];

  return (
    <Card>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Purchase Orders</h3>
          <Button size="sm" onClick={() => navigate('/purchase-orders/new', { state: { supplierId } })}>
            <Package className="w-4 h-4 mr-2" />
            Create PO
          </Button>
        </div>
        {orders.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No purchase orders yet
          </div>
        ) : (
          <DataTable columns={columns} data={orders} />
        )}
      </div>
    </Card>
  );
}

function AuditTab({ auditTrail }: { auditTrail: SupplierAuditTrailRow[] }) {
  return (
    <Card>
      <div className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Audit Trail</h3>
        {auditTrail.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No audit records found
          </div>
        ) : (
          <div className="space-y-3">
            {auditTrail.map((audit) => (
              <div key={audit.id} className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
                <Activity className="w-5 h-5 text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{audit.action}</span>
                    <span className="text-sm text-gray-500">
                      {format(new Date(audit.created_at), 'MMM dd, yyyy HH:mm')}
                    </span>
                  </div>
                  {audit.details != null && (
                    <pre className="text-xs text-gray-600 mt-1 whitespace-pre-wrap font-sans">
                      {typeof audit.details === 'string' ? audit.details : JSON.stringify(audit.details, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
