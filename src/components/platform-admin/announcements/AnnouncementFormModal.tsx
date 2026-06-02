import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { AnnouncementPreview } from './AnnouncementPreview';
import { createAnnouncement, updateAnnouncement } from '@/lib/platformAdminService';
import { platformAdminKeys } from '@/lib/queryKeys';
import { usePlatformAdmin } from '@/contexts/PlatformAdminContext';
import { useToast } from '@/hooks/useToast';
import type { Database } from '@/types/database.types';

type PlatformAnnouncement = Database['public']['Tables']['platform_announcements']['Row'];

interface AnnouncementFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  announcement?: PlatformAnnouncement;
}

export const AnnouncementFormModal: React.FC<AnnouncementFormModalProps> = ({
  isOpen,
  onClose,
  announcement,
}) => {
  const { admin } = usePlatformAdmin();
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToast();

  const [titleEn, setTitleEn] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [contentEn, setContentEn] = useState('');
  const [contentAr, setContentAr] = useState('');
  const [type, setType] = useState('info');
  const [targetAudience, setTargetAudience] = useState('all');
  const [showAsBanner, setShowAsBanner] = useState(true);
  const [isDismissible, setIsDismissible] = useState(true);
  const [showInApp, setShowInApp] = useState(true);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (announcement) {
      setTitleEn(announcement.title_en || '');
      setTitleAr(announcement.title_ar || '');
      setContentEn(announcement.content_en || '');
      setContentAr(announcement.content_ar || '');
      setType(announcement.announcement_type || 'info');
      setTargetAudience(announcement.target_audience || 'all');
      setShowAsBanner(announcement.show_as_banner ?? true);
      setIsDismissible(announcement.is_dismissible ?? true);
      setShowInApp(announcement.show_in_app ?? true);
      setStartsAt(announcement.start_date ? new Date(announcement.start_date).toISOString().slice(0, 16) : '');
      setEndsAt(announcement.end_date ? new Date(announcement.end_date).toISOString().slice(0, 16) : '');
      setIsActive(announcement.is_active ?? true);
    } else {
      setTitleEn('');
      setTitleAr('');
      setContentEn('');
      setContentAr('');
      setType('info');
      setTargetAudience('all');
      setShowAsBanner(true);
      setIsDismissible(true);
      setShowInApp(true);
      setStartsAt(new Date().toISOString().slice(0, 16));
      setEndsAt('');
      setIsActive(true);
    }
  }, [announcement, isOpen]);

  const createMutation = useMutation({
    mutationFn: () => {
      if (!admin) throw new Error('Not authenticated');
      return createAnnouncement({
        titleEn,
        titleAr: titleAr || undefined,
        contentEn,
        contentAr: contentAr || undefined,
        type,
        targetAudience,
        showAsBanner,
        isDismissible,
        startDate: startsAt ? new Date(startsAt).toISOString() : undefined,
        endDate: endsAt ? new Date(endsAt).toISOString() : undefined,
        createdBy: admin.user_id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.announcementsList(true) });
      showSuccess('Announcement created successfully');
      onClose();
    },
    onError: () => {
      showError('Failed to create announcement');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!announcement) throw new Error('No announcement to update');
      return updateAnnouncement(announcement.id, {
        title_en: titleEn,
        title_ar: titleAr || null,
        content_en: contentEn,
        content_ar: contentAr || null,
        announcement_type: type,
        target_audience: targetAudience,
        show_as_banner: showAsBanner,
        is_dismissible: isDismissible,
        show_in_app: showInApp,
        start_date: startsAt ? new Date(startsAt).toISOString() : new Date().toISOString(),
        end_date: endsAt ? new Date(endsAt).toISOString() : null,
        is_active: isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformAdminKeys.announcementsList(true) });
      showSuccess('Announcement updated successfully');
      onClose();
    },
    onError: () => {
      showError('Failed to update announcement');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!titleEn.trim()) {
      showError('Title (English) is required');
      return;
    }

    if (!contentEn.trim()) {
      showError('Content (English) is required');
      return;
    }

    if (!startsAt) {
      showError('Start date is required');
      return;
    }

    if (endsAt && new Date(endsAt) <= new Date(startsAt)) {
      showError('End date must be after start date');
      return;
    }

    if (announcement) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="7xl" closeOnBackdrop={false}>
      <form onSubmit={handleSubmit} className="flex flex-col h-[90vh]">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
          <h2 className="text-2xl font-bold text-slate-900">
            {announcement ? 'Edit Announcement' : 'Create Announcement'}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-900">Announcement Details</h3>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Title (English) <span className="text-danger">*</span>
                </label>
                <Input
                  value={titleEn}
                  onChange={(e) => setTitleEn(e.target.value)}
                  placeholder="Enter announcement title"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title (Arabic)</label>
                <Input
                  value={titleAr}
                  onChange={(e) => setTitleAr(e.target.value)}
                  placeholder="أدخل عنوان الإعلان"
                  dir="rtl"
                />
              </div>

              <div>
                <label htmlFor="announcement-content-en" className="block text-sm font-medium text-slate-700 mb-1">
                  Content (English) <span className="text-danger">*</span>
                </label>
                <textarea
                  id="announcement-content-en"
                  value={contentEn}
                  onChange={(e) => setContentEn(e.target.value)}
                  placeholder="Enter announcement content"
                  rows={4}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              <div>
                <label htmlFor="announcement-content-ar" className="block text-sm font-medium text-slate-700 mb-1">Content (Arabic)</label>
                <textarea
                  id="announcement-content-ar"
                  value={contentAr}
                  onChange={(e) => setContentAr(e.target.value)}
                  placeholder="أدخل محتوى الإعلان"
                  rows={4}
                  dir="rtl"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="feature">Feature</option>
                    <option value="promotion">Promotion</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Target Audience</label>
                  <select
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="all">All</option>
                    <option value="starter">Starter</option>
                    <option value="professional">Professional</option>
                    <option value="enterprise">Enterprise</option>
                    <option value="trial">Trial</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-medium text-slate-700">Display Settings</h4>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showAsBanner}
                    onChange={(e) => setShowAsBanner(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700">Show as Banner</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isDismissible}
                    onChange={(e) => setIsDismissible(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700">Dismissible</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showInApp}
                    onChange={(e) => setShowInApp(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700">Show in App</span>
                </label>
                <label className="flex items-center gap-2 opacity-50 cursor-not-allowed">
                  <input
                    type="checkbox"
                    disabled
                    className="rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700">Send Email</span>
                  <span className="text-xs text-slate-500">(Coming in Phase 4)</span>
                </label>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-medium text-slate-700">Schedule</h4>
                <div>
                  <label htmlFor="announcement-starts-at" className="block text-sm text-slate-600 mb-1">
                    Starts At <span className="text-danger">*</span>
                  </label>
                  <input
                    id="announcement-starts-at"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label htmlFor="announcement-ends-at" className="block text-sm text-slate-600 mb-1">Ends At (optional)</label>
                  <input
                    id="announcement-ends-at"
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span className="text-sm font-medium text-slate-700">Active</span>
                </label>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-900">Live Preview</h3>
              <div className="sticky top-0">
                <AnnouncementPreview
                  titleEn={titleEn}
                  titleAr={titleAr}
                  contentEn={contentEn}
                  contentAr={contentAr}
                  type={type}
                  showAsBanner={showAsBanner}
                  isDismissible={isDismissible}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-200">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {announcement ? 'Update' : 'Create'} Announcement
          </Button>
        </div>
      </form>
    </Modal>
  );
};
