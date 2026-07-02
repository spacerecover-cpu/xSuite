import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, ChevronRight, ChevronDown, Pencil, Trash2, ToggleLeft, ToggleRight, Loader2, X, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { HierarchicalLocationPicker } from '../../components/inventory/HierarchicalLocationPicker';
import { buildLocationTree } from '../../lib/inventory/locationTree';
import type { LocationNode } from '../../lib/inventory/locationTree';
import { useInventoryLocations } from '../../lib/inventory/inventoryCatalogQueries';
import { supabase, getTenantId } from '../../lib/supabaseClient';
import type { Database } from '../../types/database.types';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

type InventoryLocationRow = Database['public']['Tables']['inventory_locations']['Row'];
type LocationInsert = Database['public']['Tables']['inventory_locations']['Insert'];

const ADMIN_ROLES = ['owner', 'admin'] as const;
const EDITOR_ROLES = ['owner', 'admin', 'manager'] as const;

interface LocationFormState {
  name: string;
  location_code: string;
  parent_id: string | null;
  is_active: boolean;
}

const EMPTY_FORM: LocationFormState = {
  name: '',
  location_code: '',
  parent_id: null,
  is_active: true,
};

interface TreeRowProps {
  node: LocationNode;
  allLocations: InventoryLocationRow[];
  depth: number;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (row: InventoryLocationRow) => void;
  onDelete: (id: string, name: string) => void;
}

