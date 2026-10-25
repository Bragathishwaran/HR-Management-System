import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  Clock3,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  UserCog,
  UserRound,
  Users,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Avatar, Badge } from "./UI";
import { NotificationBell } from "./NotificationBell";
import { roleLabel } from "../lib/format";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: Array<"EMPLOYEE" | "HR" | "ADMIN">;
  end?: boolean;
}

const workspaceItems: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/employees", label: "People", icon: Users },
  { to: "/attendance", label: "Attendance", icon: Clock3 },
  { to: "/leaves", label: "Leave", icon: CalendarDays },
  { to: "/payroll", label: "Payroll", icon: WalletCards },
];

const managementItems: NavItem[] = [
  { to: "/leave-policies", label: "Leave policies", icon: ScrollText, roles: ["HR", "ADMIN"] },
  { to: "/analytics", label: "Analytics", icon: ChartNoAxesCombined, roles: ["ADMIN"] },
  { to: "/users", label: "User access", icon: UserCog, roles: ["ADMIN"] },
];

const accountItems: NavItem[] = [
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/profile", label: "My profile", icon: UserRound },
];

const pageTitles: Array<{ prefix: string; title: string }> = [
  { prefix: "/employees/", title: "Employee profile" },
  { prefix: "/employees", title: "People" },
  { prefix: "/attendance", title: "Attendance" },
  { prefix: "/leaves", title: "Leave management" },
  { prefix: "/payroll", title: "Payroll" },
  { prefix: "/leave-policies", title: "Leave policies" },
  { prefix: "/analytics", title: "Analytics" },
  { prefix: "/users", title: "User access" },
  { prefix: "/notifications", title: "Notifications" },
  { prefix: "/profile", title: "My profile" },
  { prefix: "/", title: "Dashboard" },
];

function currentPageTitle(pathname: string): string {
  return pageTitles.find((item) => pathname.startsWith(item.prefix))?.title || "WorkSphere";
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!user) return null;

  const visibleItems = (items: NavItem[]) =>
    items.filter((item) => !item.roles || item.roles.includes(user.role));

  const management = visibleItems(managementItems);
  const pageTitle = currentPageTitle(location.pathname);
  const displayName = user.username.replace(/[._-]/g, " ");

  const renderNav = (items: NavItem[]) => (
    <nav className="nav-list">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-link ${isActive ? "is-active" : ""}`}
          >
            <Icon size={18} />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <div className="app-shell">
      <div
        className={`sidebar-scrim ${mobileOpen ? "is-open" : ""}`}
        onClick={() => setMobileOpen(false)}
        role="presentation"
      />

      <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">
            <span>W</span>
          </div>
          <div className="brand-copy">
            <strong>WorkSphere</strong>
            <span>People operations</span>
          </div>
          <button
            type="button"
            className="sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <div className="workspace-pill">
          <span className="workspace-pill-avatar">{user.username.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>WorkSphere HQ</strong>
            <span>{roleLabel[user.role]} workspace</span>
          </div>
          <ChevronDown size={14} />
        </div>

        <div className="sidebar-scroll">
          <span className="nav-label">Workspace</span>
          {renderNav(visibleItems(workspaceItems))}

          {management.length > 0 && (
            <>
              <span className="nav-label nav-label-spaced">Management</span>
              {renderNav(management)}
            </>
          )}

          <span className="nav-label nav-label-spaced">Account</span>
          {renderNav(accountItems)}
        </div>

        <div className="sidebar-footer">
          <a
            className="sidebar-tip"
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noreferrer"
          >
            <span className="sidebar-tip-icon">
              <ArrowUpRight size={16} />
            </span>
            <span>
              <strong>API reference</strong>
              <small>Interactive FastAPI docs</small>
            </span>
          </a>
          <div className="sidebar-user">
            <Avatar name={displayName} size="sm" />
            <div>
              <strong>{displayName}</strong>
              <span>{roleLabel[user.role]}</span>
            </div>
            <button type="button" onClick={logout} aria-label="Sign out" title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="topbar-icon topbar-menu"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <div className="topbar-crumb">
              <span>WorkSphere</span>
              <i>/</i>
              <strong>{pageTitle}</strong>
            </div>
          </div>

          <div className="topbar-right">
            <span className="topbar-date">
              {new Date().toLocaleDateString([], {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
            <NotificationBell />
            <div className="user-menu" ref={userMenuRef}>
              <button
                type="button"
                className="user-menu-trigger"
                onClick={() => setUserMenuOpen((value) => !value)}
                aria-expanded={userMenuOpen}
              >
                <Avatar name={displayName} size="sm" />
                <span className="user-menu-copy">
                  <strong>{displayName}</strong>
                  <small>{roleLabel[user.role]}</small>
                </span>
                <ChevronDown size={14} />
              </button>
              {userMenuOpen && (
                <div className="user-dropdown">
                  <div className="user-dropdown-head">
                    <Avatar name={displayName} size="md" />
                    <div>
                      <strong>{displayName}</strong>
                      <span>{user.email}</span>
                      <Badge status={user.role} />
                    </div>
                  </div>
                  <button type="button" onClick={() => navigate("/profile")}>
                    <UserRound size={16} /> My profile
                  </button>
                  <button type="button" onClick={() => navigate("/notifications")}>
                    <Bell size={16} /> Notifications
                  </button>
                  <button type="button" className="danger-link" onClick={logout}>
                    <LogOut size={16} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
