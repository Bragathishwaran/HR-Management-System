import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  BellRing,
  CalendarCheck2,
  CheckCheck,
  ChevronRight,
  CreditCard,
  Info,
} from "lucide-react";
import { endpoints } from "../lib/api";
import { timeAgo } from "../lib/format";
import { useResource } from "../hooks/useResource";
import { useToast } from "../context/ToastContext";
import type { NotificationItem } from "../types";

function notificationIcon(title: string) {
  const value = title.toLowerCase();
  if (value.includes("payroll") || value.includes("salary")) return CreditCard;
  if (value.includes("leave")) return CalendarCheck2;
  if (value.includes("late") || value.includes("absent")) return BellRing;
  return Info;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const toast = useToast();
  const resource = useResource(
    () => endpoints.notifications({ limit: 8 }),
    [],
  );

  useEffect(() => {
    const interval = window.setInterval(resource.refresh, 60_000);
    const handleRefresh = () => resource.refresh();
    window.addEventListener("worksphere:notifications", handleRefresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("worksphere:notifications", handleRefresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const markRead = async (item: NotificationItem) => {
    if (item.is_read) {
      navigate("/notifications");
      setOpen(false);
      return;
    }
    try {
      await endpoints.markNotificationRead(item.id);
      resource.refresh();
      window.dispatchEvent(new Event("worksphere:notifications"));
      navigate("/notifications");
      setOpen(false);
    } catch (error) {
      toast.error("Could not update notification", (error as Error).message);
    }
  };

  const markAll = async () => {
    try {
      const result = await endpoints.markAllNotificationsRead();
      toast.success("You’re all caught up", `${result.updated} notification(s) marked read.`);
      resource.refresh();
      window.dispatchEvent(new Event("worksphere:notifications"));
    } catch (error) {
      toast.error("Could not mark notifications", (error as Error).message);
    }
  };

  const unread = resource.data?.unread ?? 0;

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        className={`topbar-icon ${open ? "is-active" : ""}`}
        onClick={() => {
          setOpen((value) => !value);
          if (!open) resource.refresh();
        }}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
      >
        <Bell size={19} />
        {unread > 0 && <span className="notification-dot">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="notification-popover">
          <div className="notification-head">
            <div>
              <strong>Notifications</strong>
              <span>{unread ? `${unread} unread update${unread === 1 ? "" : "s"}` : "All clear"}</span>
            </div>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="text-button">
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
          </div>

          <div className="notification-list">
            {resource.loading && !resource.data && (
              <div className="notification-loading">Checking for updates…</div>
            )}
            {!resource.loading && (resource.data?.items.length ?? 0) === 0 && (
              <div className="notification-empty">
                <Bell size={20} />
                <strong>No notifications yet</strong>
                <span>Updates about leave, payroll and attendance will appear here.</span>
              </div>
            )}
            {resource.data?.items.map((item) => {
              const Icon = notificationIcon(item.title);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`notification-item ${item.is_read ? "is-read" : "is-unread"}`}
                  onClick={() => markRead(item)}
                >
                  <span className="notification-item-icon">
                    <Icon size={16} />
                  </span>
                  <span className="notification-item-copy">
                    <strong>{item.title}</strong>
                    <span>{item.message}</span>
                    <small>{timeAgo(item.created_at)}</small>
                  </span>
                  {!item.is_read && <i className="unread-pin" />}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="notification-footer"
            onClick={() => {
              navigate("/notifications");
              setOpen(false);
            }}
          >
            View all notifications <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
