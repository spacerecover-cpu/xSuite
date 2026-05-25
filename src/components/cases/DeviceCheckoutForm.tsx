import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatDate } from '../../lib/format';
import { useDocumentTranslations } from '../../hooks/useDocumentTranslations';
import { getDeviceIconComponent } from '../../lib/deviceIconMapper';
import { logger } from '../../lib/logger';

interface DeviceCheckoutFormProps {
  caseId: string;
}

interface CaseData {
  id: string;
  case_no: string | null;
  customer_id: string | null;
  // The following fields are not (yet) present on the cases table — the UI
  // tolerates missing values via `??` / falsy guards below.
  checkout_date?: string | null;
  checkout_collector_name?: string | null;
  checkout_collector_mobile?: string | null;
  checkout_collector_id?: string | null;
  recovery_outcome?: string | null;
  service_type_id: string | null;
  customer?: {
    customer_name: string;
    email: string | null;
    mobile_number: string | null;
  } | null;
  company?: {
    name?: string | null;
    company_name?: string | null;
  } | null;
  service_type?: {
    name: string;
  } | null;
  devices?: Array<{
    id: string;
    device_type: { name: string } | null;
    brand: { name: string } | null;
    capacity: { name: string } | null;
    serial_number: string | null;
    role: string | null;
    device_role_id: number | null;
  }>;
  created_by_profile?: {
    full_name: string;
  } | null;
  [key: string]: unknown;
}

interface CompanySettings {
  basic_info?: {
    company_name?: string;
    legal_name?: string;
  } | null;
  location?: {
    address_line1?: string;
    address_line2?: string;
    city?: string;
    country?: string;
    building_name?: string;
    unit_number?: string;
  } | null;
  contact_info?: {
    phone_primary?: string;
    email_general?: string;
  } | null;
  online_presence?: {
    website?: string;
  } | null;
  branding?: {
    logo_url?: string;
    brand_tagline?: string;
  } | null;
  legal_compliance?: {
    terms_conditions_url?: string;
  } | null;
}

