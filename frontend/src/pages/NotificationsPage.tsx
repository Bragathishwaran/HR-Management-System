import { useMemo, useState } from "react";
import {
  Bell,
  BellRing,
  CalendarCheck2,
  Check,
  CheckCheck,
  CreditCard,
  Info,
  MailOpen,
  RefreshCw,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import { useResource } from "../hooks/useResource";
import { endpoints } from "../lib/api";
import { timeAgo } from "../lib/format";
import type { NotificationItem } from "../types";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "../components/UI";

function notificationIcon(item: NotificationItem) {
  const value = `${item.title} ${item.message}`.toLowerCase();
  if (value.includes("payroll") || value.includes("salary")) return CreditCard;
  if (value.includes("leave")) return CalendarCheck2;
  if (value.includes("late") || value.includes("absent")) return BellRing;
  return Info;
}

export function NotificationsPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [markingAll, setMarkingAll] = useState(false);

  const resource = useResource(() => endpoints.notifications({ limit: 100 }), []);
  const notifications = resource.data?.items || [];
  const unread = resource.data?.unread || 0;

  const filtered = useMemo(
    () => (filter === "unread" ? notifications.filter((item) => !item.is_read) : notifications),
    [notifications, filter],
  );

  const markRead = async (item: NotificationItem) => {
    if (item.is_read) return;
    try {
      await endpoints.markNotificationRead(item.id);
      resource.refresh();
      window.dispatchEvent(new Event("worksphere:notifications"));
    } catch (error) {
      toast.error("Could not mark as read", (error as Error).message);
    }
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      const result = await endpoints.markAllNotificationsRead();
      toast.success("All caught up", result.updated ? `${result.updated} notifications marked read.` : "Nothing was unread.");
      resource.refresh();
      window.dispatchEvent(new Event("worksphere:notifications"));
    } catch (error) {
      toast.error("Could not mark notifications", (error as Error).message);
    } finally {
      setMarkingAll(false);
    }
  };

  if (resource.loading && !resource.data) {
    return <LoadingState label="Fetching your notifications…" />;
  }
  if (resource.error) {
    return <ErrorState message={resource.error} onRetry={resource.refresh} />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Your updates"
        title="Notifications"
        description="Leave decisions, payroll runs and attendance alerts — all in one place."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RefreshCw size={16} />}
              onClick={resource.refresh}
              loading={resource.loading}
            >
              Refresh
            </Button>
            <Button
              icon={<CheckCheck size={16} />}
              onClick={markAll}
              loading={markingAll}
              disabled={unread === 0}
            >
              Mark all read
            </Button>
          </>
        }
      />

      <section className="notification-stats">
        <div className="notification-stat">
          <span className="icon-tile icon-tile-amber">
            <Bell size={18} />
          </span>
          <div>
            <strong>{unread}</strong>
            <span>Unread updates</span>
          </div>
        </div>
        <div className="notification-stat">
          <span className="icon-tile icon-tile-green">
            <MailOpen size={18} />
          </span>
          <div>
            <strong>{notifications.length}</strong>
            <span>Total notifications</span>
          </div>
        </div>
        <div className="notification-tabs">
          <button
            type="button"
            className={filter === "all" ? "is-active" : ""}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={filter === "unread" ? "is-active" : ""}
            onClick={() => setFilter("unread")}
          >
            Unread {unread > 0 && <span>{unread}</span>}
          </button>
        </div>
      </section>

      {filtered.length === 0 ? (
        <section className="card">
          <EmptyState
            icon={filter === "unread" ? CheckCheck : Bell}
            title={filter === "unread" ? "You’re all caught up" : "No notifications yet"}
            description={
              filter === "unread"
                ? "There are no unread updates waiting for you."
                : "Leave decisions, payroll updates and attendance alerts will land here."
            }
            action={
              filter === "unread" ? (
                <Button variant="secondary" size="sm" onClick={() => setFilter("all")}>
                  View all notifications
                </Button>
              ) : undefined
            }
          />
        </section>
      ) : (
        <section className="notification-page-list">
          {filtered.map((item) => {
            const Icon = notificationIcon(item);
            return (
              <article
                key={item.id}
                className={`notification-card ${item.is_read ? "is-read" : "is-unread"}`}
              >
                <span className="notification-card-icon">
                  <Icon size={19} />
                </span>
                <div className="notification-card-copy">
                  <div>
                    <strong>{item.title}</strong>
                    {!item.is_read && <Badge tone="green">New</Badge>}
                  </div>
                  <p>{item.message}</p>
                  <span>{timeAgo(item.created_at)}</span>
                </div>
                {!item.is_read ? (
                  <button
                    type="button"
                    className="mark-read-button"
                    onClick={() => markRead(item)}
                  >
                    <Check size={15} /> Mark read
                  </button>
                ) : (
                  <span className="read-tag">
                    <CheckCheck size={15} /> Read
                  </span>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
