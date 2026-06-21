import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, Plus, Pencil, Trash2, ChevronDown, Check } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { FormField } from '../ui/FormField';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import {
  getAllKBCategories,
  createKBCategory,
  updateKBCategory,
  deleteKBCategory,
  type KBCategory,
} from '../../lib/kbService';
import { kbKeys } from '../../lib/queryKeys';
import { useToast } from '../../hooks/useToast';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COLOR_OPTIONS = [
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Teal', value: '#14b8a6' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Rose', value: '#f43f5e' },
  { label: 'Sky', value: '#0ea5e9' },
  { label: 'Slate', value: '#64748b' },
  { label: 'Orange', value: '#f97316' },
];

interface CategoryFormState {
  name: string;
  description: string;
  parent_id: string;
  color: string;
  sort_order: string;
}

const defaultForm = (): CategoryFormState => ({
  name: '',
  description: '',
  parent_id: '',
  color: '#3b82f6',
  sort_order: '0',
});

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({ isOpen, onClose }) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CategoryFormState>(defaultForm());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: [...kbKeys.categories(), 'all'],
    queryFn: getAllKBCategories,
    enabled: isOpen,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createKBCategory({
        name: form.name,
        description: form.description || undefined,
        parent_id: form.parent_id || null,
        color: form.color,
        sort_order: parseInt(form.sort_order) || 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kbKeys.all });
      toast.success('Category created');
      setShowForm(false);
      setForm(defaultForm());
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to create category'),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateKBCategory(editingId!, {
        name: form.name,
        description: form.description || undefined,
        parent_id: form.parent_id || null,
        color: form.color,
        sort_order: parseInt(form.sort_order) || 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kbKeys.all });
      toast.success('Category updated');
      setEditingId(null);
      setShowForm(false);
      setForm(defaultForm());
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to update category'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteKBCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kbKeys.all });
      toast.success('Category deactivated');
      setDeleteConfirmId(null);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to delete category'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      updateKBCategory(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: kbKeys.all }),
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Unknown error'),
  });

  const startEdit = (cat: KBCategory) => {
    setEditingId(cat.id);
    setForm({
      name: cat.name,
      description: cat.description || '',
      parent_id: cat.parent_id || '',
      color: cat.color || '#3b82f6',
      sort_order: String(cat.sort_order ?? 0),
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(defaultForm());
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error('Category name is required');
      return;
    }
    if (editingId) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const parentOptions = categories.filter((c) => c.id !== editingId);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Manage Categories"
        icon={FolderOpen}
        size="lg"
      >
        <div className="space-y-4">
          {!showForm && (
            <div className="flex justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={() => { setShowForm(true); setEditingId(null); setForm(defaultForm()); }}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                New Category
              </Button>
            </div>
          )}

          {showForm && (
            <div className="border border-info/30 rounded-xl p-4 bg-info-muted space-y-4">
              <h4 className="text-sm font-semibold text-info">{editingId ? 'Edit Category' : 'New Category'}</h4>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Name" required>
                  {(c) => (
                    <Input
                      {...c}
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Diagnostic Protocols"
                    />
                  )}
                </FormField>
                <FormField label="Display Order">
                  {(c) => (
                    <Input
                      {...c}
                      type="number"
                      value={form.sort_order}
                      onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                      placeholder="0"
                    />
                  )}
                </FormField>
              </div>
              <FormField label="Description">
                {(c) => (
                  <Input
                    {...c}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Brief description (optional)"
                  />
                )}
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Parent Category">
                  {(c) => (
                    <select
                      {...c}
                      value={form.parent_id}
                      onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    >
                      <option value="">None (top-level)</option>
                      {parentOptions.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  )}
                </FormField>
                <FormField label="Color">
                  {(c) => (
                    <div
                      role="group"
                      aria-labelledby={c['aria-labelledby']}
                      aria-describedby={c['aria-describedby']}
                      className="flex gap-1.5 flex-wrap pt-1"
                    >
                      {COLOR_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          title={opt.label}
                          onClick={() => setForm({ ...form, color: opt.value })}
                          className="w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110 border-2"
                          style={{
                            backgroundColor: opt.value,
                            borderColor: form.color === opt.value ? '#1e293b' : 'transparent',
                          }}
                        >
                          {form.color === opt.value && <Check className="w-3 h-3 text-white" />}
                        </button>
                      ))}
                    </div>
                  )}
                </FormField>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={cancelForm}>Cancel</Button>
                <Button variant="primary" size="sm" onClick={handleSubmit} disabled={isPending}>
                  {editingId ? 'Update' : 'Create'}
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Loading categories...</div>
          ) : categories.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">No categories yet. Create your first one.</div>
          ) : (
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
              {categories.map((cat) => (
                <div key={cat.id} className={`flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors ${!cat.is_active ? 'opacity-50' : ''}`}>
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cat.color || '#64748b' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">{cat.name}</span>
                      {cat.parent_id && (
                        <ChevronDown className="w-3 h-3 text-gray-400 rotate-[-90deg]" />
                      )}
                      {!cat.is_active && (
                        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">inactive</span>
                      )}
                    </div>
                    {cat.description && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{cat.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleActiveMutation.mutate({ id: cat.id, is_active: !cat.is_active })}
                      className={`text-xs px-2 py-0.5 rounded transition-colors ${cat.is_active ? 'text-success bg-success-muted hover:bg-success/20' : 'text-gray-500 bg-gray-100 hover:bg-gray-200'}`}
                    >
                      {cat.is_active ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      onClick={() => startEdit(cat)}
                      className="p-1.5 text-gray-400 hover:text-primary hover:bg-info-muted rounded transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(cat.id)}
                      className="p-1.5 text-gray-400 hover:text-danger hover:bg-danger-muted rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 mt-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
        title="Deactivate Category"
        message="This category will be hidden from the KB. Articles in it won't be deleted. You can reactivate it later."
        confirmText="Deactivate"
        variant="danger"
      />
    </>
  );
};
