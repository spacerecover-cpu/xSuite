import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  ChevronLeft,
  Mail,
  MessageCircle,
  MessageSquare,
  Smartphone,
  Clock,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';
import {
  fetchMySubscriptions,
  upsertSubscription,
  updateSubscription,
  type NotificationChannel,
  type NotificationFrequency,
  type NotificationSubscriptionRow,
} from '../../lib/notificationPreferencesService';
import { NotificationTemplatesTab } from './NotificationTemplatesTab';

// ---------------------------------------------------------------------------
// Event catalog: stable list of event_types the matrix renders, grouped for UI.
// Friendly labels per spec. Add new events here as backend wires them up.
// ---------------------------------------------------------------------------
interface EventDefinition {
  eventType: string;
  label: string;
  description?: string;
  /**
   * Optional role gate — if set, only users whose role is in this list see
   * the row. Owners and admins always see all rows.
   */
  allowedRoles?: ReadonlyArray<NonNullable<UserRole>>;
}

interface EventGroup {
  id: string;
  title: string;
  events: EventDefinition[];
}

type UserRole =
  | 'owner'
  | 'admin'
  | 'manager'
  | 'technician'
  | 'sales'
  | 'accounts'
  | 'hr'
  | 'viewer'
  | null;

const EVENT_GROUPS: EventGroup[] = [
  {
    id: 'cases',
    title: 'Cases',
    events: [
      {
        eventType: 'case.phase_changed',
        label: "Case status changes (your team's cases)",
      },
      {
        eventType: 'case.sla_breach',
        label: 'SLA breach alerts',
        allowedRoles: ['owner', 'admin', 'manager', 'technician'],
      },
      {
        eventType: 'case.follow_up_due',
        label: 'Scheduled follow-up due',
      },
    ],
  },
  {
    id: 'quotes',
    title: 'Quotes',
    events: [
      {
        eventType: 'quote.expiring_soon',
        label: 'Quotes about to expire',
        allowedRoles: ['owner', 'admin', 'manager', 'sales', 'accounts'],
      },
    ],
  },
  {
    id: 'invoices',
    title: 'Invoices & Payments',
    events: [
      {
        eventType: 'invoice.overdue.7d',
        label: 'Invoices overdue 7+ days',
        allowedRoles: ['owner', 'admin', 'manager', 'accounts'],
      },
      {
        eventType: 'invoice.overdue.14d',
        label: 'Invoices overdue 14+ days (escalation)',
        allowedRoles: ['owner', 'admin', 'manager', 'accounts'],
      },
      {
        eventType: 'invoice.overdue.30d',
        label: 'Invoices URGENT (30+ days)',
        allowedRoles: ['owner', 'admin', 'manager', 'accounts'],
      },
      {
        eventType: 'payment.received',
        label: 'Payment received',
        allowedRoles: ['owner', 'admin', 'manager', 'accounts'],
      },
    ],
  },
  {
    id: 'inventory',
    title: 'Inventory & Stock',
    events: [
      {
        eventType: 'inventory.low_stock',
        label: 'Stock running low',
        allowedRoles: ['owner', 'admin', 'manager', 'technician', 'accounts'],
      },
      {
        eventType: 'inventory.out_of_stock',
        label: 'Item out of stock',
        allowedRoles: ['owner', 'admin', 'manager', 'technician', 'accounts'],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Channels — only in_app and email are interactive today. The rest render as
// disabled "Coming soon" cells.
// ---------------------------------------------------------------------------
interface ChannelDefinition {
  channel: NotificationChannel;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
}

const CHANNELS: ChannelDefinition[] = [
  { channel: 'in_app', label: 'In-App', icon: Bell },
  { channel: 'email', label: 'Email', icon: Mail },
  { channel: 'sms', label: 'SMS', icon: MessageSquare, comingSoon: true },
  {
    channel: 'whatsapp',
    label: 'WhatsApp',
    icon: MessageCircle,
    comingSoon: true,
  },
  { channel: 'push', label: 'Push', icon: Smartphone, comingSoon: true },
];

const FREQUENCY_OPTIONS: ReadonlyArray<{
  value: NotificationFrequency;
  label: string;
}> = [
  { value: 'immediate', label: 'Immediate' },
  { value: 'hourly_digest', label: 'Hourly digest' },
  { value: 'daily_digest', label: 'Daily digest' },
  { value: 'off', label: 'Off' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const SUBS_QUERY_KEY = (userId: string) =>
  ['notification_subscriptions', 'me', userId] as const;

function findSubscription(
  subs: NotificationSubscriptionRow[],
  eventType: string,
  channel: NotificationChannel
): NotificationSubscriptionRow | undefined {
  return subs.find(
    (s) => s.event_type === eventType && s.channel === channel
  );
}

function buildEventDefaults(
  subs: NotificationSubscriptionRow[],
  eventType: string
): {
  frequency: NotificationFrequency;
  quietStart: string;
  quietEnd: string;
} {
  // Prefer in_app sub for frequency/quiet hours; fall back to first found.
  const inApp = findSubscription(subs, eventType, 'in_app');
  const email = findSubscription(subs, eventType, 'email');
  const reference = inApp ?? email;

  return {
    frequency: (reference?.frequency as NotificationFrequency) ?? 'immediate',
    quietStart: reference?.quiet_hours_start?.slice(0, 5) ?? '',
    quietEnd: reference?.quiet_hours_end?.slice(0, 5) ?? '',
  };
}

function isEventVisibleForRole(
  event: EventDefinition,
  role: UserRole
): boolean {
  if (!event.allowedRoles || event.allowedRoles.length === 0) return true;
  if (role === 'owner' || role === 'admin') return true;
  if (!role) return false;
  return event.allowedRoles.includes(role);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const NotificationPreferences: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user, profile } = useAuth();

  const userId = user?.id ?? '';
  const role = (profile?.role ?? null) as UserRole;
  const canManageTemplates = role === 'owner' || role === 'admin';

  const [activeTab, setActiveTab] = useState<'preferences' | 'templates'>('preferences');
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  const { data: subscriptions, isLoading, error } = useQuery({
    queryKey: SUBS_QUERY_KEY(userId),
    queryFn: () => fetchMySubscriptions(userId),
    enabled: !!userId,
  });

  const visibleGroups = useMemo<EventGroup[]>(() => {
    return EVENT_GROUPS
      .map((group) => ({
        ...group,
        events: group.events.filter((e) => isEventVisibleForRole(e, role)),
      }))
      .filter((g) => g.events.length > 0);
  }, [role]);

  const subs = subscriptions ?? [];

  const markPending = (key: string, on: boolean) => {
    setPendingKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  // -----------------------------------------------------------------------
  // Toggle a single channel for an event.
  // -----------------------------------------------------------------------
  const toggleMutation = useMutation({
    mutationFn: async (vars: {
      eventType: string;
      channel: NotificationChannel;
      nextEnabled: boolean;
    }) => {
      const existing = findSubscription(subs, vars.eventType, vars.channel);
      if (existing) {
        return updateSubscription(existing.id, { enabled: vars.nextEnabled });
      }
      const defaults = buildEventDefaults(subs, vars.eventType);
      return upsertSubscription({
        userId,
        eventType: vars.eventType,
        channel: vars.channel,
        enabled: vars.nextEnabled,
        frequency: defaults.frequency,
        quietHoursStart: defaults.quietStart || null,
        quietHoursEnd: defaults.quietEnd || null,
      });
    },
    onMutate: (vars) => {
      const key = `${vars.eventType}|${vars.channel}`;
      markPending(key, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUBS_QUERY_KEY(userId) });
    },
    onError: (err, vars) => {
      logger.error('Failed to toggle notification subscription', err);
      toast.error(
        `Could not update ${vars.eventType} (${vars.channel}). Please try again.`
      );
    },
    onSettled: (_data, _err, vars) => {
      const key = `${vars.eventType}|${vars.channel}`;
      markPending(key, false);
    },
  });

  // -----------------------------------------------------------------------
  // Frequency / quiet-hours mutation. Applies to ALL existing rows for the
  // event_type (in_app + email together). If no rows exist yet, it creates
  // an in_app row at enabled=true so future toggles inherit settings.
  // -----------------------------------------------------------------------
  const settingsMutation = useMutation({
    mutationFn: async (vars: {
      eventType: string;
      frequency: NotificationFrequency;
      quietStart: string;
      quietEnd: string;
    }) => {
      const rows = subs.filter((s) => s.event_type === vars.eventType);
      const patch = {
        frequency: vars.frequency,
        quiet_hours_start: vars.quietStart ? `${vars.quietStart}:00` : null,
        quiet_hours_end: vars.quietEnd ? `${vars.quietEnd}:00` : null,
      };
      if (rows.length === 0) {
        await upsertSubscription({
          userId,
          eventType: vars.eventType,
          channel: 'in_app',
          enabled: true,
          frequency: vars.frequency,
          quietHoursStart: patch.quiet_hours_start,
          quietHoursEnd: patch.quiet_hours_end,
        });
        return;
      }
      await Promise.all(
        rows.map((r) => updateSubscription(r.id, patch))
      );
    },
    onMutate: (vars) => {
      markPending(`${vars.eventType}|settings`, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUBS_QUERY_KEY(userId) });
      toast.success('Notification settings updated');
    },
    onError: (err) => {
      logger.error('Failed to update notification settings', err);
      toast.error('Could not save settings. Please try again.');
    },
    onSettled: (_d, _e, vars) => {
      markPending(`${vars.eventType}|settings`, false);
    },
  });

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Loading user session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <button
        onClick={() => navigate('/settings')}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-all hover:gap-3 font-medium"
      >
        <ChevronLeft className="w-5 h-5" />
        <span>Back to Settings</span>
      </button>

      <div className="mb-8 flex items-start gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, rgb(var(--color-primary)) 0%, rgb(var(--color-cat-1)) 100%)',
          }}
        >
          <Bell className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 mb-1">
            Notifications
          </h1>
          <p className="text-slate-600 text-sm">
            {activeTab === 'templates'
              ? 'Customize the automatic emails this lab sends when events happen.'
              : 'Choose which events notify you, and on which channels. Settings are personal to your account.'}
          </p>
        </div>
      </div>

      {canManageTemplates && (
        <div className="mb-6 border-b border-slate-200 flex gap-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'preferences'}
            onClick={() => setActiveTab('preferences')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'preferences'
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            My Preferences
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'templates'}
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'templates'
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Email Templates
          </button>
        </div>
      )}

      {activeTab === 'templates' && canManageTemplates && <NotificationTemplatesTab />}

      {activeTab === 'preferences' && isLoading && (
        <div className="bg-white rounded-lg border border-slate-200 p-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400 mr-3" />
          <span className="text-slate-500 text-sm">
            Loading your preferences...
          </span>
        </div>
      )}

      {activeTab === 'preferences' && error && (
        <div className="bg-danger-muted border border-danger/30 rounded-lg p-4 text-sm text-danger">
          Failed to load notification preferences. Please refresh the page.
        </div>
      )}

      {activeTab === 'preferences' && !isLoading && !error && (
        <div className="space-y-6">
          {visibleGroups.length === 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-500 text-sm">
              No notification events are available for your role.
            </div>
          )}

          {visibleGroups.map((group) => (
            <section
              key={group.id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
            >
              <header className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                <h2 className="text-base font-semibold text-slate-900">
                  {group.title}
                </h2>
              </header>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/60 text-slate-600">
                      <th className="text-left font-semibold px-6 py-3 w-[36%]">
                        Event
                      </th>
                      {CHANNELS.map((ch) => (
                        <th
                          key={ch.channel}
                          className="text-center font-semibold px-3 py-3 w-[8%]"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <ch.icon className="w-4 h-4" />
                            <span className="text-xs">{ch.label}</span>
                          </div>
                        </th>
                      ))}
                      <th className="text-left font-semibold px-4 py-3">
                        Frequency
                      </th>
                      <th className="text-left font-semibold px-4 py-3">
                        Quiet Hours
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.events.map((event) => {
                      const defaults = buildEventDefaults(
                        subs,
                        event.eventType
                      );
                      const settingsKey = `${event.eventType}|settings`;
                      const settingsPending = pendingKeys.has(settingsKey);

                      return (
                        <EventRow
                          key={event.eventType}
                          event={event}
                          subs={subs}
                          defaults={defaults}
                          pendingKeys={pendingKeys}
                          onToggleChannel={(channel, nextEnabled) =>
                            toggleMutation.mutate({
                              eventType: event.eventType,
                              channel,
                              nextEnabled,
                            })
                          }
                          onSaveSettings={(frequency, quietStart, quietEnd) =>
                            settingsMutation.mutate({
                              eventType: event.eventType,
                              frequency,
                              quietStart,
                              quietEnd,
                            })
                          }
                          settingsPending={settingsPending}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          <div className="bg-info-muted border-l-4 border-info rounded-lg p-4 text-sm text-info">
            <p className="font-semibold mb-1">How this works</p>
            <p>
              Toggle a cell to enable or disable a channel for that event.
              Frequency and quiet hours apply to all channels for that event.
              Changes save automatically.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Row sub-component — keeps frequency / quiet-hours edit state local so
// editing one row doesn't trigger re-renders of others.
// ---------------------------------------------------------------------------
interface EventRowProps {
  event: EventDefinition;
  subs: NotificationSubscriptionRow[];
  defaults: {
    frequency: NotificationFrequency;
    quietStart: string;
    quietEnd: string;
  };
  pendingKeys: Set<string>;
  onToggleChannel: (
    channel: NotificationChannel,
    nextEnabled: boolean
  ) => void;
  onSaveSettings: (
    frequency: NotificationFrequency,
    quietStart: string,
    quietEnd: string
  ) => void;
  settingsPending: boolean;
}

const EventRow: React.FC<EventRowProps> = ({
  event,
  subs,
  defaults,
  pendingKeys,
  onToggleChannel,
  onSaveSettings,
  settingsPending,
}) => {
  const [frequency, setFrequency] = useState<NotificationFrequency>(
    defaults.frequency
  );
  const [quietStart, setQuietStart] = useState(defaults.quietStart);
  const [quietEnd, setQuietEnd] = useState(defaults.quietEnd);

  // Re-sync if remote state changes (after invalidation).
  React.useEffect(() => {
    setFrequency(defaults.frequency);
    setQuietStart(defaults.quietStart);
    setQuietEnd(defaults.quietEnd);
  }, [defaults.frequency, defaults.quietStart, defaults.quietEnd]);

  const isDirty =
    frequency !== defaults.frequency ||
    quietStart !== defaults.quietStart ||
    quietEnd !== defaults.quietEnd;

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/40">
      <td className="px-6 py-4 align-top">
        <div className="font-medium text-slate-900">{event.label}</div>
        {event.description && (
          <div className="text-xs text-slate-500 mt-1">
            {event.description}
          </div>
        )}
        <div className="text-[11px] text-slate-400 mt-1 font-mono">
          {event.eventType}
        </div>
      </td>

      {CHANNELS.map((ch) => {
        const sub = findSubscription(subs, event.eventType, ch.channel);
        const enabled = sub?.enabled ?? false;
        const cellKey = `${event.eventType}|${ch.channel}`;
        const cellPending = pendingKeys.has(cellKey);

        if (ch.comingSoon) {
          return (
            <td
              key={ch.channel}
              className="px-3 py-4 text-center align-middle"
            >
              <span
                className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-medium text-slate-400 bg-slate-100 cursor-not-allowed"
                title="Coming soon"
              >
                Soon
              </span>
            </td>
          );
        }

        return (
          <td
            key={ch.channel}
            className="px-3 py-4 text-center align-middle"
          >
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={`${ch.label} for ${event.label}`}
              disabled={cellPending}
              onClick={() => onToggleChannel(ch.channel, !enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${
                enabled ? 'bg-primary' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
              {cellPending && (
                <Loader2 className="absolute -right-5 top-1 w-3 h-3 animate-spin text-slate-400" />
              )}
            </button>
          </td>
        );
      })}

      <td className="px-4 py-4 align-middle">
        <select
          value={frequency}
          onChange={(e) =>
            setFrequency(e.target.value as NotificationFrequency)
          }
          className="px-2 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {FREQUENCY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </td>

      <td className="px-4 py-4 align-middle">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <input
            type="time"
            value={quietStart}
            onChange={(e) => setQuietStart(e.target.value)}
            className="px-2 py-1.5 border border-slate-300 rounded-md text-sm w-24 focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Quiet hours start"
          />
          <span className="text-slate-400 text-xs">to</span>
          <input
            type="time"
            value={quietEnd}
            onChange={(e) => setQuietEnd(e.target.value)}
            className="px-2 py-1.5 border border-slate-300 rounded-md text-sm w-24 focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Quiet hours end"
          />
          {(isDirty || settingsPending) && (
            <button
              type="button"
              onClick={() => onSaveSettings(frequency, quietStart, quietEnd)}
              disabled={settingsPending || !isDirty}
              className="px-2 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {settingsPending && <Loader2 className="w-3 h-3 animate-spin" />}
              Save
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};

export default NotificationPreferences;
