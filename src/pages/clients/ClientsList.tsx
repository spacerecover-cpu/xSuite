import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Plus } from 'lucide-react';
import { formatDate } from '../../lib/format';

interface Customer {
  id: string;
  customer_type: 'individual' | 'company';
  customer_name: string;
  email: string | null;
  mobile_number: string | null;
  portal_enabled: boolean;
  created_at: string;
}

export const ClientsList: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    customer_type: 'individual' as 'individual' | 'company',
    customer_name: '',
    email: '',
    mobile_number: '',
  });
  const queryClient = useQueryClient();

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers_enhanced'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers_enhanced')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as Customer[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (customer: typeof formData) => {
      // tenant_id is populated by the customers_enhanced trigger.
      const { error } = await supabase
        .from('customers_enhanced')
        .insert(customer as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers_enhanced'] });
      setIsModalOpen(false);
      setFormData({ customer_type: 'individual', customer_name: '', email: '', mobile_number: '' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (row: Customer) => row.customer_name,
    },
    {
      key: 'type',
      header: 'Type',
      render: (row: Customer) => (
        <Badge variant={row.customer_type === 'company' ? 'info' : 'default'}>
          {row.customer_type}
        </Badge>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (row: Customer) => row.email || '-',
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (row: Customer) => row.mobile_number || '-',
    },
    {
      key: 'portal',
      header: 'Portal',
      render: (row: Customer) => (
        <Badge variant={row.portal_enabled ? 'success' : 'default'}>
          {row.portal_enabled ? 'Enabled' : 'Disabled'}
        </Badge>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (row: Customer) => formatDate(row.created_at),
    },
  ];

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-600 mt-1">Manage individual and company customers</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Client
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow">
        {isLoading ? (
          <div className="text-center py-12 text-slate-500">Loading...</div>
        ) : (
          <Table data={customers} columns={columns} />
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add New Client"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="individual"
                  checked={formData.customer_type === 'individual'}
                  onChange={(e) => setFormData({ ...formData, customer_type: e.target.value as any })}
                  className="mr-2"
                />
                Individual
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="company"
                  checked={formData.customer_type === 'company'}
                  onChange={(e) => setFormData({ ...formData, customer_type: e.target.value as any })}
                  className="mr-2"
                />
                Company
              </label>
            </div>
          </div>

          <Input
            label="Customer Name"
            value={formData.customer_name}
            onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
            required
          />

          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />

          <Input
            label="Mobile Number"
            value={formData.mobile_number}
            onChange={(e) => setFormData({ ...formData, mobile_number: e.target.value })}
          />

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Create Client
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
