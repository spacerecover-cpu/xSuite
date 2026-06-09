import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, Pencil, Check, X } from 'lucide-react';
import { PageHeader } from '../../components/shared/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../hooks/useToast';
import {
  getStockLocations,
  createStockLocation,
  updateStockLocation,
  type StockLocation,
} from '../../lib/stockService';
import { stockKeys } from '../../lib/queryKeys';

interface LocationFormState {
  name: string;
  code: string;
  description: string;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
}

const EMPTY_FORM: LocationFormState = {
  name: '',
  code: '',
  description: '',
  is_active: true,
  is_default: false,
  sort_order: 0,
};

const StockLocationsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LocationFormState>(EMPTY_FORM);

  const { data: locations = [], isLoading } = useQuery({
    queryKey: stockKeys.locations(),
    queryFn: getStockLocations,
  });

  const createMutation = useMutation({
    mutationFn: () => createStockLocation({
      name: form.name,
      code: form.code.toUpperCase(),
      description: form.description || null,
      address: null,
      is_active: form.is_active,
      is_default: form.is_default,
      sort_order: form.sort_order,
    }),
    onSuccess: () => {
      toast.success('Location created');
      queryClient.invalidateQueries({ queryKey: stockKeys.locations() });
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to create location'),
  });

  const updateMutation = useMutation({
    mutationFn: (id: string) => updateStockLocation(id, {
      name: form.name,
      code: form.code.toUpperCase(),
      description: form.description || null,
      is_active: form.is_active,
      is_default: form.is_default,
      sort_order: form.sort_order,
    }),
    onSuccess: () => {
      toast.success('Location updated');
      queryClient.invalidateQueries({ queryKey: stockKeys.locations() });
      setEditingId(null);
      setForm(EMPTY_FORM);
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to update location'),
  });

  const startEdit = (loc: StockLocation) => {
    setEditingId(loc.id);
    setForm({
      name: loc.name,
      code: loc.code ?? '',
      description: loc.description ?? '',
      is_active: loc.is_active ?? true,
      is_default: loc.is_default ?? false,
      sort_order: loc.sort_order ?? 0,
    });
    setShowForm(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Stock Locations"
        description="Manage storage locations for your stock items"
        icon={MapPin}
        actions={
          <Button
            variant="primary"
            size="sm"
            className="gap-2"
            onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); }}
          >
            <Plus className="w-4 h-4" />
            Add Location
          </Button>
        }
      />

      {showForm && (
        <div className="bg-white rounded-xl border border-primary/30 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">New Location</h3>
          <LocationForm
            form={form}
            onChange={setForm}
            onSave={() => createMutation.mutate()}
            onCancel={() => { setShowForm(false); setForm(EMPTY_FORM); }}
            isPending={createMutation.isPending}
          />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Location</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Description</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Order</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {locations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400 text-sm">
                    No locations configured yet
                  </td>
                </tr>
              ) : (
                locations.map((loc) => (
                  <React.Fragment key={loc.id}>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-slate-100 rounded">
                            <MapPin className="w-3.5 h-3.5 text-slate-500" />
                          </div>
                          <span className="font-medium text-slate-900">{loc.name}</span>
                          {loc.is_default && (
                            <span className="px-1.5 py-0.5 bg-info-muted text-info text-[10px] font-semibold rounded uppercase tracking-wider">
                              Default
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                          {loc.code}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-sm">
                        {loc.description ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-slate-600">
                        {loc.sort_order ?? 0}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={loc.is_active ? 'success' : 'secondary'} size="sm">
                          {loc.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => startEdit(loc)}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    {editingId === loc.id && (
                      <tr>
                        <td colSpan={6} className="px-4 py-4 bg-info-muted/40 border-b border-info/20">
                          <LocationForm
                            form={form}
                            onChange={setForm}
                            onSave={() => updateMutation.mutate(loc.id)}
                            onCancel={cancelEdit}
                            isPending={updateMutation.isPending}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

interface LocationFormProps {
  form: LocationFormState;
  onChange: (f: LocationFormState) => void;
  onSave: () => void;
  onCancel: () => void;
  isPending: boolean;
}

const LocationForm: React.FC<LocationFormProps> = ({ form, onChange, onSave, onCancel, isPending }) => {
  const set = (key: keyof LocationFormState, val: unknown) =>
    onChange({ ...form, [key]: val });

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Name *</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="e.g. Main Warehouse"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Code *</label>
        <input
          type="text"
          value={form.code}
          onChange={(e) => set('code', e.target.value.toUpperCase())}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary uppercase"
          placeholder="e.g. MAIN"
          maxLength={20}
        />
      </div>
      <div className="col-span-2">
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Description</label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Optional description..."
        />
      </div>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => set('is_active', e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-primary"
          />
          Active
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_default}
            onChange={(e) => set('is_default', e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-primary"
          />
          Default Location
        </label>
      </div>
      <div className="flex justify-end gap-2 col-span-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          <X className="w-4 h-4" />
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={isPending || !form.name || !form.code}
          className="gap-1"
        >
          <Check className="w-4 h-4" />
          {isPending ? 'Saving...' : 'Save Location'}
        </Button>
      </div>
    </div>
  );
};

export default StockLocationsPage;
