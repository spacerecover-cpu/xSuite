import React, { useState } from 'react';
import { Info, AlertTriangle, Construction, Sparkles, Tag, MoreVertical, CreditCard as Edit2, Copy, Power, Trash2, Megaphone } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '../../ui/Card';
import { Badge } from '../../ui/Badge';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { duplicateAnnouncement, deleteAnnouncement, updateAnnouncement } from '@/lib/platformAdminService';
import { platformAdminKeys } from '@/lib/queryKeys';
import { useToast } from '@/hooks/useToast';
import type { Database } from '@/types/database.types';

type PlatformAnnouncement = Database['public']['Tables']['platform_announcements']['Row'];

interface AnnouncementCardProps {
  announcement: PlatformAnnouncement;
  onEdit: (announcement: PlatformAnnouncement) => void;
}

const typeConfig = {
  info: { icon: Info, color: 'bg-info', iconClass: 'text-info-foreground' },
  warning: { icon: AlertTriangle, color: 'bg-warning', iconClass: 'text-warning-foreground' },
  maintenance: { icon: Construction, color: 'bg-danger', iconClass: 'text-danger-foreground' },
  feature: { icon: Sparkles, color: 'bg-success', iconClass: 'text-success-foreground' },
  promotion: { icon: Tag, color: 'bg-accent', iconClass: 'text-accent-foreground' },
};

export const AnnouncementCard: React.FC<AnnouncementCardProps> = ({ announcement, onEdit }) => {
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToast();
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const config = typeConfig[announcement.announcement_type as keyof typeof typeConfig] || typeConfig.info;
  const Icon = config.icon;

  const duplicateMutation = useMutation({
    mutationFn: () => duplicateAnnouncement(announcement.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.announcementsList(true) });
      showSuccess('Announcement duplicated successfully');
      setShowMenu(false);
    },
    onError: () => {
      showError('Failed to duplicate announcement');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: () => updateAnnouncement(announcement.id, { is_active: !announcement.is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.announcementsList(true) });
      showSuccess(announcement.is_active ? 'Announcement deactivated' : 'Announcement activated');
      setShowMenu(false);
    },
    onError: () => {
      showError('Failed to update announcement');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAnnouncement(announcement.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.announcementsList(true) });
      showSuccess('Announcement deleted successfully');
      setShowDeleteDialog(false);
    },
    onError: () => {
      showError('Failed to delete announcement');
    },
  });

  const getStatusBadge = () => {
    const now = new Date();
    const startsAt = announcement.start_date ? new Date(announcement.start_date) : null;
    const endsAt = announcement.end_date ? new Date(announcement.end_date) : null;

    if (!announcement.is_active) {
      return <Badge variant="default">Inactive</Badge>;
    }

    if (startsAt && startsAt > now) {
      return <Badge variant="info">Scheduled</Badge>;
    }

    if (endsAt && endsAt < now) {
      return <Badge variant="default">Expired</Badge>;
    }

    return <Badge variant="success">Active</Badge>;
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  return (
    <>
      <Card className="p-6 relative hover:shadow-lg transition-shadow">
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 ${config.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
            <Icon className={`w-6 h-6 ${config.iconClass}`} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900 mb-1">
                  {announcement.title_en}
                </h3>
                {announcement.title_ar && (
                  <p className="text-sm text-slate-500 mb-2" dir="rtl">
                    {announcement.title_ar}
                  </p>
                )}
              </div>

              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1 hover:bg-slate-100 rounded"
                >
                  <MoreVertical className="w-5 h-5 text-slate-400" />
                </button>

                {showMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowMenu(false)}
                    />
                    <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-20">
                      <button
                        onClick={() => {
                          onEdit(announcement);
                          setShowMenu(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                      >
                        <Edit2 className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => duplicateMutation.mutate()}
                        className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                      >
                        <Copy className="w-4 h-4" />
                        Duplicate
                      </button>
                      <button
                        onClick={() => toggleActiveMutation.mutate()}
                        className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                      >
                        <Power className="w-4 h-4" />
                        {announcement.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => {
                          setShowDeleteDialog(true);
                          setShowMenu(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-danger hover:bg-danger-muted flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              {truncateText(announcement.content_en || '', 120)}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              {getStatusBadge()}
              <Badge variant="default">{announcement.target_audience?.toUpperCase()}</Badge>
              {announcement.show_as_banner && (
                <Badge variant="info" className="flex items-center gap-1">
                  <Megaphone className="w-3 h-3" />
                  Banner
                </Badge>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span>
                {announcement.start_date ? new Date(announcement.start_date).toLocaleDateString() : '-'}
                {announcement.end_date && ` - ${new Date(announcement.end_date).toLocaleDateString()}`}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete Announcement"
        message="Are you sure you want to delete this announcement? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
      />
    </>
  );
};
