import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { StickyNote, Send } from 'lucide-react';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Skeleton } from '../../ui/Skeleton';
import { getTenantNotes, addTenantNote } from '@/lib/platformAdminService';
import { platformAdminKeys } from '@/lib/queryKeys';
import { usePlatformAdmin } from '@/contexts/PlatformAdminContext';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/useToast';
import { logger } from '../../../lib/logger';

interface TenantNotesTabProps {
  tenantId: string;
}

export const TenantNotesTab: React.FC<TenantNotesTabProps> = ({ tenantId }) => {
  const [noteContent, setNoteContent] = useState('');
  const { admin } = usePlatformAdmin();
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToast();

  const { data: notes = [], isLoading } = useQuery({
    queryKey: platformAdminKeys.tenantNotes(tenantId),
    queryFn: () => getTenantNotes(tenantId),
  });

  const addNoteMutation = useMutation({
    mutationFn: () => {
      if (!admin) throw new Error('Not authenticated');
      return addTenantNote(tenantId, noteContent, admin.id, admin.name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.tenantNotes(tenantId) });
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.tenantActivity(tenantId) });
      setNoteContent('');
      showSuccess('Note added successfully');
    },
    onError: (error: Error) => {
      showError('Failed to add note');
      logger.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;
    addNoteMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Add Internal Note</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder="Type your internal note here... This will only be visible to platform admins."
            rows={4}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={!noteContent.trim() || addNoteMutation.isPending}
            >
              <Send className="w-4 h-4 mr-2" />
              Add Note
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Internal Notes History</h3>
        {notes.length === 0 ? (
          <div className="text-center py-12">
            <StickyNote className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No internal notes yet</p>
            <p className="text-sm text-slate-400 mt-2">
              Add notes to track important information about this tenant
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => {
              const activityData = (note.activity_details || {}) as Record<string, unknown>;
              return (
                <div key={note.id} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-info-muted rounded-full flex items-center justify-center">
                        <StickyNote className="w-4 h-4 text-info" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {(activityData.admin_name as string) || 'Admin'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDistanceToNow(new Date(note.created_at))} ago
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap ml-10">
                    {activityData.note as string}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};