function TreeRow({ node, allLocations, depth, canEdit, canDelete, onEdit, onDelete }: TreeRowProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const row = allLocations.find(r => r.id === node.id);

  return (
    <>
      <tr className="border-b border-border hover:bg-surface-muted transition-colors">
        <td className="py-2.5 px-4">
          <div className="flex items-center gap-1.5" style={{ paddingLeft: `${depth * 20}px` }}>
            {hasChildren ? (
              <button
                type="button"
                onClick={() => setExpanded(e => !e)}
                aria-label={expanded ? 'Collapse' : 'Expand'}
                className="p-0.5 rounded hover:bg-slate-100 focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {expanded
                  ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                }
              </button>
            ) : (
              <span className="w-5" />
            )}
            <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-sm font-medium text-slate-900">{node.name}</span>
          </div>
        </td>
        <td className="py-2.5 px-4 text-sm text-slate-500">
          {node.location_code ?? '—'}
        </td>
        <td className="py-2.5 px-4">
          {row?.is_active
            ? <span className="text-xs font-medium text-success">Active</span>
            : <span className="text-xs font-medium text-slate-400">Inactive</span>
          }
        </td>
        <td className="py-2.5 px-4">
          <div className="flex items-center justify-end gap-1.5">
            {canEdit && row && (
              <button
                type="button"
                onClick={() => onEdit(row)}
                aria-label={`Edit ${node.name}`}
                className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(node.id, node.name)}
                aria-label={`Delete ${node.name}`}
                className="p-1.5 rounded hover:bg-danger-muted text-slate-400 hover:text-danger focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && node.children.map(child => (
        <TreeRow
          key={child.id}
          node={child}
          allLocations={allLocations}
          depth={depth + 1}
          canEdit={canEdit}
          canDelete={canDelete}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}

export default function InventoryLocationsPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: locations = [], isLoading } = useInventoryLocations();
  const tree = buildLocationTree(locations);

  const canEdit = EDITOR_ROLES.includes(profile?.role as typeof EDITOR_ROLES[number]);
  const canDelete = ADMIN_ROLES.includes(profile?.role as typeof ADMIN_ROLES[number]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LocationFormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setShowForm(true);
  };

  const openEdit = (row: InventoryLocationRow) => {
    setEditingId(row.id);
    setForm({
      name: row.name,
      location_code: row.location_code ?? '',
      parent_id: row.parent_id ?? null,
      is_active: row.is_active ?? true,
    });
    setFormErrors({});
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
  };

  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (editingId && form.parent_id === editingId) errs.parent_id = 'A location cannot be its own parent';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const isDescendant = (candidateParentId: string, currentId: string): boolean => {
    const visited = new Set<string>();
    let current: InventoryLocationRow | undefined = locations.find(l => l.id === candidateParentId);
    while (current) {
      if (visited.has(current.id)) break;
      if (current.id === currentId) return true;
      visited.add(current.id);
      current = current.parent_id ? locations.find(l => l.id === current!.parent_id) : undefined;
    }
    return false;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    if (editingId && form.parent_id && isDescendant(form.parent_id, editingId)) {
      setFormErrors(prev => ({ ...prev, parent_id: 'Cannot set a descendant as parent (would create a cycle)' }));
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from('inventory_locations')
          .update({
            name: form.name.trim(),
            location_code: form.location_code.trim() || null,
            parent_id: form.parent_id,
            is_active: form.is_active,
          })
          .eq('id', editingId);
        if (error) throw error;
        toast.success('Location updated');
      } else {
        const tenantId = getTenantId();
        if (!tenantId) throw new Error('No tenant context');
        const insert: LocationInsert = {
          name: form.name.trim(),
          location_code: form.location_code.trim() || null,
          parent_id: form.parent_id,
          is_active: form.is_active,
          tenant_id: tenantId,
        };
        const { error } = await supabase.from('inventory_locations').insert(insert);
        if (error) throw error;
        toast.success('Location created');
      }
      await queryClient.invalidateQueries({ queryKey: ['inventory', 'locations'] });
      closeForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save location');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmed = await confirm({
      title: 'Delete Location',
      message: `Delete "${name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const { error } = await supabase
        .from('inventory_locations')
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq('id', id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['inventory', 'locations'] });
      toast.success('Location deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete location');
    }
  };

  return (
    <div className="min-h-screen p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/inventory')}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Back to inventory"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary shadow-md">
              <MapPin className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 mb-0.5">Storage Locations</h1>
              <p className="text-slate-600 text-sm">
                Manage hierarchical storage locations for inventory items.
              </p>
            </div>
          </div>
        </div>
        {canEdit && (
          <Button onClick={openCreate} size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Location
          </Button>
        )}
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900">
              {editingId ? 'Edit Location' : 'New Location'}
            </h2>
            <button
              type="button"
              onClick={closeForm}
              aria-label="Close form"
              className="p-1 rounded hover:bg-slate-100 text-slate-400 focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <Input
              label="Name"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              required
              error={formErrors.name}
              placeholder="e.g. Rack A"
              size="sm"
            />
            <Input
              label="Location Code"
              value={form.location_code}
              onChange={e => setForm(prev => ({ ...prev, location_code: e.target.value }))}
              placeholder="e.g. RACK-A"
              size="sm"
            />
          </div>

          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">Parent Location (optional)</label>
            <HierarchicalLocationPicker
              value={form.parent_id}
              onChange={id => {
                if (editingId && id === editingId) return;
                setForm(prev => ({ ...prev, parent_id: id }));
              }}
              locations={editingId ? locations.filter(l => l.id !== editingId) : locations}
              placeholder="No parent (root level)"
            />
            {formErrors.parent_id && (
              <p className="mt-1 text-xs text-danger">{formErrors.parent_id}</p>
            )}
          </div>

          <div className="mb-5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setForm(prev => ({ ...prev, is_active: !prev.is_active }))}
              aria-label={form.is_active ? 'Deactivate' : 'Activate'}
              className="focus:outline-none focus:ring-1 focus:ring-ring rounded"
            >
              {form.is_active
                ? <ToggleRight className="w-5 h-5 text-success" />
                : <ToggleLeft className="w-5 h-5 text-slate-400" />
              }
            </button>
            <span className="text-sm text-slate-700">Active</span>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={closeForm} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
              {editingId ? 'Update' : 'Create'}
            </Button>
          </div>
        </div>
      )}

      {/* Locations tree table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4 items-center">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16 ml-auto" />
              </div>
            ))}
          </div>
        ) : locations.length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">No storage locations yet.</p>
            {canEdit && (
              <Button variant="secondary" size="sm" onClick={openCreate} className="mt-3">
                <Plus className="w-4 h-4 mr-1.5" />
                Add First Location
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-surface-muted">
                <th className="py-2.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Name</th>
                <th className="py-2.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Code</th>
                <th className="py-2.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                <th className="py-2.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tree.map(node => (
                <TreeRow
                  key={node.id}
                  node={node}
                  allLocations={locations}
                  depth={0}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
