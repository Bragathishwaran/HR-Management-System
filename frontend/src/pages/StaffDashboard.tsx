import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck2,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  RefreshCw,
  UserPlus,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useResource } from "../hooks/useResource";
import { endpoints } from "../lib/api";
import {
  formatCurrency,
  formatDate,
  formatDateLong,
  greeting,
  parseApiDateTime,
  statusLabel,
} from "../lib/format";
import type { Leave, LeaveStatus } from "../types";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatCard,
} from "../components/UI";
import {
  ChartCard,
  ChartLegend,
  chartColors,
  DonutChart,
  PayrollAreaChart,
} from "../components/Charts";

const weekDay = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString([], { weekday: "short" });

export function StaffDashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [processingId, setProcessingId] = useState<number | null>(null);

  const resource = useResource(async () => {
    const [stats, trends, pendingLeaves, employees, analytics] = await Promise.all([
      endpoints.dashboardStats(),
      endpoints.dashboardTrends(),
      endpoints.leaves({ status: "PENDING", limit: 8 }),
      endpoints.employees({ limit: 100 }),
      user?.role === "ADMIN" ? endpoints.adminAnalytics() : Promise.resolve(null),
    ]);
    return { stats, trends, pendingLeaves, employees, analytics };
  }, [user?.role]);

  if (resource.loading && !resource.data) {
    return <LoadingState label="Preparing your people overview…" />;
  }
  if (resource.error || !resource.data) {
    return <ErrorState message={resource.error || "Dashboard unavailable"} onRetry={resource.refresh} />;
  }

  const { stats, trends, pendingLeaves, employees, analytics } = resource.data;
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const departmentData = trends.department_distribution.map((item, index) => ({
    name: item.department,
    value: item.count,
    color: [
      chartColors.green,
      chartColors.teal,
      chartColors.amber,
      chartColors.blue,
      chartColors.purple,
      chartColors.rose,
    ][index % 6],
  }));

  const updateLeave = async (leave: Leave, status: Exclude<LeaveStatus, "PENDING">) => {
    setProcessingId(leave.id);
    try {
      await endpoints.updateLeaveStatus(leave.id, status);
      toast.success(
        status === "APPROVED" ? "Leave approved" : "Leave rejected",
        `${employeeMap.get(leave.employee_id)?.full_name || "Employee"} · ${formatDate(
          leave.start_date,
        )} – ${formatDate(leave.end_date)}`,
      );
      resource.refresh();
      window.dispatchEvent(new Event("worksphere:notifications"));
    } catch (error) {
      toast.error("Could not update leave", (error as Error).message);
    } finally {
      setProcessingId(null);
    }
  };

  const attendanceSummary = trends.attendance_trend.reduce(
    (acc, day) => ({
      present: acc.present + day.present,
      halfDay: acc.halfDay + day.half_day,
      absent: acc.absent + day.absent,
    }),
    { present: 0, halfDay: 0, absent: 0 },
  );

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={formatDateLong(new Date().toISOString())}
        title={`${greeting()}, ${user?.username.replace(/[._-]/g, " ") || "there"}`}
        description="Here’s the pulse of your organisation today."
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
              icon={<UserPlus size={16} />}
              onClick={() => navigate("/employees", { state: { create: true } })}
            >
              Add employee
            </Button>
          </>
        }
      />

      <section className="stats-grid">
        <StatCard
          label="Total people"
          value={stats.total_employees}
          meta={`${stats.active_employees} active`}
          icon={Users}
          tone="green"
        />
        <StatCard
          label="In today"
          value={stats.present_today + stats.half_day_today}
          meta={
            <span className="positive">
              <ArrowUpRight size={12} /> {stats.half_day_today} half day
            </span>
          }
          icon={UserRoundCheck}
          tone="teal"
        />
        <StatCard
          label="Awaiting approval"
          value={stats.pending_leave_requests}
          meta={`${stats.employees_on_leave_today} on leave today`}
          icon={CalendarClock}
          tone="amber"
        />
        <StatCard
          label={`Payroll · ${stats.payroll_overview.month.split("-")[0]}`}
          value={formatCurrency(stats.payroll_overview.total_net_salary, true)}
          meta={`${stats.payroll_overview.records_generated} slips`}
          icon={CircleDollarSign}
          tone="purple"
        />
      </section>

      <section className="dashboard-charts">
        <ChartCard
          title="Attendance pulse"
          subtitle="Last 7 days across the whole team"
          action={
            <span className="chart-chip">
              <Clock3 size={14} /> Weekly
            </span>
          }
          className="chart-wide"
        >
          <div className="chart-legend-row">
            <ChartLegend
              items={[
                { label: "Present", value: attendanceSummary.present, color: chartColors.green },
                { label: "Half day", value: attendanceSummary.halfDay, color: chartColors.amber },
                { label: "Absent", value: attendanceSummary.absent, color: chartColors.rose },
              ]}
            />
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={trends.attendance_trend} barGap={4} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#ebe8e0" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "#8a938d" }}
                tickFormatter={weekDay}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "#8a938d" }}
              />
              <Tooltip
                contentStyle={{
                  border: "1px solid #e8e5de",
                  borderRadius: 12,
                  boxShadow: "0 10px 30px rgba(24, 26, 22, 0.1)",
                  fontSize: 12,
                }}
                labelFormatter={(label: string) => formatDate(label)}
                formatter={(value: number, name: string) => [
                  value,
                  statusLabel(name.toUpperCase()),
                ]}
              />
              <Bar dataKey="present" stackId="a" fill={chartColors.green} radius={[0, 0, 3, 3]} barSize={22} />
              <Bar dataKey="half_day" stackId="a" fill={chartColors.amber} barSize={22} />
              <Bar dataKey="absent" stackId="a" fill={chartColors.rose} radius={[4, 4, 0, 0]} barSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Team by department"
          subtitle="Where your people sit"
          action={
            <Link to="/employees" className="text-link">
              View all <ArrowRight size={14} />
            </Link>
          }
          className="chart-narrow"
        >
          <DonutChart
            data={departmentData}
            centerValue={stats.total_employees}
            centerLabel="People"
            height={210}
          />
          <div className="department-legend">
            {departmentData.slice(0, 5).map((item) => (
              <span key={item.name}>
                <i style={{ background: item.color }} />
                {item.name}
                <strong>{item.value}</strong>
              </span>
            ))}
            {departmentData.length === 0 && <span className="muted">No departments yet.</span>}
          </div>
        </ChartCard>
      </section>

      <section className="dashboard-bottom">
        <section className="card approvals-card">
          <div className="card-heading">
            <div>
              <h2>Leave approvals</h2>
              <p>Requests waiting on your team</p>
            </div>
            <Link to="/leaves" className="text-link">
              Open queue <ChevronRight size={14} />
            </Link>
          </div>

          {pendingLeaves.length === 0 ? (
            <EmptyState
              compact
              icon={CalendarCheck2}
              title="No requests waiting"
              description="Everything is reviewed. Nice and tidy."
            />
          ) : (
            <div className="approval-list">
              {pendingLeaves.slice(0, 4).map((leave) => {
                const employee = employeeMap.get(leave.employee_id);
                const name = employee?.full_name || `Employee #${leave.employee_id}`;
                return (
                  <div className="approval-item" key={leave.id}>
                    <Avatar name={name} size="sm" />
                    <div className="approval-copy">
                      <strong>{name}</strong>
                      <span>
                        <Badge status={leave.leave_type} /> {leave.days_requested} day
                        {leave.days_requested === 1 ? "" : "s"} · {formatDate(leave.start_date, false)}
                      </span>
                    </div>
                    <div className="approval-actions">
                      <button
                        type="button"
                        className="action-approve"
                        onClick={() => updateLeave(leave, "APPROVED")}
                        disabled={processingId === leave.id}
                        title="Approve"
                      >
                        <Check size={15} />
                      </button>
                      <button
                        type="button"
                        className="action-reject"
                        onClick={() => updateLeave(leave, "REJECTED")}
                        disabled={processingId === leave.id}
                        title="Reject"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="card payroll-glance">
          <div className="card-heading">
            <div>
              <h2>Payroll outlook</h2>
              <p>{stats.payroll_overview.month}</p>
            </div>
            <span className="icon-tile icon-tile-purple">
              <CircleDollarSign size={18} />
            </span>
          </div>
          <div className="glance-amount">{formatCurrency(stats.payroll_overview.total_net_salary)}</div>
          <span className="glance-caption">net payroll generated this month</span>
          <div className="glance-rows">
            <div>
              <span>Slips generated</span>
              <strong>{stats.payroll_overview.records_generated}</strong>
            </div>
            <div>
              <span>Leave awaiting review</span>
              <strong>{trends.leave_breakdown.pending}</strong>
            </div>
            <div>
              <span>On leave today</span>
              <strong>{stats.employees_on_leave_today}</strong>
            </div>
            {analytics && (
              <div>
                <span>Active accounts</span>
                <strong>
                  {analytics.active_users}/{analytics.total_users}
                </strong>
              </div>
            )}
          </div>
          <Link to="/payroll" className="button-link">
            Go to payroll <ArrowRight size={15} />
          </Link>
        </section>
      </section>

      {trends.payroll_trend.length > 0 && (
        <ChartCard
          title="Payroll trajectory"
          subtitle="Net pay across recent payroll runs"
          action={
            <span className="chart-chip">
              <CircleDollarSign size={14} /> INR
            </span>
          }
        >
          <PayrollAreaChart data={trends.payroll_trend} />
        </ChartCard>
      )}
    </div>
  );
}
