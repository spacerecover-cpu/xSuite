import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Loader2 } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Textarea } from '../../ui/Textarea';
import { SearchableSelect } from '../../ui/SearchableSelect';
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
  const firstFieldRef = useRef<HTMLInputElement>(null);

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

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={announcement ? 'Edit Announcement' : 'Create Announcement'}
      subtitle={announcement ? 'Update this announcement.' : 'Compose an announcement to broadcast to tenants.'}
      icon={Megaphone}
      titleSize="sm"
      maxWidth="7xl"
      showClose
      closeOnBackdrop={false}
      initialFocusRef={firstFieldRef}
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <Button type="button" variant="secondary" size="sm" className="text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="announcementForm" size="sm" className="text-xs" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>{announcement ? 'Update' : 'Create'} Announcement</>
            )}
          </Button>
        </div>
      }
    >
      <form id="announcementForm" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-8">
          <div className="space-y-6">
            <h3 className="text-sm font-semibold text-slate-900">Announcement Details</h3>

            <Input
              ref={firstFieldRef}
              label="Title (English)"
              floatingLabel
              value={titleEn}
              onChange={(e) => setTitleEn(e.target.value)}
              placeholder="Enter announcement title"
              required
            />

            <Input
              label="Title (Arabic)"
              floatingLabel
              value={titleAr}
              onChange={(e) => setTitleAr(e.target.value)}
              placeholder="أدخل عنوان الإعلان"
              dir="rtl"
            />

            <Textarea
              label="Content (English)"
              floatingLabel
              value={contentEn}
              onChange={(e) => setContentEn(e.target.value)}
              placeholder="Enter announcement content"
              rows={4}
              required
              className="resize-none"
            />

            <Textarea
              label="Content (Arabic)"
              floatingLabel
              value={contentAr}
              onChange={(e) => setContentAr(e.target.value)}
              placeholder="أدخل محتوى الإعلان"
              rows={4}
              dir="rtl"
              className="resize-none"
            />

            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
              <SearchableSelect
                label="Type"
                floatingLabel
                shrinkDefaultValue
                usePortal
                value={type}
                onChange={(v) => setType(v)}
                options={[
                  { id: 'info', name: 'Info' },
                  { id: 'warning', name: 'Warning' },
                  { id: 'maintenance', name: 'Maintenance' },
                  { id: 'feature', name: 'Feature' },
                  { id: 'promotion', name: 'Promotion' },
                ]}
                placeholder="Select type"
              />

              <SearchableSelect
                label="Target Audience"
                floatingLabel
                shrinkDefaultValue
                usePortal
                value={targetAudience}
                onChange={(v) => setTargetAudience(v)}
                options={[
                  { id: 'all', name: 'All' },
                  { id: 'starter', name: 'Starter' },
                  { id: 'professional', name: 'Professional' },
                  { id: 'enterprise', name: 'Enterprise' },
                  { id: 'trial', name: 'Trial' },
                ]}
                placeholder="Select audience"
              />
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
                <label htmlFor="announcement-starts-at" className="block text-sm font-medium text-slate-700 mb-1">
                  Starts At <span className="text-danger">*</span>
                </label>
                <input
                  id="announcement-starts-at"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  required
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label htmlFor="announcement-ends-at" className="block text-sm font-medium text-slate-700 mb-1">Ends At (optional)</label>
                <input
                  id="announcement-ends-at"
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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
            <h3 className="text-sm font-semibold text-slate-900">Live Preview</h3>
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
      </form>
    </Modal>
  );
};
