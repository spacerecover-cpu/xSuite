import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, X } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';

// Short relative-time formatter (avoids pulling date-fns just for this).
// "5m ago", "2h ago", "3d ago". Falls back to ISO date for >30 days.
function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return date.toLocaleDateString();
}

// Bell icon + dropdown panel showing recent in-app notifications.
// Mounted in the AppLayout top bar. Realtime-driven via useNotifications.
export function NotificationBell() {
  const navigate = useNavigate();
  const { notifications, unreadCount, isLoading, markAsRead, markAllRead, dismiss } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  const handleClick = (n: typeof notifications[number]) => {
    if (!n.is_read) markAsRead(n.id);
    if (n.link_url) {
      navigate(n.link_url);
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
        aria-label={`Notifications (${unreadCount} unread)`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-danger px-1 text-xxs font-bold leading-none text-danger-foreground">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-modal mt-2 w-96 max-w-[calc(100vw-2rem)] origin-top-right rounded-lg border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
            <div className="flex items-center gap-3">
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={() => markAllRead()}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  navigate('/notifications');
                  setOpen(false);
                }}
                className="text-xs font-medium text-slate-500 hover:text-primary hover:underline"
              >
                View all
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                You're all caught up.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    className={`group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 ${
                      n.is_read ? '' : 'bg-info-muted/30'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleClick(n)}
                      className="flex-1 text-left"
                    >
                      {n.title ? (
                        <div className="text-sm font-medium text-slate-900">{n.title}</div>
                      ) : null}
                      {n.body ? (
                        <div className="mt-0.5 text-xs text-slate-600 line-clamp-2">{n.body}</div>
                      ) : null}
                      <div className="mt-1 text-xs text-slate-400">
                        {formatRelative(new Date(n.created_at))}
                      </div>
                    </button>
                    <div className="flex flex-col items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {!n.is_read ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(n.id);
                          }}
                          title="Mark as read"
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismiss(n.id);
                        }}
                        title="Dismiss"
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
