import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatDate } from '../../lib/format';
import { getPortalUrl } from '../../lib/portalUrlService';
import { useDocumentTranslations } from '../../hooks/useDocumentTranslations';
import { getDeviceIconComponent } from '../../lib/deviceIconMapper';
import { logger } from '../../lib/logger';

interface CustomerCopyReceiptProps {
  caseId: string;
  caseNumber: string;
}

interface CaseData {
  id: string;
  case_no: string | null;
  title: string | null;
  priority: string | null;
  status: string | null;
  client_reference: string | null;
  created_at: string;
  customer_id: string | null;
  contact_id: string | null;
  service_type_id: string | null;
  customer?: {
    id: string;
    customer_number: string | null;
    customer_name: string;
    email: string | null;
    mobile_number: string | null;
    company_name: string | null;
  } | null;
  contact?: {
    id: string;
    customer_name: string;
    mobile_number: string | null;
    email: string | null;
  } | null;
  service_type?: {
    id: string;
    name: string;
  } | null;
  devices?: Array<{
    id: string;
    device_type: { name: string } | null;
    brand: { name: string } | null;
    capacity: { name: string } | null;
    serial_number: string | null;
    symptoms: string | null;
  }>;
  created_by_profile?: {
    id: string;
    full_name: string;
  } | null;
}

interface CompanySettings {
  basic_info?: {
    company_name?: string;
    legal_name?: string;
  };
  location?: {
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    building_name?: string;
    unit_number?: string;
  };
  contact_info?: {
    phone_primary?: string;
    email_general?: string;
  };
  online_presence?: {
    website?: string;
    facebook?: string;
    twitter?: string;
    linkedin?: string;
    instagram?: string;
  };
  branding?: {
    logo_url?: string;
    brand_tagline?: string;
  };
  legal_compliance?: {
    terms_conditions_url?: string;
  };
}

