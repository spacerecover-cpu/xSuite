import React, { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { employeeOnboardingKeys, recruitmentKeys } from '../../lib/queryKeys';
import { resolveTenantId } from '../../lib/supabaseClient';
import {
  createChecklist,
  updateChecklist,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  type ChecklistWithItems,
} from '../../lib/employeeOnboardingService';
import { getPositions } from '../../lib/recruitmentService';
import toast from 'react-hot-toast';

interface ChecklistFormData {
  name: string;
  description: string;
  for_position_id: string;
  is_default: boolean;
}

interface ChecklistItemDraft {
  id?: string;
  title: string;
  description: string;
  assigned_to_role: string;
  is_required: boolean;
  sort_order: number;
  isNew?: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  checklist?: ChecklistWithItems | null;
}

export const ChecklistFormModal: React.FC<Props> = ({ isOpen, onClose, checklist }) => {
  const queryClient = useQueryClient();
  const isEditing = !!checklist;
  const nameFieldId = useId();
  const descriptionFieldId = useId();
  const positionFieldId = useId();

  const [items, setItems] = useState<ChecklistItemDraft[]>([]);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ChecklistFormData>();

  useEffect(() => {
    if (checklist) {
      reset({
        name: checklist.name,
        description: checklist.description || '',
        for_position_id: checklist.for_position_id || '',
        is_default: checklist.is_default || false,
      });
      setItems(
        (checklist.onboarding_checklist_items || []).map(item => ({
          id: item.id,
          title: item.title,
          description: item.description || '',
          assigned_to_role: item.assigned_to_role || '',
          is_required: item.is_required ?? true,
          sort_order: item.sort_order || 0,
        }))
      );
    } else {
      reset({
        name: '',
        description: '',
        for_position_id: '',
        is_default: false,
      });
      setItems([]);
    }
  }, [checklist, reset, isOpen]);

  const { data: positions = [] } = useQuery({
    queryKey: recruitmentKeys.positions(),
    queryFn: () => getPositions(),
  });

  const mutation = useMutation({
    mutationFn: async (data: ChecklistFormData) => {
      // Real tenant uuid: the trigger only stamps NULL; '' fails the uuid cast.
      const tenantId = await resolveTenantId();
      const payload = {
        tenant_id: tenantId,
        name: data.name,
        description: data.description || null,
        for_position_id: data.for_position_id || null,
        is_default: data.is_default,
      };

      let checklistId = checklist?.id;

      if (isEditing && checklistId) {
        await updateChecklist(checklistId, payload);
      } else {
        const created = await createChecklist(payload);
        if (!created) throw new Error('Failed to create checklist');
        checklistId = created.id;
      }

      for (const item of items) {
        const itemPayload = {
          tenant_id: tenantId,
          title: item.title,
          description: item.description || null,
          assigned_to_role: item.assigned_to_role || null,
          is_required: item.is_required,
          sort_order: item.sort_order,
          checklist_id: checklistId,
        };

        if (item.id && !item.isNew) {
          await updateChecklistItem(item.id, itemPayload);
        } else if (!item.id || item.isNew) {
          await createChecklistItem(itemPayload);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employeeOnboardingKeys.all });
      toast.success(isEditing ? 'Checklist updated' : 'Checklist created');
      onClose();
    },
    onError: () => {
      toast.error('Failed to save checklist');
    },
  });

  const addItem = () => {
    setItems(prev => [
      ...prev,
      {
        title: '',
        description: '',
        assigned_to_role: '',
        is_required: true,
        sort_order: prev.length,
        isNew: true,
      },
    ]);
  };

  const removeItem = async (index: number) => {
    const item = items[index];
    if (item.id && !item.isNew) {
      try {
        await deleteChecklistItem(item.id);
        queryClient.invalidateQueries({ queryKey: employeeOnboardingKeys.all });
      } catch {
        toast.error('Failed to remove item');
        return;
      }
    }
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ChecklistItemDraft, value: string | boolean | number) => {
    setItems(prev =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Checklist' : 'New Onboarding Checklist'}
      size="lg"
      closeOnBackdrop={false}
    >
      <form onSubmit={handleSubmit(data => mutation.mutate(data))} className="space-y-5">
        <div>
          <label htmlFor={nameFieldId} className="block text-sm font-medium text-slate-700 mb-1">
            Checklist Name <span className="text-danger">*</span>
          </label>
          <Input
            id={nameFieldId}
            {...register('name', { required: 'Name is required' })}
            placeholder="e.g. Engineering Onboarding"
          />
          {errors.name && <p className="text-danger text-xs mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <label htmlFor={descriptionFieldId} className="block text-sm font-medium text-slate-700 mb-1">Description</label>
          <textarea
            id={descriptionFieldId}
            {...register('description')}
            rows={2}
            placeholder="What this checklist covers..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor={positionFieldId} className="block text-sm font-medium text-slate-700 mb-1">For Position</label>
            <select
              id={positionFieldId}
              {...register('for_position_id')}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Any position</option>
              {positions.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-3 pt-6">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                {...register('is_default')}
                className="rounded border-slate-300 text-primary"
              />
              Default checklist
            </label>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-800">Checklist Items</h4>
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/90 px-2.5 py-1.5 hover:bg-primary/10 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Item
            </button>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-slate-300 rounded-xl text-slate-400 text-sm">
              No items yet. Add tasks to this checklist.
            </div>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {items.map((item, index) => (
                <div key={index} className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                  <div className="flex items-start gap-2">
                    <GripVertical className="w-4 h-4 text-slate-300 mt-2 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Input
                        value={item.title}
                        onChange={e => updateItem(index, 'title', e.target.value)}
                        placeholder="Task title *"
                      />
                      <Input
                        value={item.description}
                        onChange={e => updateItem(index, 'description', e.target.value)}
                        placeholder="Description (optional)"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          value={item.assigned_to_role}
                          onChange={e => updateItem(index, 'assigned_to_role', e.target.value)}
                          placeholder="Assigned role (optional)"
                          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.is_required}
                            onChange={e => updateItem(index, 'is_required', e.target.checked)}
                            className="rounded border-slate-300 text-primary"
                          />
                          Required
                        </label>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="p-1.5 text-slate-400 hover:text-danger hover:bg-danger-muted rounded-lg transition-colors mt-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving...' : isEditing ? 'Update' : 'Create Checklist'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
