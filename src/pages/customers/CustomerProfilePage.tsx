import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { CustomerAvatar } from '../../components/ui/CustomerAvatar';
import { ImageUpload } from '../../components/ui/ImageUpload';
import {
  User, Mail, Phone, MapPin, Building2, Camera,
  Calendar, FileText, DollarSign, MessageSquare, MessageCircle, Eye, Link as LinkIcon,
  Copy, RefreshCw, Ban, Check, AlertTriangle, ShoppingBag, Activity
} from 'lucide-react';
import { formatDate } from '../../lib/format';
import { useProfileNames } from '../../hooks/useProfileNames';
import { AuditInfo } from '../../components/ui/AuditInfo';
import { uploadCustomerProfilePhoto, deleteCustomerProfilePhoto } from '../../lib/fileStorageService';
import { generatePortalLoginUrl, generateCustomerPortalCredentialsText } from '../../lib/portalUrlService';
import { generateSecurePassword } from '../../lib/passwordUtils';
import { ManageCompaniesModal } from '../../components/customers/ManageCompaniesModal';
import { CustomerFormModal, type CustomerEditData } from '../../components/customers/CustomerFormModal';
import { useAuth } from '../../contexts/AuthContext';
import { CustomerPurchasesTab } from '../../components/customers/CustomerPurchasesTab';
import { CustomerCasesTab } from '../../components/customers/CustomerCasesTab';
import { CustomerFinancialTab } from '../../components/customers/CustomerFinancialTab';
import { CustomerTimelineTab } from '../../components/customers/CustomerTimelineTab';
import { EmailDocumentModal } from '../../components/cases/EmailDocumentModal';
import { SendMessageModal } from '../../components/communications/SendMessageModal';
import { useConfirm } from '../../hooks/useConfirm';
import { DetailPageTemplate } from '../../components/templates/DetailPageTemplate';
import { DetailPageSkeleton } from '../../components/templates/DetailPageSkeleton';
import { DetailPageNotFound } from '../../components/templates/DetailPageNotFound';

type TabId = 'overview' | 'cases' | 'financial' | 'communications' | 'purchases' | 'timeline';

interface Customer {
  id: string;
  customer_number: string | null;
  customer_name: string;
  email: string | null;
  mobile_number: string | null;
  phone: string | null;
  customer_group_id: string | null;
  country_id: string | null;
  city_id: string | null;
  address: string | null;
  portal_enabled: boolean | null;
  portal_last_login: string | null;
  profile_photo_url: string | null;
  notes: string | null;
  is_active: boolean | null;
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
  customer_groups: { id: string; name: string } | null;
  geo_countries: { id: string; name: string } | null;
  geo_cities: { id: string; name: string } | null;
}

interface CompanyRelationship {
  id: string;
  is_primary: boolean | null;
  role: string | null;
  companies: {
    id: string;
    company_number: string | null;
    company_name: string | null;
    name: string;
  } | null;
}

interface Communication {
  id: string;
  type: string;
  subject: string | null;
  content: string | null;
  direction: string | null;
  created_at: string;
  sent_by: string | null;
}