export const CustomerCopyReceipt: React.FC<CustomerCopyReceiptProps> = ({
  caseId,
  caseNumber: _caseNumber,
}) => {
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
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
            .maybeSingle(),
          supabase
            .from('company_settings')
            .select('*')
            .limit(1)
            .maybeSingle(),
        ]);

        if (caseResult.error) throw caseResult.error;
        if (settingsResult.error) throw settingsResult.error;

        const caseInfo = caseResult.data;
        if (!caseInfo) {
          throw new Error('Case not found');
        }
        setCompanySettings(settingsResult.data as unknown as CompanySettings | null);

        const [customerResult, serviceTypeResult, devicesResult, createdByResult] = await Promise.all([
          caseInfo.customer_id
            ? supabase
                .from('customers_enhanced')
                .select('id, customer_number, customer_name, email, mobile_number, company_name')
                .eq('id', caseInfo.customer_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          caseInfo.service_type_id
            ? supabase
                .from('catalog_service_types')
                .select('id, name')
                .eq('id', caseInfo.service_type_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          supabase
            .from('case_devices')
            .select(`
              id,
              serial_number,
              symptoms,
              device_type_id,
              brand_id,
              capacity_id
            `)
            .eq('case_id', caseId),
          caseInfo.created_by
            ? supabase
                .from('profiles')
                .select('id, full_name')
                .eq('id', caseInfo.created_by)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        let contact: CaseData['contact'] = null;
        if (caseInfo.contact_id) {
          const contactResult = await supabase
            .from('customers_enhanced')
            .select('id, customer_name, mobile_number, email')
            .eq('id', caseInfo.contact_id)
            .maybeSingle();
          contact = contactResult.data;
        }

        const devicesWithDetails = await Promise.all(
          (devicesResult.data ?? []).map(async (device) => {
            const [deviceTypeResult, brandResult, capacityResult] = await Promise.all([
              device.device_type_id
                ? supabase.from('catalog_device_types').select('name').eq('id', device.device_type_id).maybeSingle()
                : Promise.resolve({ data: null }),
              device.brand_id
                ? supabase.from('catalog_device_brands').select('name').eq('id', device.brand_id).maybeSingle()
                : Promise.resolve({ data: null }),
              device.capacity_id
                ? supabase.from('catalog_device_capacities').select('name').eq('id', device.capacity_id).maybeSingle()
                : Promise.resolve({ data: null }),
            ]);

            return {
              ...device,
              device_type: deviceTypeResult.data,
              brand: brandResult.data,
              capacity: capacityResult.data,
            };
          })
        );

        setCaseData({
          ...caseInfo,
          customer: customerResult.data,
          contact,
          service_type: serviceTypeResult.data,
          devices: devicesWithDetails,
          created_by_profile: createdByResult.data,
        });

        const portalUrl = getPortalUrl(caseInfo.case_no ?? '');
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(portalUrl)}`;
        setQrCodeUrl(qrApiUrl);
      } catch (error) {
        logger.error('Error fetching receipt data:', error);
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
          <p className="text-slate-500 mt-4">Loading receipt...</p>
        </div>
      </div>
    );
  }

  if (!caseData || !companySettings) {
    return (
      <div className="p-8 text-center text-danger">
        Error loading receipt data. Please try again.
      </div>
    );
  }

  const companyName = companySettings.basic_info?.company_name || 'Your Company';
  const legalName = companySettings.basic_info?.legal_name || companyName;

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
        <h1 className="text-lg font-bold text-sky-500">{t('deviceCheckInReceipt', 'DEVICE CHECK-IN RECEIPT')}</h1>
        <div className="text-xs text-slate-400">{t('customerCopy', 'Customer Copy')}</div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div className="case-details border border-slate-200 rounded p-3">
          <h3 className="text-xs font-bold text-slate-700 mb-2 pb-1 border-b border-slate-100 bg-slate-50 -mx-3 -mt-3 px-3 pt-2 rounded-t">
            {t('caseDetails', 'Case Details')}
          </h3>
          <div className="space-y-1 text-xs">
            <div className="flex"><span className="text-slate-500 w-20">{t('caseIdLabel', 'Case ID:')}</span><span className="text-slate-800 font-medium">{caseData.case_no}</span></div>
            <div className="flex"><span className="text-slate-500 w-20">{t('dateLabel', 'Date:')}</span><span className="text-slate-800">{formatDate(caseData.created_at)}</span></div>
            <div className="flex"><span className="text-slate-500 w-20">{t('statusLabel', 'Status:')}</span><span className="text-slate-800">{caseData.status}</span></div>
            <div className="flex"><span className="text-slate-500 w-20">{t('priorityLabel', 'Priority:')}</span><span className="text-slate-800 capitalize">{caseData.priority}</span></div>
            <div className="flex"><span className="text-slate-500 w-20">{t('serviceLabel', 'Service:')}</span><span className="text-slate-800">{caseData.service_type?.name || '-'}</span></div>
          </div>
        </div>

        <div className="customer-info border border-slate-200 rounded p-3">
          <h3 className="text-xs font-bold text-slate-700 mb-2 pb-1 border-b border-slate-100 bg-slate-50 -mx-3 -mt-3 px-3 pt-2 rounded-t">
            {t('customerInformation', 'Customer Information')}
          </h3>
          <div className="space-y-1 text-xs">
            <div className="flex"><span className="text-slate-500 w-20">{t('nameLabel', 'Name:')}</span><span className="text-slate-800">{caseData.customer?.customer_name || '-'}</span></div>
            <div className="flex"><span className="text-slate-500 w-20">{t('companyLabel', 'Company:')}</span><span className="text-slate-800">{caseData.customer?.company_name || '-'}</span></div>
            <div className="flex"><span className="text-slate-500 w-20">{t('phoneLabel', 'Phone:')}</span><span className="text-slate-800">{caseData.contact?.mobile_number || caseData.customer?.mobile_number || '-'}</span></div>
            <div className="flex"><span className="text-slate-500 w-20">{t('emailLabel', 'Email:')}</span><span className="text-slate-800 break-all">{caseData.customer?.email || '-'}</span></div>
            <div className="flex"><span className="text-slate-500 w-20">{t('clientRefLabel', 'Client Ref:')}</span><span className="text-slate-800">{caseData.client_reference || '-'}</span></div>
          </div>
        </div>
      </div>

      <div className="devices-section mb-3">
        <table className="w-full border-collapse text-xs border border-slate-200">
          <thead>
            <tr className="bg-sky-500">
              <th colSpan={6} className="border border-slate-200 px-2 py-1.5 text-left font-semibold text-white text-xs">
                {t('devicesReceived', 'Devices Received')}
              </th>
            </tr>
            <tr className="bg-sky-500 text-white">
              <th className="border border-slate-200 px-2 py-1.5 text-left font-medium w-8">#</th>
              <th className="border border-slate-200 px-2 py-1.5 text-left font-medium">{t('type', 'Type')}</th>
              <th className="border border-slate-200 px-2 py-1.5 text-left font-medium">{t('brand', 'Brand')}</th>
              <th className="border border-slate-200 px-2 py-1.5 text-left font-medium">{t('serialNumber', 'Serial No.')}</th>
              <th className="border border-slate-200 px-2 py-1.5 text-center font-medium">{t('capacity', 'Capacity')}</th>
              <th className="border border-slate-200 px-2 py-1.5 text-left font-medium">{t('role', 'Role')}</th>
            </tr>
          </thead>
          <tbody>
            {caseData.devices?.map((device, index) => {
              const DeviceIcon = getDeviceIconComponent(device.device_type?.name);
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
                  <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-800">{device.capacity?.name || '-'}</td>
                  <td className="border border-slate-200 px-2 py-1.5">
                    {index === 0 ? (
                      <span className="bg-danger-muted text-danger px-1.5 py-0.5 rounded text-[10px] font-medium">{t('patient', 'Patient')}</span>
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

      <div className="customer-acknowledgement-section mb-3 border border-slate-200 rounded bg-slate-50 overflow-hidden">
        <div className="grid grid-cols-2">
          <div className="p-2.5 border-r border-slate-200">
            <h3 className="text-xs font-bold text-slate-700 mb-1.5">
              Customer Acknowledgement
            </h3>
            <div className="text-[10px] text-slate-600 leading-[1.4]">
              By signing, I confirm that I am the owner or authorized representative of the device and authorize {legalName} ({companyName}) to proceed with the service. I acknowledge that the Terms & Conditions apply to this engagement. A printed copy of the Terms & Conditions is available at reception upon request.
            </div>
            {companySettings.legal_compliance?.terms_conditions_url && (
              <div className="text-[10px] text-sky-600 mt-1">
                {companySettings.legal_compliance.terms_conditions_url}
              </div>
            )}
          </div>
          <div className="p-2.5">
            <h3 className="text-xs font-bold text-slate-700 mb-1.5 text-right">
              إقرار العميل
            </h3>
            <div className="text-[10px] text-slate-600 leading-[1.4] text-right" style={{ direction: 'rtl' }}>
              بتوقيعي، أؤكد أنني المالك أو الممثل المفوض للجهاز وأفوض {legalName} ({companyName}) بالمتابعة في الخدمة. أقر بأن الشروط والأحكام تنطبق على هذا التعامل. نسخة مطبوعة من الشروط والأحكام متاحة في الاستقبال عند الطلب.
            </div>
            {companySettings.legal_compliance?.terms_conditions_url && (
              <div className="text-[10px] text-sky-600 mt-1 text-right">
                {companySettings.legal_compliance.terms_conditions_url}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="tracking-section mb-3 border-2 border-dashed border-sky-400 rounded p-3 bg-sky-50">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h3 className="text-sm font-bold text-sky-900 mb-1 flex items-center gap-2">
              <span>🔒</span>
              <span>{t('trackYourJobOnline', 'Track Your Job Online')}</span>
            </h3>
            <p className="text-xs text-slate-700 leading-relaxed">
              {t('scanQRForProgress', 'Scan the QR code to see your case progress.')}
            </p>
          </div>
          {qrCodeUrl && (
            <div className="flex-shrink-0">
              <img
                src={qrCodeUrl}
                alt="QR Code for Case Tracking"
                className="w-24 h-24 border-2 border-white shadow-md"
              />
            </div>
          )}
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
