import { useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { logger } from '../lib/logger';
import { useAuth } from '../contexts/AuthContext';
import type { Database } from '../types/database.types';

export type NotificationRow = Database['public']['Tables']['notification_log']['Row'];

interface UseNotificationsResult {
  notifications: NotificationRow[];
  unreadCount: number;
  isLoading: boolean;
  markAsRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
}

const NOTIFICATIONS_KEY = ['notifications', 'in_app'] as const;
const MAX_VISIBLE = 50;

// Subscribe to in-app notifications for the current user. Uses TanStack Query
// for the initial fetch + cache, and Supabase Realtime for live updates.
export function useNotifications(): UseNotificationsResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: [...NOTIFICATIONS_KEY, userId],
    queryFn: async (): Promise<NotificationRow[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('notification_log')
        .select('*')
        .eq('recipient_user_id', userId)
        .eq('channel', 'in_app')
        .is('dismissed_at', null)
        .order('created_at', { ascending: false })
        .limit(MAX_VISIBLE);
      if (error) {
        logger.error('Failed to fetch notifications', error);
        throw error;
      }
      return (data ?? []) as NotificationRow[];
    },
    enabled: Boolean(userId),
    staleTime: 30_000,
  });

  // Unread count is fetched independently of the 50-row display window so the
  // badge reflects the true total (e.g. can exceed MAX_VISIBLE / 99+) and never
  // reads 0 while unread rows exist beyond the newest 50. Uses a head+count
  // query (no rows transferred). Its query key is a child of the display key so
  // every existing invalidation (realtime + mutations) refreshes it too.
  const { data: unreadCount = 0 } = useQuery({
    queryKey: [...NOTIFICATIONS_KEY, userId, 'unread-count'],
    queryFn: async (): Promise<number> => {
      if (!userId) return 0;
      const { count, error } = await supabase
        .from('notification_log')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_user_id', userId)
        .eq('channel', 'in_app')
        .is('dismissed_at', null)
        .eq('is_read', false);
      if (error) {
        logger.error('Failed to fetch unread notification count', error);
        throw error;
      }
      return count ?? 0;
    },
    enabled: Boolean(userId),
    staleTime: 30_000,
  });

  // Realtime subscription: any change to notification_log rows owned by this
  // user invalidates the cache. Cheap because RLS already filters server-side.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notification_log:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notification_log',
          filter: `recipient_user_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: [...NOTIFICATIONS_KEY, userId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notification_log')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...NOTIFICATIONS_KEY, userId] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!userId) return;
      const { error } = await supabase
        .from('notification_log')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('recipient_user_id', userId)
        .eq('is_read', false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...NOTIFICATIONS_KEY, userId] });
    },
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notification_log')
        .update({ dismissed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...NOTIFICATIONS_KEY, userId] });
    },
  });

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead: (id) => markAsRead.mutate(id),
    markAllRead: () => markAllRead.mutate(),
    dismiss: (id) => dismiss.mutate(id),
  };
}
