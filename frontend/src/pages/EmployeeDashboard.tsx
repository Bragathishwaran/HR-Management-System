import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  Check,
  Clock3,
  Coffee,
  LogIn,
  LogOut,
  RefreshCw,
  Sparkles,
  SunMedium,
  WalletCards,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useNow, useResource } from "../hooks/useResource";
import { endpoints } from "../lib/api";
import {
  formatCurrency,
  formatDate,
  formatDateLong,
  formatTime,
  greeting,
  leaveAccent,
  statusLabel,
} from "../lib/format";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Progress,
  StatCard,
} from "../components/UI";

function liveDuration(start: string | null): string {
  if (!start) return "0h 00m";
  const startTime = new Date(`${start}Z`).getTime();
  const diff = Math.max(0, Date.now() - startTime);
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function EmployeeDashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const now = useNow();
  const [clocking, setClocking] = useState<"in" | "out" | null>(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => forceTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const resource = useResource(async () => {
    const [dashboard, attendance, leaves, policies] = await Promise.all([
      endpoints.myDashboard(),
      endpoints.myAttendance({ limit: 60 }),
      endpoints.myLeaves({ limit: 8 }),
      endpoints.leavePolicies(),
    ]);
    return { dashboard, attendance, leaves, policies };
  }, []);

  const unlinked =
    resource.error?.toLowerCase().includes("no employee profile") ?? false;

  if (resource.loading && !resource.data) {
    return <LoadingState label="Warming up your day…" />;
  }

  if (unlinked) {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="Your workspace"
          title={`Welcome, ${user?.username || "there"}`}
          description="Your account is ready. One small step remains."
        />
        <section className="card unlinked-card">
          <span className="unlinked-icon">
            <Sparkles size={24} />
          </span>
          <h2>Your employee profile isn’t linked yet</h2>
          <p>
            Ask your People Ops team to add your employee profile. Once linked,
            attendance, leave balances and payslips will appear here automatically.
          </p>
          <div className="unlinked-account">
            <div>
              <span>Signed in as</span>
              <strong>{user?.username}</strong>
            </div>
            <div>
              <span>Email</span>
              <strong>{user?.email}</strong>
            </div>
            <Badge status={user?.role} />
          </div>
          <Link to="/profile" className="button-link">
            View account details <ArrowRight size={15} />
          </Link>
        </section>
      </div>
    );
  }

  if (resource.error || !resource.data) {
    return <ErrorState message={resource.error || "Dashboard unavailable"} onRetry={resource.refresh} />;
  }

  const { dashboard, attendance, leaves, policies } = resource.data;
  const today = dashboard.today_attendance;
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const thisMonth = attendance.filter((record) => record.date.startsWith(monthPrefix));
  const presentDays = thisMonth.filter((record) => record.status === "PRESENT").length;
  const lateDays = thisMonth.filter((record) => record.is_late).length;
  const totalHours = thisMonth.reduce((sum, record) => sum + (record.working_hours || 0), 0);
  const totalBalance = dashboard.leave_balances.reduce(
    (sum, balance) => sum + balance.remaining_days,
    0,
  );
  const firstName = dashboard.profile.full_name.split(" ")[0];

  const clockAction = async (action: "in" | "out") => {
    setClocking(action);
    try {
      const result = action === "in" ? await endpoints.checkIn() : await endpoints.checkOut();
      toast.success(action === "in" ? "You’re checked in" : "Day wrapped", result.message);
      resource.refresh();
      window.dispatchEvent(new Event("worksphere:notifications"));
    } catch (error) {
      toast.error("Attendance update failed", (error as Error).message);
    } finally {
      setClocking(null);
    }
  };

  const clockState = !today?.check_in ? "not-in" : !today?.check_out ? "working" : "done";

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={formatDateLong(new Date().toISOString())}
        title={`${greeting()}, ${firstName}`}
        description="Here’s your day, your balance and what’s next."
        actions={
          <Button
            variant="secondary"
            icon={<RefreshCw size={16} />}
            onClick={resource.refresh}
            loading={resource.loading}
          >
            Refresh
          </Button>
        }
      />

      <section className="employee-hero-grid">
        <article className="clock-card">
          <div className="clock-card-top">
            <div>
              <span className="clock-eyebrow">
                <SunMedium size={15} /> Your time clock
              </span>
              <div className="clock-time">
                {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                <span>{now.toLocaleTimeString([], { second: "2-digit" }).replace(/\D/g, "")}</span>
              </div>
              <span className="clock-date">{formatDateLong(new Date().toISOString())}</span>
            </div>
            <Badge
              status={
                clockState === "working"
                  ? "PRESENT"
                  : clockState === "done"
                    ? "APPROVED"
                    : "PENDING"
              }
              dot
            >
              {clockState === "working"
                ? "Checked in"
                : clockState === "done"
                  ? "Day complete"
                  : "Not checked in"}
            </Badge>
          </div>

          <div className="clock-metrics">
            <div>
              <span>Check-in</span>
              <strong>{formatTime(today?.check_in)}</strong>
            </div>
            <div>
              <span>Check-out</span>
              <strong>{formatTime(today?.check_out)}</strong>
            </div>
            <div>
              <span>Live hours</span>
              <strong>
                {clockState === "working"
                  ? liveDuration(today?.check_in ?? null)
                  : today?.working_hours
                    ? `${today.working_hours.toFixed(1)}h`
                    : "—"}
              </strong>
            </div>
          </div>

          <div className="clock-actions">
            {clockState === "not-in" && (
              <Button
                size="lg"
                loading={clocking === "in"}
                onClick={() => clockAction("in")}
                icon={<LogIn size={18} />}
              >
                Check in now
              </Button>
            )}
            {clockState === "working" && (
              <Button
                size="lg"
                variant="secondary"
                loading={clocking === "out"}
                onClick={() => clockAction("out")}
                icon={<LogOut size={18} />}
              >
                Check out
              </Button>
            )}
            {clockState === "done" && (
              <span className="clock-done">
                <Check size={17} /> You’ve completed your day
              </span>
            )}
            <span className="clock-hint">
              {today?.is_late
                ? `Marked ${today.late_minutes} min late`
                : "Attendance is recorded in UTC"}
            </span>
          </div>
          <div className="clock-orbs">
            <span />
            <span />
          </div>
        </article>

        <article className="card leave-snapshot">
          <div className="card-heading">
            <div>
              <h2>Leave balance</h2>
              <p>{totalBalance} days available in total</p>
            </div>
            <span className="icon-tile icon-tile-amber">
              <CalendarDays size={18} />
            </span>
          </div>
          <div className="leave-mini-list">
            {dashboard.leave_balances.map((balance) => {
              const total = balance.total_days_allowed || 1;
              const tone = leaveAccent(balance.leave_type);
              return (
                <div className="leave-mini" key={balance.leave_type}>
                  <div className="leave-mini-top">
                    <span className={`leave-dot leave-${tone}`} />
                    <span>{statusLabel(balance.leave_type)}</span>
                    <strong>
                      {balance.remaining_days}
                      <small> / {balance.total_days_allowed}</small>
                    </strong>
                  </div>
                  <Progress
                    value={balance.remaining_days}
                    max={total}
                    tone={tone === "rose" ? "rose" : tone === "amber" ? "amber" : "green"}
                  />
                </div>
              );
            })}
          </div>
          <Link to="/leaves" className="button-link">
            View leave <ArrowRight size={15} />
          </Link>
        </article>
      </section>

      <section className="stats-grid stats-grid-3">
        <StatCard
          label="Present this month"
          value={`${presentDays} days`}
          meta={`${lateDays} late arrival${lateDays === 1 ? "" : "s"}`}
          icon={CalendarCheck2}
          tone="green"
        />
        <StatCard
          label="Hours logged"
          value={`${totalHours.toFixed(1)}h`}
          meta="This month"
          icon={Clock3}
          tone="teal"
        />
        <StatCard
          label="Latest net pay"
          value={
            dashboard.latest_payroll
              ? formatCurrency(dashboard.latest_payroll.net_salary, true)
              : "—"
          }
          meta={dashboard.latest_payroll?.month || "No payslip yet"}
          icon={WalletCards}
          tone="purple"
        />
        <StatCard
          label="Pending requests"
          value={dashboard.pending_leave_requests}
          meta={`${dashboard.unread_notifications} unread updates`}
          icon={CalendarDays}
          tone="amber"
        />
      </section>

      <section className="dashboard-bottom">
        <section className="card recent-leave-card">
          <div className="card-heading">
            <div>
              <h2>Recent leave requests</h2>
              <p>Your latest time away</p>
            </div>
            <Link to="/leaves" className="text-link">
              All requests <ArrowRight size={14} />
            </Link>
          </div>
          {leaves.length === 0 ? (
            <EmptyState
              compact
              icon={Coffee}
              title="No leave requests yet"
              description="Your first request will show up here."
              action={
                <Link to="/leaves" className="button-link">
                  Apply for leave
                </Link>
              }
            />
          ) : (
            <div className="mini-table-wrap">
              <table className="data-table compact-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Dates</th>
                    <th>Days</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.map((leave) => (
                    <tr key={leave.id}>
                      <td>
                        <Badge status={leave.leave_type} />
                      </td>
                      <td>
                        {formatDate(leave.start_date, false)}
                        <span className="table-sub"> → {formatDate(leave.end_date, false)}</span>
                      </td>
                      <td>{leave.days_requested}</td>
                      <td>
                        <Badge status={leave.status} dot />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card latest-pay-card">
          <div className="card-heading">
            <div>
              <h2>Latest payslip</h2>
              <p>{dashboard.latest_payroll?.month || "Not generated yet"}</p>
            </div>
            <span className="icon-tile icon-tile-purple">
              <WalletCards size={18} />
            </span>
          </div>
          {dashboard.latest_payroll ? (
            <>
              <div className="payslip-amount">
                {formatCurrency(dashboard.latest_payroll.net_salary)}
              </div>
              <span className="glance-caption">net take-home</span>
              <div className="payslip-breakdown-mini">
                <div>
                  <span>Gross</span>
                  <strong>{formatCurrency(dashboard.latest_payroll.gross_salary)}</strong>
                </div>
                <div>
                  <span>Deductions</span>
                  <strong>-{formatCurrency(dashboard.latest_payroll.deductions)}</strong>
                </div>
              </div>
              <Link to="/payroll" className="button-link">
                View all payslips <ArrowRight size={15} />
              </Link>
            </>
          ) : (
            <EmptyState
              compact
              icon={WalletCards}
              title="No payslip yet"
              description="Your first payslip will appear here once payroll is generated."
            />
          )}
        </section>
      </section>

      <section className="quick-actions">
        <Link to="/attendance" className="quick-action">
          <span className="quick-icon">
            <Clock3 size={19} />
          </span>
          <span>
            <strong>Attendance history</strong>
            <small>See your hours and late marks</small>
          </span>
          <ArrowRight size={17} />
        </Link>
        <Link to="/leaves" className="quick-action">
          <span className="quick-icon">
            <CalendarDays size={19} />
          </span>
          <span>
            <strong>Plan time off</strong>
            <small>Apply and track your leave</small>
          </span>
          <ArrowRight size={17} />
        </Link>
        <Link to="/payroll" className="quick-action">
          <span className="quick-icon">
            <WalletCards size={19} />
          </span>
          <span>
            <strong>Payslips & pay</strong>
            <small>Download your salary slips</small>
          </span>
          <ArrowRight size={17} />
        </Link>
        <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer" className="quick-action">
          <span className="quick-icon">
            <Sparkles size={19} />
          </span>
          <span>
            <strong>Explore policies</strong>
            <small>{policies.length} leave policies configured</small>
          </span>
          <ArrowRight size={17} />
        </a>
      </section>
    </div>
  );
}
