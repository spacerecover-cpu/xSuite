import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Info, AlertTriangle, Construction, Sparkles, Tag, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { getActiveAnnouncementsForUser, dismissAnnouncement } from '../../lib/platformAdminService';
import { platformAdminKeys } from '../../lib/queryKeys';

const typeConfig = {
  info: { icon: Info, color: 'bg-info text-info-foreground' },
  warning: { icon: AlertTriangle, color: 'bg-warning text-warning-foreground' },
  maintenance: { icon: Construction, color: 'bg-danger text-danger-foreground' },
  feature: { icon: Sparkles, color: 'bg-success text-success-foreground' },
  promotion: { icon: Tag, color: 'bg-accent text-accent-foreground' },
};

export const AnnouncementBanner: React.FC = () => {
  const { i18n } = useTranslation();
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [localDismissed, setLocalDismissed] = useState<Set<string>>(new Set());

  const planCode = profile?.tenant_id ? 'professional' : 'starter';

  const { data: announcements = [] } = useQuery({
    queryKey: platformAdminKeys.activeAnnouncements(user?.id || '', planCode),
    queryFn: () => getActiveAnnouncementsForUser(user?.id || '', planCode),
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000,
  });

  const dismissMutation = useMutation({
    mutationFn: (announcementId: string) => dismissAnnouncement(announcementId, user?.id || ''),
    onSuccess: (_, announcementId) => {
      setLocalDismissed(prev => new Set(prev).add(announcementId));
      queryClient.invalidateQueries({
        queryKey: platformAdminKeys.activeAnnouncements(user?.id || '', planCode)
      });
    },
  });

  const handleDismiss = (announcementId: string) => {
    setLocalDismissed(prev => new Set(prev).add(announcementId));
    dismissMutation.mutate(announcementId);
  };

  const visibleAnnouncements = announcements.filter(a => !localDismissed.has(a.id));

  if (visibleAnnouncements.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {visibleAnnouncements.map((announcement) => {
        const config = typeConfig[announcement.announcement_type as keyof typeof typeConfig] || typeConfig.info;
        const Icon = config.icon;

        const isArabic = i18n.language === 'ar';
        const title = isArabic && announcement.title_ar ? announcement.title_ar : announcement.title_en;
        const content = isArabic && announcement.content_ar ? announcement.content_ar : announcement.content_en;

        return (
          <div
            key={announcement.id}
            className={`${config.color} px-4 py-3 flex items-start gap-3`}
            dir={isArabic ? 'rtl' : 'ltr'}
          >
            <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm mb-1">{title}</h4>
              <p className="text-sm opacity-95">{content}</p>
            </div>
            {announcement.is_dismissible && (
              <button
                onClick={() => handleDismiss(announcement.id)}
                className="flex-shrink-0 hover:opacity-75 transition-opacity"
                aria-label="Dismiss"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