export const DeviceCheckoutForm: React.FC<DeviceCheckoutFormProps> = ({ caseId }) => {
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useDocumentTranslations();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [caseResult, settingsResult] = await Promise.all([
          supabase
            .from('cases')
            .select('*')
            .eq('id', caseId)
            .single(),
          supabase
            .from('company_settings')
            .select('*')
            .limit(1)
            .maybeSingle(),
        ]);

        if (caseResult.error) throw caseResult.error;
        if (settingsResult.error) throw settingsResult.error;

        const caseInfo = caseResult.data;
        setCompanySettings(
          settingsResult.data
            ? {
                basic_info: settingsResult.data.basic_info as CompanySettings['basic_info'],
                location: settingsResult.data.location as CompanySettings['location'],
                contact_info: settingsResult.data.contact_info as CompanySettings['contact_info'],
                online_presence: settingsResult.data.online_presence as CompanySettings['online_presence'],
                branding: settingsResult.data.branding as CompanySettings['branding'],
                legal_compliance: settingsResult.data.legal_compliance as CompanySettings['legal_compliance'],
              }
            : null
        );

        const [customerResult, companyResult, serviceTypeResult, devicesResult, createdByResult] = await Promise.all([
          caseInfo.customer_id
            ? supabase
                .from('customers_enhanced')
                .select('customer_name, email, mobile_number')
                .eq('id', caseInfo.customer_id)
                .single()
            : Promise.resolve({ data: null }),
          caseInfo.company_id
            ? supabase
                .from('companies')
                .select('name, company_name')
                .eq('id', caseInfo.company_id)
                .single()
            : Promise.resolve({ data: null }),
          caseInfo.service_type_id
            ? supabase
                .from('catalog_service_types')
                .select('name')
                .eq('id', caseInfo.service_type_id)
                .single()
            : Promise.resolve({ data: null }),
          supabase
            .from('case_devices')
            .select('id, serial_number, device_role_id, device_type_id, brand_id, capacity_id')
            .eq('case_id', caseId),
          caseInfo.created_by
            ? supabase
                .from('profiles')
                .select('full_name')
                .eq('id', caseInfo.created_by)
                .single()
            : Promise.resolve({ data: null }),
        ]);

        const devicesWithDetails = await Promise.all(
          (devicesResult.data || []).map(async (device) => {
            const [deviceTypeResult, brandResult, capacityResult, roleResult] = await Promise.all([
              device.device_type_id
                ? supabase.from('catalog_device_types').select('name').eq('id', device.device_type_id).single()
                : Promise.resolve({ data: null }),
              device.brand_id
                ? supabase.from('catalog_device_brands').select('name').eq('id', device.brand_id).single()
                : Promise.resolve({ data: null }),
              device.capacity_id
                ? supabase.from('catalog_device_capacities').select('name').eq('id', device.capacity_id).single()
                : Promise.resolve({ data: null }),
              device.device_role_id
                ? supabase.from('catalog_device_roles').select('name').eq('id', device.device_role_id).single()
                : Promise.resolve({ data: null }),
            ]);

            return {
              ...device,
              device_type: deviceTypeResult.data,
              brand: brandResult.data,
              capacity: capacityResult.data,
              role: roleResult.data?.name?.toLowerCase() ?? null,
            };
          })
        );

        setCaseData({
          ...caseInfo,
          customer: customerResult.data,
          company: companyResult.data,
          service_type: serviceTypeResult.data,
          devices: devicesWithDetails,
          created_by_profile: createdByResult.data,
        });
      } catch (error) {
        logger.error('Error fetching checkout form data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [caseId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
          <p className="text-slate-500 mt-4">Loading checkout form...</p>
        </div>
      </div>
    );
  }

  if (!caseData || !companySettings) {
    return (
      <div className="p-8 text-center text-danger">
        Error loading checkout form data. Please try again.
      </div>
    );
  }

  const companyName = companySettings.basic_info?.company_name || 'Your Company';
  const legalName = companySettings.basic_info?.legal_name || companyName;

  const isCollectorSameAsCustomer =
    caseData.checkout_collector_name === caseData.customer?.customer_name ||
    !caseData.checkout_collector_name ||
    caseData.checkout_collector_name.trim() === '';

  const getRecoveryOutcomeText = (outcome: string) => {
    const outcomes: Record<string, string> = {
      full: t('outcomeFullRecovery', 'Full Recovery'),
      partial: t('outcomePartialRecovery', 'Partial Recovery'),
      unrecoverable: t('outcomeUnrecoverable', 'Unrecoverable'),
      declined: t('outcomeDeclined', 'Declined'),
    };
    return outcomes[outcome] || outcome;
  };

  return (
    <div className="receipt-container bg-white p-6 max-w-[210mm] mx-auto text-[13px]" style={{ fontFamily: 'Arial, sans-serif' }}>
      <div className="receipt-header mb-3 pb-3 border-b border-slate-200">
        <div className="flex items-start justify-between">
          <div className="flex-shrink-0">
            {companySettings.branding?.logo_url ? (
              <img
                src={companySettings.branding.logo_url}
                alt={companyName}
                className="h-12 w-auto object-contain"
              />
            ) : (
              <div className="text-xl font-bold text-sky-500">{companyName}</div>
            )}
          </div>

          <div className="text-right text-xs leading-tight">
            <div className="font-bold text-sm text-slate-800">{legalName}</div>
            {companySettings.branding?.brand_tagline && (
              <div className="text-sky-500 italic text-[11px]">{companySettings.branding.brand_tagline}</div>
            )}
            <div className="text-slate-500 mt-1">
              {companySettings.location?.address_line1 && (
                <span>{companySettings.location.address_line1}</span>
              )}
              {companySettings.location?.city && companySettings.location?.country && (
                <span>, {companySettings.location.city}, {companySettings.location.country}</span>
              )}
            </div>
            <div className="text-slate-500">
              {companySettings.contact_info?.phone_primary && (
                <span>Tel: {companySettings.contact_info.phone_primary}</span>
              )}
              {companySettings.contact_info?.email_general && (
                <span> | {t('emailLabel', 'Email:')} {companySettings.contact_info.email_general}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="receipt-title text-center mb-3">
        <h1 className="text-lg font-bold text-sky-500">{t('deviceCheckoutForm', 'DEVICE CHECKOUT FORM')}</h1>
        <div className="text-xs text-slate-400">{t('officeCopy', 'Office Copy')}</div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div className="case-details border border-slate-200 rounded p-3">
          <h3 className="text-xs font-bold text-slate-700 mb-2 pb-1 border-b border-slate-100 bg-slate-50 -mx-3 -mt-3 px-3 pt-2 rounded-t">
            {t('caseDetails', 'Case Details')}
          </h3>
          <div className="space-y-1 text-xs">
            <div className="flex"><span className="text-slate-500 w-32">{t('caseIdLabel', 'Case ID:')}</span><span className="text-slate-800 font-medium">{caseData.case_no}</span></div>
            <div className="flex"><span className="text-slate-500 w-32">{t('customerNameLabel', 'Customer Name:')}</span><span className="text-slate-800">{caseData.customer?.customer_name || '-'}</span></div>
            <div className="flex"><span className="text-slate-500 w-32">{t('companyLabel', 'Company:')}</span><span className="text-slate-800">{caseData.company?.name || caseData.company?.company_name || '-'}</span></div>
            <div className="flex"><span className="text-slate-500 w-32">{t('serviceLabel', 'Service:')}</span><span className="text-slate-800">{caseData.service_type?.name || '-'}</span></div>
            <div className="flex"><span className="text-slate-500 w-32">{t('customerPhoneLabel', 'Customer Phone:')}</span><span className="text-slate-800">{caseData.customer?.mobile_number || '-'}</span></div>
          </div>
        </div>

        <div className="collection-info border border-slate-200 rounded p-3">
          <h3 className="text-xs font-bold text-slate-700 mb-2 pb-1 border-b border-slate-100 bg-slate-50 -mx-3 -mt-3 px-3 pt-2 rounded-t">
            {t('collectionInformation', 'Collection Information')}
          </h3>
          <div className="space-y-1 text-xs">
            <div className="flex"><span className="text-slate-500 w-32">{t('checkoutDateLabel', 'Checkout Date:')}</span><span className="text-slate-800">{caseData.checkout_date ? formatDate(caseData.checkout_date) : '-'}</span></div>
            <div className="flex"><span className="text-slate-500 w-32">{t('recoveryOutcomeLabel', 'Recovery Outcome:')}</span><span className="text-slate-800">{getRecoveryOutcomeText(caseData.recovery_outcome ?? '')}</span></div>
            {isCollectorSameAsCustomer ? (
              <>
                <div className="flex"><span className="text-slate-500 w-32">{t('collectedByLabel', 'Collected By:')}</span><span className="text-slate-800">{caseData.customer?.customer_name || '-'}</span></div>
                <div className="flex"><span className="text-slate-500 w-32">{t('mobileNumberLabel', 'Mobile Number:')}</span><span className="text-slate-800">{caseData.customer?.mobile_number || '-'}</span></div>
              </>
            ) : (
              <>
                <div className="flex"><span className="text-slate-500 w-32">{t('collectedByLabel', 'Collected By:')}</span><span className="text-slate-800">{caseData.checkout_collector_name}</span></div>
                <div className="flex"><span className="text-slate-500 w-32">{t('mobileNumberLabel', 'Mobile Number:')}</span><span className="text-slate-800">{caseData.checkout_collector_mobile}</span></div>
                {caseData.checkout_collector_id && (
                  <div className="flex"><span className="text-slate-500 w-32">{t('nationalIdLabel', 'National ID:')}</span><span className="text-slate-800 font-mono">{caseData.checkout_collector_id}</span></div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="devices-section mb-3">
        <table className="w-full border-collapse text-xs border border-slate-200">
          <thead>
            <tr className="bg-sky-500">
              <th colSpan={5} className="border border-slate-200 px-2 py-1.5 text-left font-semibold text-white text-xs">
                {t('devicesReturned', 'Device(s) Returned')}
              </th>
            </tr>
            <tr className="bg-sky-500 text-white">
              <th className="border border-slate-200 px-2 py-1.5 text-left font-medium w-8">#</th>
              <th className="border border-slate-200 px-2 py-1.5 text-left font-medium">{t('type', 'Type')}</th>
              <th className="border border-slate-200 px-2 py-1.5 text-left font-medium">{t('brand', 'Brand')}</th>
              <th className="border border-slate-200 px-2 py-1.5 text-left font-medium">{t('serialNumber', 'Serial No.')}</th>
              <th className="border border-slate-200 px-2 py-1.5 text-left font-medium">{t('role', 'Role')}</th>
            </tr>
          </thead>
          <tbody>
            {caseData.devices?.map((device, index) => {
              const DeviceIcon = getDeviceIconComponent(device.device_type?.name);
              const roleLabel = device.role === 'patient' ? t('patient', 'Patient') : device.role === 'donor' ? t('donor', 'Donor') : '-';
              return (
                <tr key={device.id} className="hover:bg-slate-50">
                  <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-600">{index + 1}</td>
                  <td className="border border-slate-200 px-2 py-1.5 text-slate-800">
                    <div className="flex items-center gap-1.5">
                      <DeviceIcon className="w-4 h-4 text-slate-500 flex-shrink-0" />
                      <span>{device.device_type?.name || '-'}</span>
                    </div>
                  </td>
                  <td className="border border-slate-200 px-2 py-1.5 text-slate-800">{device.brand?.name || '-'}</td>
                  <td className="border border-slate-200 px-2 py-1.5 text-slate-800 font-mono">{device.serial_number || '-'}</td>
                  <td className="border border-slate-200 px-2 py-1.5">
                    {roleLabel !== '-' ? (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        device.role === 'patient' ? 'bg-danger-muted text-danger' : 'bg-info-muted text-info'
                      }`}>{roleLabel}</span>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="acknowledgement-section mb-3 border border-slate-200 rounded p-2.5 bg-slate-50">
        <h3 className="text-xs font-bold text-slate-700 mb-1.5">
          Customer Checkout Acknowledgement | إقرار استلام العميل
        </h3>
        <div className="text-[10px] text-slate-600 leading-[1.4]">
          <p className="mb-1">
            I confirm receipt of my device/data and acknowledge that my case has been concluded (completed, cancelled, or non-recoverable).
            I accept that data recovery is best-effort and subject to the Terms & Conditions available online or at reception.
          </p>
          <p className="text-right" style={{ direction: 'rtl' }}>
            أؤكد استلام جهازي/بياناتي وأقر بأن حالتي قد انتهت (مكتملة، ملغاة، أو غير قابلة للاستعادة).
            أقبل أن استعادة البيانات تتم على أساس بذل أقصى جهد ممكن وتخضع للشروط والأحكام المتاحة عبر الإنترنت أو في الاستقبال.
          </p>
          {companySettings.legal_compliance?.terms_conditions_url && (
            <p className="mt-1 text-sky-600">
              <a href={companySettings.legal_compliance.terms_conditions_url} target="_blank" rel="noopener noreferrer">
                {companySettings.legal_compliance.terms_conditions_url}
              </a>
            </p>
          )}
        </div>
      </div>

      <div className="signatures-section mb-4">
        <div className="grid grid-cols-2 gap-12">
          <div className="signature-box">
            <div className="border-b border-slate-300 h-10 mb-1"></div>
            <div className="text-center text-[10px] text-slate-500">{t('customerSignature', 'Customer Signature')}</div>
          </div>
          <div className="signature-box">
            <div className="border-b border-slate-300 h-10 mb-1"></div>
            <div className="text-center text-[10px] text-slate-500">{t('companyRepresentative', 'Company Representative')}</div>
          </div>
        </div>
      </div>

      <div className="receipt-footer pt-2 border-t border-slate-200 text-[10px] text-slate-400 flex justify-between">
        <span>{t('generatedOn', 'Generated on')} {formatDate(new Date())}</span>
        <span>{t('registeredByLabel', 'Registered by:')} {caseData.created_by_profile?.full_name || 'System'}</span>
      </div>

      <style>{`
        @media print {
          body { margin: 0; padding: 0; }
          .receipt-container { max-width: 100%; margin: 0; padding: 15mm; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </div>
  );
};
