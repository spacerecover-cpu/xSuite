import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { SearchableSelect } from '../ui/SearchableSelect';
import { Building2, Mail, Phone, Hash, Globe } from 'lucide-react';

interface ChangeCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCompany: {
    id: string;
    name?: string;
    company_name?: string;
    company_number: string;
    email?: string;
    phone?: string;
    tax_number?: string;
    geo_cities?: { name: string } | null;
    geo_countries?: { name: string } | null;
  } | null;
  onConfirm: (newCompanyId: string | null) => void;
  isLoading?: boolean;
}

export const ChangeCompanyModal: React.FC<ChangeCompanyModalProps> = ({
  isOpen,
  onClose,
  currentCompany,
  onConfirm,
  isLoading = false,
}) => {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');

  const { data: companies = [], isLoading: companiesLoading } = useQuery({
    queryKey: ['companies_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, company_number, name, company_name, email, phone, tax_number, geo_countries(name), geo_cities(name)')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data;
    },
    enabled: isOpen,
  });

  const handleConfirm = () => {
    if (selectedCompanyId === 'none') {
      onConfirm(null);
    } else if (selectedCompanyId && selectedCompanyId !== currentCompany?.id) {
      onConfirm(selectedCompanyId);
    }
  };

  const companyOptions = [
    {
      id: 'none',
      name: 'No Company (Individual Customer)',
    },
    ...companies.map((company) => ({
      id: company.id,
      name: `${company.name || company.company_name} - ${company.company_number}`,
      keywords: `${company.email ?? ''} ${company.phone ?? ''} ${company.tax_number ?? ''}`,
    })),
  ];

  const hasChanged = selectedCompanyId && (
    (selectedCompanyId === 'none' && currentCompany) ||
    (selectedCompanyId !== 'none' && selectedCompanyId !== currentCompany?.id)
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Change Company"
      size="md"
    >
      <div className="space-y-6">
        {/* Current Company Info */}
        {currentCompany ? (
          <div className="bg-success-muted border border-success/30 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-success mb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Current Company
            </h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Hash className="w-3 h-3 text-success" />
                <span className="text-success font-medium">{currentCompany.company_number}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="w-3 h-3 text-success" />
                <span className="text-success font-semibold">{currentCompany.name || currentCompany.company_name}</span>
              </div>
              {currentCompany.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-3 h-3 text-success" />
                  <span className="text-success">{currentCompany.email}</span>
                </div>
              )}
              {currentCompany.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-3 h-3 text-success" />
                  <span className="text-success">{currentCompany.phone}</span>
                </div>
              )}
              {(currentCompany.geo_cities?.name || currentCompany.geo_countries?.name) && (
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="w-3 h-3 text-success" />
                  <span className="text-success">
                    {[currentCompany.geo_cities?.name, currentCompany.geo_countries?.name].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <p className="text-sm text-slate-600 flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              No company currently associated (Individual Customer)
            </p>
          </div>
        )}

        {/* New Company Selection */}
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">
            Select New Company
          </label>
          <SearchableSelect
            label=""
            options={companyOptions}
            value={selectedCompanyId}
            onChange={(value) => setSelectedCompanyId(value)}
            placeholder="Search by company name or number..."
            required={false}
            disabled={companiesLoading}
          />
          <p className="text-xs text-slate-500 mt-2">
            Search and select the new company, or choose "No Company" for individual customers
          </p>
        </div>

        {/* Warning Message */}
        {hasChanged && (
          <div className="bg-warning-muted border border-warning/30 rounded-lg p-3">
            <p className="text-sm text-warning">
              <strong>Note:</strong> Changing the company will update this case's business association.
              This action will be logged in the case history.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!hasChanged || isLoading}
            style={{ backgroundColor: 'rgb(var(--color-success))' }}
          >
            {isLoading ? 'Changing Company...' : 'Change Company'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
