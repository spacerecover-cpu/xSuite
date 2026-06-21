import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Megaphone } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { AnnouncementCard } from '../../components/platform-admin/announcements/AnnouncementCard';
import { AnnouncementFormModal } from '../../components/platform-admin/announcements/AnnouncementFormModal';
import { getAnnouncements } from '../../lib/platformAdminService';
import { platformAdminKeys } from '../../lib/queryKeys';
import type { Database } from '../../types/database.types';

type PlatformAnnouncement = Database['public']['Tables']['platform_announcements']['Row'];
type TabType = 'active' | 'scheduled' | 'expired' | 'all';

const tabs: Array<{ id: TabType; label: string }> = [
  { id: 'active', label: 'Active' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'expired', label: 'Expired' },
  { id: 'all', label: 'All' },
];

export const AnnouncementsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<PlatformAnnouncement | undefined>();

  const { data: allAnnouncements = [], isLoading } = useQuery({
    queryKey: platformAdminKeys.announcementsList(true),
    queryFn: () => getAnnouncements(true),
  });

  const filterAnnouncements = (announcements: PlatformAnnouncement[]): PlatformAnnouncement[] => {
    const now = new Date();

    switch (activeTab) {
      case 'active':
        return announcements.filter(a => {
          const startsAt = a.start_date ? new Date(a.start_date) : null;
          const endsAt = a.end_date ? new Date(a.end_date) : null;
          return a.is_active && (!startsAt || startsAt <= now) && (!endsAt || endsAt > now);
        });

      case 'scheduled':
        return announcements.filter(a => {
          const startsAt = a.start_date ? new Date(a.start_date) : null;
          return a.is_active && startsAt && startsAt > now;
        });

      case 'expired':
        return announcements.filter(a => {
          const endsAt = a.end_date ? new Date(a.end_date) : null;
          return endsAt && endsAt < now;
        });

      case 'all':
      default:
        return announcements;
    }
  };

  const filteredAnnouncements = filterAnnouncements(allAnnouncements);

  const handleEdit = (announcement: PlatformAnnouncement) => {
    setEditingAnnouncement(announcement);
    setShowFormModal(true);
  };

  const handleCloseModal = () => {
    setShowFormModal(false);
    setEditingAnnouncement(undefined);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-900">Announcements</h1>
        <Button onClick={() => setShowFormModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Announcement
        </Button>
      </div>

      <div className="border-b border-slate-200">
        <nav className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : filteredAnnouncements.length === 0 ? (
        <div className="text-center py-12">
          <Megaphone className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">No announcements found</p>
          {activeTab !== 'all' && (
            <p className="text-sm text-slate-400 mt-2">
              Try switching to a different tab or create a new announcement
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAnnouncements.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}

      <AnnouncementFormModal
        isOpen={showFormModal}
        onClose={handleCloseModal}
        announcement={editingAnnouncement}
      />
    </div>
  );
};