export const CustomerProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [showGeneratePasswordModal, setShowGeneratePasswordModal] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [copiedCredentials, setCopiedCredentials] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [portalLoginUrl, setPortalLoginUrl] = useState<string>('');
  const [showComposeEmail, setShowComposeEmail] = useState(false);
  const [composeMessageChannel, setComposeMessageChannel] = useState<'whatsapp' | 'sms' | null>(null);
  const [showManageCompanies, setShowManageCompanies] = useState(false);
  const { profile } = useAuth();
  // Relationship management is a controlled operation: manager and above.
  const canManageCompanies = ['owner', 'admin', 'manager'].includes(profile?.role ?? '');

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: async () => {
      if (!id) throw new Error('Missing customer ID');
      const { data, error } = await supabase
        .from('customers_enhanced')
        .select(`
          *,
          customer_groups (id, name),
          geo_countries (id, name),
          geo_cities (id, name)
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as Customer | null;
    },
    enabled: !!id,
  });
  const { nameOf } = useProfileNames([customer?.created_by, customer?.updated_by]);

  const { data: companies = [] } = useQuery({
    queryKey: ['customer_companies', id],
    queryFn: async () => {
      if (!id) throw new Error('Missing customer ID');
      const { data, error } = await supabase
        .from('customer_company_relationships')
        .select(`
          *,
          companies (id, company_number, company_name, name)
        `)
        .eq('customer_id', id)
        .is('deleted_at', null)
        .order('is_primary', { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as CompanyRelationship[];
    },
    enabled: !!id,
  });

  const { data: communications = [] } = useQuery({
    queryKey: ['customer_communications', id],
    queryFn: async () => {
      if (!id) throw new Error('Missing customer ID');
      const { data, error } = await supabase
        .from('customer_communications')
        .select('id, type, subject, content, direction, created_at, sent_by')
        .eq('customer_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as Communication[];
    },
    enabled: !!id,
  });

  React.useEffect(() => {
    const loadPortalUrl = async () => {
      const url = await generatePortalLoginUrl();
      setPortalLoginUrl(url);
    };
    loadPortalUrl();
  }, []);

  // Photo upload is its own action now (triggered from the avatar), separate
  // from editing the customer's fields (handled by the shared CustomerFormModal).
  const savePhotoMutation = useMutation({
    mutationFn: async () => {
      if (!id || !photoFile) throw new Error('No photo selected');
      setUploadingPhoto(true);
      try {
        const uploadResult = await uploadCustomerProfilePhoto(photoFile, id);
        if (!uploadResult.success || !uploadResult.publicUrl) {
          throw new Error(uploadResult.error || 'Failed to upload photo');
        }
        if (customer?.profile_photo_url) {
          const oldPath = customer.profile_photo_url.split('/').slice(-2).join('/');
          await deleteCustomerProfilePhoto(oldPath);
        }
        const { error } = await supabase
          .from('customers_enhanced')
          .update({ profile_photo_url: uploadResult.publicUrl })
          .eq('id', id);
        if (error) throw error;
      } finally {
        setUploadingPhoto(false);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
      queryClient.invalidateQueries({ queryKey: ['customers_enhanced'] });
      setIsPhotoModalOpen(false);
      setPhotoFile(null);
      setPhotoPreviewUrl(null);
    },
  });

  const openPhotoModal = () => {
    setPhotoFile(null);
    setPhotoPreviewUrl(customer?.profile_photo_url ?? null);
    setIsPhotoModalOpen(true);
  };

  const generatePasswordMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('Missing customer ID');

      const newPassword = generateSecurePassword(12);

      const { error } = await supabase.rpc('set_portal_password', {
        p_customer_id: id,
        p_new_password: newPassword,
      });

      if (error) throw error;
      return { password: newPassword };
    },
    onSuccess: (data) => {
      setGeneratedPassword(data.password);
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
    },
  });

  const disablePortalAccessMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('Missing customer ID');

      const { error } = await supabase.rpc('disable_customer_portal_access', {
        p_customer_id: id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
    },
  });

  const handleCopyEmail = async (email: string) => {
    await navigator.clipboard.writeText(email);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const handleCopyPassword = async (password: string) => {
    await navigator.clipboard.writeText(password);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2000);
  };

  const handleCopyCredentials = async (email: string, password: string) => {
    const credentials = await generateCustomerPortalCredentialsText(email, password);
    await navigator.clipboard.writeText(credentials);
    setCopiedCredentials(true);
    setTimeout(() => setCopiedCredentials(false), 2000);
  };

  const handleGeneratePassword = () => {
    setShowGeneratePasswordModal(true);
    generatePasswordMutation.mutate();
  };

  const handleDisablePortalAccess = async () => {
    const ok = await confirm({
      title: 'Disable Portal Access',
      message: 'Are you sure you want to disable portal access for this customer? They will no longer be able to log in.',
      confirmLabel: 'Disable Access',
      tone: 'danger',
    });
    if (!ok) return;
    disablePortalAccessMutation.mutate();
  };

  if (isLoading) {
    return <DetailPageSkeleton />;
  }

  if (!customer) {
    return <DetailPageNotFound backTo={{ to: '/customers', label: 'Back to Customers' }} />;
  }


  const getCommunicationIcon = (type: string) => {
    switch (type) {
      case 'email':
        return <Mail className="w-4 h-4" />;
      case 'phone':
        return <Phone className="w-4 h-4" />;
      case 'meeting':
        return <Calendar className="w-4 h-4" />;
      default:
        return <MessageSquare className="w-4 h-4" />;
    }
  };

  const getCommunicationColor = (type: string) => {
    switch (type) {
      case 'email':
        return '#3b82f6';
      case 'phone':
        return '#10b981';
      case 'meeting':
        return 'rgb(var(--color-cat-7))';
      case 'sms':
        return '#f59e0b';
      default:
        return '#64748b';
    }
  };

  return (
    <DetailPageTemplate
      header={{
        breadcrumbs: [
          { label: 'Customers', to: '/customers' },
          { label: customer.customer_name },
        ],
        badges: (
          <>
            <Badge variant="custom" color="rgb(var(--color-primary))">
              {customer.customer_number}
            </Badge>
            {customer.portal_enabled && (
              <Badge variant="success">Portal Active</Badge>
            )}
            {!customer.is_active && <Badge variant="default">Inactive</Badge>}
          </>
        ),
        actions: (
          <Button variant="secondary" size="sm" onClick={() => setIsEditModalOpen(true)}>
            Edit Profile
          </Button>
        ),
        meta: (
          <AuditInfo
            createdAt={customer.created_at}
            createdLabel="Joined"
            createdByName={nameOf(customer.created_by)}
            updatedAt={customer.updated_at}
            updatedByName={nameOf(customer.updated_by)}
          />
        ),
      }}
      outside={
        <>
          <Modal
            isOpen={showGeneratePasswordModal}
            onClose={() => {
              setShowGeneratePasswordModal(false);
              setGeneratedPassword(null);
            }}
            title="Portal Password Generated"
          >
            <div className="space-y-4">
              {generatePasswordMutation.isPending ? (
                <div className="text-center py-8">
                  <div className="inline-block w-12 h-12 border-4 border-slate-200 border-t-primary rounded-full animate-spin mb-4"></div>
                  <p className="text-slate-600">Generating secure password...</p>
                </div>
              ) : generatedPassword ? (
                <>
                  <div className="flex items-start gap-3 p-4 bg-success-muted border border-success/20 rounded-lg">
                    <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-success">
                      <p className="font-semibold mb-1">Password Generated Successfully</p>
                      <p>
                        A new password has been generated. Please copy and share it with the customer securely.
                        This password will only be shown once.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-2">
                        Email Address
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 px-4 py-3 bg-slate-50 rounded-lg text-sm font-mono text-slate-900 border border-slate-200">
                          {customer?.email}
                        </div>
                        <button
                          onClick={() => customer?.email && handleCopyEmail(customer.email)}
                          className="p-3 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                          title="Copy email"
                        >
                          {copiedEmail ? (
                            <Check className="w-5 h-5 text-success" />
                          ) : (
                            <Copy className="w-5 h-5 text-slate-600" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-2">
                        Generated Password
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 px-4 py-3 bg-warning-muted rounded-lg text-lg font-mono font-bold text-slate-900 border-2 border-warning/40 tracking-wider">
                          {generatedPassword}
                        </div>
                        <button
                          onClick={() => handleCopyPassword(generatedPassword)}
                          className="p-3 bg-warning-muted hover:bg-warning/20 rounded-lg transition-colors"
                          title="Copy password"
                        >
                          {copiedPassword ? (
                            <Check className="w-5 h-5 text-success" />
                          ) : (
                            <Copy className="w-5 h-5 text-warning" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-2">
                        Portal Login URL
                      </label>
                      <div className="px-4 py-3 bg-slate-50 rounded-lg text-sm font-mono text-slate-700 border border-slate-200">
                        {portalLoginUrl}
                      </div>
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => {
                      if (customer?.email && generatedPassword) {
                        handleCopyCredentials(customer.email, generatedPassword);
                      }
                    }}
                  >
                    {copiedCredentials ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Copied to Clipboard!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy All Credentials
                      </>
                    )}
                  </Button>

                  <div className="text-xs text-slate-500 text-center pt-3 border-t">
                    <p>You can now share these credentials with the customer via WhatsApp, email, or SMS.</p>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <AlertTriangle className="w-12 h-12 text-danger mx-auto mb-4" />
                  <p className="text-slate-600">Failed to generate password. Please try again.</p>
                </div>
              )}
            </div>
          </Modal>

          {/* Edit uses the SAME shared modal as Add (1:1) — company links and
              the photo are handled by their own UIs (Manage Companies / the
              avatar photo modal below). */}
          <CustomerFormModal
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            customer={{
              id: customer.id,
              customer_name: customer.customer_name,
              email: customer.email,
              mobile_number: customer.mobile_number,
              phone: customer.phone,
              customer_group_id: customer.customer_group_id,
              country_id: customer.country_id,
              city_id: customer.city_id,
              address: customer.address,
              address_line1: (customer as { address_line1?: string | null }).address_line1 ?? null,
              address_line2: (customer as { address_line2?: string | null }).address_line2 ?? null,
              subdivision_id: (customer as { subdivision_id?: string | null }).subdivision_id ?? null,
              postal_code: (customer as { postal_code?: string | null }).postal_code ?? null,
              portal_enabled: customer.portal_enabled,
              notes: customer.notes,
              metadata: (customer as { metadata?: Record<string, unknown> | null }).metadata ?? null,
            } satisfies CustomerEditData}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['customer', id] });
            }}
          />

          {/* Avatar-triggered photo upload — replaces the old in-form uploader. */}
          <Modal
            isOpen={isPhotoModalOpen}
            onClose={() => setIsPhotoModalOpen(false)}
            title="Profile Photo"
            subtitle="Upload or update this customer's photo."
            icon={Camera}
            titleSize="sm"
            size="sm"
            showClose
          >
            <div className="space-y-4">
              <ImageUpload
                label="Profile Photo"
                description="Upload a profile photo for this customer"
                value={photoPreviewUrl || undefined}
                onChange={(file, previewUrl) => {
                  setPhotoFile(file);
                  setPhotoPreviewUrl(previewUrl);
                }}
                maxSizeMB={5}
                bucketName="company-assets"
                className="compact-upload"
                enableCrop={true}
                cropAspectRatio={1}
                cropShape="round"
              />
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <Button type="button" variant="secondary" size="sm" onClick={() => setIsPhotoModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => savePhotoMutation.mutate()}
                  disabled={!photoFile || uploadingPhoto}
                >
                  {uploadingPhoto ? 'Uploading…' : 'Save Photo'}
                </Button>
              </div>
            </div>
          </Modal>

          {showComposeEmail && id && (
            <EmailDocumentModal
              isOpen={showComposeEmail}
              onClose={() => {
                setShowComposeEmail(false);
                queryClient.invalidateQueries({ queryKey: ['customer_communications', id] });
              }}
              customerId={id}
              customerName={customer.customer_name}
              customerEmail={customer.email ?? undefined}
              companyName="Data Recovery"
            />
          )}

          {composeMessageChannel && id && (
            <SendMessageModal
              isOpen={!!composeMessageChannel}
              onClose={() => setComposeMessageChannel(null)}
              channel={composeMessageChannel}
              customerId={id}
              defaultPhone={customer.mobile_number || customer.phone || ''}
              contextRefs={{ customerId: id }}
              onLogged={() =>
                queryClient.invalidateQueries({ queryKey: ['customer_communications', id] })
              }
            />
          )}
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-4">
            <div className="flex items-start gap-6">
              <CustomerAvatar
                firstName={customer.customer_name}
                lastName=""
                photoUrl={customer.profile_photo_url}
                size="xl"
                clickable
                onClick={openPhotoModal}
              />
              <div className="flex-1">
                {customer.customer_groups && (
                  <div className="flex items-center gap-2 mb-4">
                    <Badge variant="accent">
                      {customer.customer_groups.name}
                    </Badge>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {customer.email && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Mail className="w-4 h-4 text-slate-400" />
                      <a href={`mailto:${customer.email}`} className="hover:text-primary">
                        {customer.email}
                      </a>
                    </div>
                  )}
                  {customer.mobile_number && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Phone className="w-4 h-4 text-slate-400" />
                      <a href={`tel:${customer.mobile_number}`} className="hover:text-primary">
                        {customer.mobile_number}
                      </a>
                    </div>
                  )}
                  {(customer.geo_cities?.name || customer.geo_countries?.name) && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <MapPin className="w-4 h-4 text-slate-400" />
                      <span>{[customer.geo_cities?.name, customer.geo_countries?.name].filter(Boolean).join(', ')}</span>
                    </div>
                  )}
                </div>

                {customer.address && (
                  <div className="mt-3 text-sm text-slate-600">
                    <p>{customer.address}</p>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {(companies.length > 0 || canManageCompanies) && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Associated Companies
                </h3>
                {canManageCompanies && (
                  <Button size="sm" variant="secondary" onClick={() => setShowManageCompanies(true)}>
                    Manage
                  </Button>
                )}
              </div>
              {companies.length === 0 && (
                <p className="text-sm text-slate-500">No companies linked yet.</p>
              )}
              <div className="space-y-3">
                {companies.map((rel) => {
                  if (!rel.companies) return null;
                  const company = rel.companies;
                  const displayName = company.company_name || company.name;
                  return (
                    <div
                      key={rel.id}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-primary/40 cursor-pointer transition-all"
                      onClick={() => navigate(`/companies/${company.id}`)}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cat-7/70 to-cat-7 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                          {displayName.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900 text-sm truncate">{displayName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {company.company_number && (
                              <span className="text-xs text-slate-500">{company.company_number}</span>
                            )}
                            {rel.is_primary && (
                              <Badge variant="success" size="sm">
                                Primary
                              </Badge>
                            )}
                          </div>
                          {rel.role && (
                            <p className="text-xs text-slate-600 mt-0.5 truncate">{rel.role}</p>
                          )}
                        </div>
                      </div>
                      <Eye className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {showManageCompanies && id && customer && (
            <ManageCompaniesModal
              isOpen={showManageCompanies}
              onClose={() => setShowManageCompanies(false)}
              customerId={id}
              customerName={customer.customer_name}
            />
          )}
        </div>

        <Card className="p-4 h-fit">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">
            Customer Portal
          </h3>

          {customer.portal_enabled && customer.email ? (
            <div className="space-y-4">
              <div className="p-4 bg-success-muted rounded-xl border-2 border-success/30">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-success animate-pulse"></div>
                    <span className="text-xs font-semibold text-success uppercase">Active</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1">Email</label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 px-3 py-2 bg-white/80 rounded-lg text-sm font-mono text-slate-900 break-all">
                        {customer.email}
                      </div>
                      <button
                        onClick={() => customer.email && handleCopyEmail(customer.email)}
                        className="p-2 hover:bg-white/60 rounded-lg transition-colors flex-shrink-0"
                        title="Copy email"
                      >
                        {copiedEmail ? (
                          <Check className="w-4 h-4 text-success" />
                        ) : (
                          <Copy className="w-4 h-4 text-slate-600" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1">Portal URL</label>
                    <div className="px-3 py-2 bg-white/80 rounded-lg text-xs font-mono text-slate-700 break-all">
                      {portalLoginUrl}
                    </div>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full mt-3"
                  onClick={() => {
                    if (customer.email) {
                      handleCopyCredentials(customer.email, '********');
                    }
                  }}
                >
                  {copiedCredentials ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Credentials Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Login Details
                    </>
                  )}
                </Button>
              </div>

              <div className="space-y-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-start text-sm"
                  onClick={handleGeneratePassword}
                  disabled={generatePasswordMutation.isPending}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Generate New Password
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-start text-sm text-danger hover:bg-danger-muted"
                  onClick={handleDisablePortalAccess}
                  disabled={disablePortalAccessMutation.isPending}
                >
                  <Ban className="w-4 h-4 mr-2" />
                  Disable Portal Access
                </Button>
              </div>

              <div className="pt-4 border-t border-slate-200 space-y-2 text-xs">
                {customer.portal_last_login && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Last Login:</span>
                    <span className="text-slate-700 font-medium">
                      {formatDate(customer.portal_last_login)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <LinkIcon className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-sm text-slate-600 mb-4">Portal access is currently disabled for this customer.</p>
              <Button
                size="sm"
                onClick={handleGeneratePassword}
                disabled={generatePasswordMutation.isPending || !customer.email}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Enable Portal Access
              </Button>
              {!customer.email && (
                <p className="text-xs text-warning mt-2">Email address required to enable portal access</p>
              )}
            </div>
          )}
        </Card>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200">
        <div className="border-b border-slate-200">
          <div className="flex gap-1 p-2">
            {([
              { id: 'overview', label: 'Overview', icon: User },
              { id: 'cases', label: 'Cases', icon: FileText },
              { id: 'financial', label: 'Financial', icon: DollarSign },
              { id: 'communications', label: 'Communications', icon: MessageSquare },
              { id: 'purchases', label: 'Purchases', icon: ShoppingBag },
              { id: 'timeline', label: 'Timeline', icon: Activity },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-primary/10 text-primary shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-3">Customer Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Customer Number</p>
                    <p className="font-medium text-slate-900">{customer.customer_number}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Name</p>
                    <p className="font-medium text-slate-900">
                      {customer.customer_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Email</p>
                    <p className="font-medium text-slate-900">{customer.email || 'Not provided'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Mobile Number</p>
                    <p className="font-medium text-slate-900">
                      {customer.mobile_number || 'Not provided'}
                    </p>
                  </div>
                  {customer.phone && (
                    <div>
                      <p className="text-sm text-slate-500 mb-1">Alternative Phone</p>
                      <p className="font-medium text-slate-900">{customer.phone}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Portal Status</p>
                    <p className="font-medium text-slate-900">
                      {customer.portal_enabled ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                </div>
              </div>

              {customer.notes && (
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-3">Internal Notes</h3>
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{customer.notes}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'cases' && id && <CustomerCasesTab customerId={id} />}

          {activeTab === 'financial' && id && <CustomerFinancialTab customerId={id} />}

          {activeTab === 'communications' && (
            <div>
              <div className="flex items-center justify-end gap-2 mb-4">
                <Button variant="secondary" size="sm" onClick={() => setShowComposeEmail(true)}>
                  <Mail className="w-4 h-4 mr-2" />
                  Email
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setComposeMessageChannel('whatsapp')}
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  WhatsApp
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setComposeMessageChannel('sms')}
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  SMS
                </Button>
              </div>
              {communications.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <MessageSquare className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <p className="text-lg">No communications logged yet</p>
                  <p className="text-sm mt-1">
                    Use the buttons above to email or message this customer with a template.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {communications.map((comm) => (
                    <div
                      key={comm.id}
                      className="p-4 bg-slate-50 rounded-lg border border-slate-200"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                          style={{ backgroundColor: getCommunicationColor(comm.type) }}
                        >
                          {getCommunicationIcon(comm.type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge
                              variant="custom"
                              color={getCommunicationColor(comm.type)}
                              size="sm"
                            >
                              {comm.type}
                            </Badge>
                            {comm.direction && (
                              <Badge variant="default" size="sm">
                                {comm.direction}
                              </Badge>
                            )}
                            <span className="text-xs text-slate-500">
                              {formatDate(comm.created_at)}
                            </span>
                          </div>
                          {comm.subject && (
                            <p className="font-medium text-slate-900 mb-1">{comm.subject}</p>
                          )}
                          {comm.content && (
                            <p className="text-sm text-slate-600">{comm.content}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'purchases' && id && (
            <CustomerPurchasesTab customerId={id} />
          )}

          {activeTab === 'timeline' && id && <CustomerTimelineTab customerId={id} />}
        </div>
      </div>
    </DetailPageTemplate>
  );
};
