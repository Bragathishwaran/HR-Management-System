import { useMemo, useState } from "react";
import {
  AlarmClock,
  Bell,
  BellRing,
  CalendarCheck2,
  CalendarClock,
  Check,
  CheckCheck,
  CreditCard,
  FileClock,
  Info,
  MailOpen,
  RefreshCw,
  Send,
  ShieldAlert,
  Star,
  Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useResource } from "../hooks/useResource";
import { endpoints } from "../lib/api";
import { formatDate, timeAgo } from "../lib/format";
import type { NotificationItem } from "../types";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Select,
  StatCard,
} from "../components/UI";

const categoryLabels: Record<string, string> = {
  ATTENDANCE: "Attendance",
  LEAVE: "Leave",
  PAYROLL: "Payroll",
  PERFORMANCE: "Performance",
  DOCUMENT: "Documents",
  SHIFT: "Shifts",
  AUTOMATION: "Automation",
};

function categoryLabel(value: string): string {
  return categoryLabels[value] || value.charAt(0) + value.slice(1).toLowerCase();
}

function notificationIcon(item: NotificationItem) {
  if (item.category === "PAYROLL") return CreditCard;
  if (item.category === "LEAVE") return CalendarCheck2;
  if (item.category === "DOCUMENT") return FileClock;
  if (item.category === "PERFORMANCE") return Star;
  if (item.category === "SHIFT") return Users;
  if (item.category === "AUTOMATION") return AlarmClock;
  if (item.category === "ATTENDANCE") return BellRing;
  const value = `${item.title} ${item.message}`.toLowerCase();
  if (value.includes("payroll") || value.includes("salary")) return CreditCard;
  if (value.includes("leave")) return CalendarCheck2;
  if (value.includes("late") || value.includes("absent")) return BellRing;
  return Info;
}

export function NotificationsPage() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const canManage = hasRole("HR", "ADMIN");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [category, setCategory] = useState("all");
  const [markingAll, setMarkingAll] = useState(false);
  const [running, setRunning] = useState<"late" | "document" | "all" | null>(null);

  const resource = useResource(async () => {
    const [notifications, alerts] = await Promise.all([
      endpoints.notifications({ limit: 200 }),
      canManage ? endpoints.alertSummary() : Promise.resolve(null),
    ]);
    return { notifications, alerts };
  }, [canManage]);

  const notifications = resource.data?.notifications.items || [];
  const unread = resource.data?.notifications.unread || 0;
  const alerts = resource.data?.alerts;

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    notifications.forEach((item) => {
      counts.set(item.category, (counts.get(item.category) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [notifications]);

  const filtered = useMemo(
    () =>
      notifications.filter((item) => {
        const matchesStatus = filter === "all" || !item.is_read;
        const matchesCategory = category === "all" || item.category === category;
        return matchesStatus && matchesCategory;
      }),
    [notifications, filter, category],
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
      toast.success(
        "All caught up",
        result.updated
          ? `${result.updated} notifications marked read.`
          : "Nothing was unread.",
      );
      resource.refresh();
      window.dispatchEvent(new Event("worksphere:notifications"));
    } catch (error) {
      toast.error("Could not mark notifications", (error as Error).message);
    } finally {
      setMarkingAll(false);
    }
  };

  const runAlerts = async (kind: "late" | "document" | "all") => {
    setRunning(kind);
    try {
      const result =
        kind === "late"
          ? await endpoints.runLateAlerts()
          : kind === "document"
            ? await endpoints.runDocumentExpiryAlerts()
            : await endpoints.runAllAlerts();
      toast.success("Smart alerts processed", result.message);
      resource.refresh();
      window.dispatchEvent(new Event("worksphere:notifications"));
    } catch (error) {
      toast.error("Could not run alerts", (error as Error).message);
    } finally {
      setRunning(null);
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
        description={
          canManage
            ? "Review workforce alerts and send timely nudges before issues grow."
            : "Leave decisions, payroll runs and attendance alerts — all in one place."
        }
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
            {canManage && (
              <Button
                icon={<ShieldAlert size={16} />}
                onClick={() => runAlerts("all")}
                loading={running === "all"}
                disabled={running !== null}
              >
                Run all alerts
              </Button>
            )}
            <Button
              variant={canManage ? "secondary" : "primary"}
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

      {canManage && alerts && (
        <>
          <section className="stats-grid">
            <StatCard
              label="Late today"
              value={alerts.late_today}
              meta="Check-ins after shift start"
              icon={AlarmClock}
              tone="amber"
            />
            <StatCard
              label="Leave in review"
              value={alerts.pending_leave_requests}
              meta="Waiting for a decision"
              icon={CalendarClock}
              tone="purple"
            />
            <StatCard
              label="Documents expiring"
              value={alerts.documents_expiring}
              meta="Within the warning window"
              icon={FileClock}
              tone="rose"
            />
            <StatCard
              label="Your unread"
              value={alerts.unread}
              meta={`${notifications.length} total notifications`}
              icon={Bell}
              tone="green"
            />
          </section>

          <section className="card alert-center">
            <div className="card-heading card-heading-inset">
              <div>
                <h2>Smart alert center</h2>
                <p>
                  Alerts are deduplicated per employee and event, so nobody gets the
                  same reminder twice.
                </p>
              </div>
              <span className="icon-tile icon-tile-amber">
                <ShieldAlert size={18} />
              </span>
            </div>

            <div className="alert-actions">
              <div className="alert-action">
                <span className="icon-tile icon-tile-amber">
                  <AlarmClock size={18} />
                </span>
                <div>
                  <strong>Late-arrival reminders</strong>
                  <span>Notify today’s late arrivals with their delay in minutes.</span>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Send size={15} />}
                  onClick={() => runAlerts("late")}
                  loading={running === "late"}
                  disabled={running !== null}
                >
                  Send
                </Button>
              </div>
              <div className="alert-action">
                <span className="icon-tile icon-tile-rose">
                  <FileClock size={18} />
                </span>
                <div>
                  <strong>Document expiry reminders</strong>
                  <span>
                    Nudge employees about IDs and certificates expiring soon.
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Send size={15} />}
                  onClick={() => runAlerts("document")}
                  loading={running === "document"}
                  disabled={running !== null}
                >
                  Send
                </Button>
              </div>
            </div>

            <div className="expiry-panel">
              <div className="expiry-panel-head">
                <div>
                  <strong>Upcoming document expiries</strong>
                  <span>
                    {alerts.upcoming_document_expiries.length} document
                    {alerts.upcoming_document_expiries.length === 1 ? "" : "s"} in the
                    warning window
                  </span>
                </div>
                <Badge tone={alerts.documents_expiring ? "amber" : "green"}>
                  {alerts.documents_expiring ? "Action needed" : "All clear"}
                </Badge>
              </div>
              {alerts.upcoming_document_expiries.length === 0 ? (
                <EmptyState
                  compact
                  icon={FileClock}
                  title="No expiring documents"
                  description="Renewal reminders will surface here as expiry dates approach."
                />
              ) : (
                <div className="expiry-list">
                  {alerts.upcoming_document_expiries.map((document) => (
                    <div key={document.id} className="expiry-item">
                      <span className="icon-tile icon-tile-rose">
                        <FileClock size={16} />
                      </span>
                      <div>
                        <strong>{document.file_name}</strong>
                        <span>
                          {document.employee_name || `Employee #${document.employee_id}`} ·{" "}
                          {document.document_type.replace("_", " ").toLowerCase()}
                        </span>
                      </div>
                      <Badge tone="amber">{formatDate(document.expiry_date)}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}

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
        <Select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label="Filter notifications by category"
          className="toolbar-select notification-category"
        >
          <option value="all">All categories</option>
          {categories.map(([value, count]) => (
            <option key={value} value={value}>
              {categoryLabel(value)} ({count})
            </option>
          ))}
        </Select>
      </section>

      {filtered.length === 0 ? (
        <section className="card">
          <EmptyState
            icon={filter === "unread" ? CheckCheck : Bell}
            title={
              filter === "unread"
                ? "You’re all caught up"
                : category !== "all"
                  ? "Nothing in this category"
                  : "No notifications yet"
            }
            description={
              filter === "unread"
                ? "There are no unread updates waiting for you."
                : category !== "all"
                  ? "Try another category or view all notifications."
                  : "Leave decisions, payroll updates and attendance alerts will land here."
            }
            action={
              filter === "unread" || category !== "all" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setFilter("all");
                    setCategory("all");
                  }}
                >
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
                    <Badge tone="slate">{categoryLabel(item.category)}</Badge>
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
