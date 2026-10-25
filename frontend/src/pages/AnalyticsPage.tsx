import {
  Activity,
  ArrowUpRight,
  CalendarClock,
  Download,
  ShieldCheck,
  UserRoundCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import { useResource } from "../hooks/useResource";
import { endpoints } from "../lib/api";
import { downloadCsv, formatCurrency, statusLabel } from "../lib/format";
import {
  Badge,
  Button,
  ErrorState,
  LoadingState,
  PageHeader,
  Progress,
  StatCard,
} from "../components/UI";
import {
  ChartCard,
  ChartLegend,
  chartColors,
  DepartmentBarChart,
  DonutChart,
  PayrollAreaChart,
} from "../components/Charts";

export function AnalyticsPage() {
  const toast = useToast();

  const resource = useResource(async () => {
    const [analytics, trends] = await Promise.all([
      endpoints.adminAnalytics(),
      endpoints.dashboardTrends(),
    ]);
    return { analytics, trends };
  }, []);

  if (resource.loading && !resource.data) {
    return <LoadingState label="Crunching the numbers…" />;
  }
  if (resource.error || !resource.data) {
    return <ErrorState message={resource.error || "Analytics unavailable"} onRetry={resource.refresh} />;
  }

  const { analytics, trends } = resource.data;
  const roleData = Object.entries(analytics.users_by_role).map(([name, value], index) => ({
    name: statusLabel(name),
    value,
    color: [chartColors.green, chartColors.purple, chartColors.blue][index % 3],
  }));
  const attendanceData = [
    { name: "Present", value: analytics.attendance_today.PRESENT || 0, color: chartColors.green },
    { name: "Half day", value: analytics.attendance_today.HALF_DAY || 0, color: chartColors.amber },
    { name: "Absent", value: analytics.attendance_today.ABSENT || 0, color: chartColors.rose },
  ];
  const departmentData = trends.department_distribution;
  const activeRate =
    analytics.total_users > 0
      ? Math.round((analytics.active_users / analytics.total_users) * 100)
      : 0;
  const attendanceTotal = attendanceData.reduce((sum, item) => sum + item.value, 0);

  const exportReport = () => {
    downloadCsv("worksphere-analytics.csv", [
      ["Metric", "Value"],
      ["Total users", analytics.total_users],
      ["Active users", analytics.active_users],
      ["Inactive users", analytics.inactive_users],
      ["Total employees", analytics.total_employees],
      ["Active employees", analytics.active_employees],
      ["Pending leave requests", analytics.pending_leave_requests],
      ["Payroll month", analytics.payroll_overview.month],
      ["Payroll net", analytics.payroll_overview.total_net_salary],
      ["Payroll records", analytics.payroll_overview.records_generated],
      [],
      ["Users by role", "Count"],
      ...Object.entries(analytics.users_by_role),
      [],
      ["Department", "Count"],
      ...Object.entries(analytics.department_distribution),
      [],
      ["Leave status", "Count"],
      ["Pending", trends.leave_breakdown.pending],
      ["Approved", trends.leave_breakdown.approved],
      ["Rejected", trends.leave_breakdown.rejected],
    ]);
    toast.success("Report exported", "A CSV snapshot of your workforce metrics was saved.");
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="System intelligence"
        title="Workforce analytics"
        description="The signals behind your people, time and payroll decisions."
        actions={
          <Button variant="secondary" icon={<Download size={16} />} onClick={exportReport}>
            Export report
          </Button>
        }
      />

      <section className="stats-grid">
        <StatCard
          label="People on board"
          value={analytics.total_employees}
          meta={`${analytics.active_employees} active`}
          icon={Users}
          tone="green"
        />
        <StatCard
          label="Active accounts"
          value={`${activeRate}%`}
          meta={`${analytics.active_users} of ${analytics.total_users}`}
          icon={ShieldCheck}
          tone="purple"
        />
        <StatCard
          label="Leave in review"
          value={analytics.pending_leave_requests}
          meta={`${trends.leave_breakdown.approved} approved all-time`}
          icon={CalendarClock}
          tone="amber"
        />
        <StatCard
          label={`Net payroll · ${analytics.payroll_overview.month.split("-")[0]}`}
          value={formatCurrency(analytics.payroll_overview.total_net_salary, true)}
          meta={`${analytics.payroll_overview.records_generated} slips`}
          icon={WalletCards}
          tone="teal"
        />
      </section>

      <section className="analytics-grid">
        <ChartCard title="Access mix" subtitle="Accounts by role" className="analytics-small">
          <DonutChart data={roleData} centerValue={analytics.total_users} centerLabel="Accounts" height={210} />
          <ChartLegend
            items={roleData.map((item) => ({
              label: item.name,
              value: item.value,
              color: item.color,
            }))}
          />
        </ChartCard>

        <ChartCard title="Today’s attendance" subtitle="Live presence snapshot" className="analytics-small">
          <DonutChart
            data={attendanceData}
            centerValue={attendanceTotal}
            centerLabel="Records"
            height={210}
          />
          <ChartLegend
            items={attendanceData.map((item) => ({
              label: item.name,
              value: item.value,
              color: item.color,
            }))}
          />
        </ChartCard>

        <ChartCard
          title="Department distribution"
          subtitle="Headcount by team"
          className="analytics-wide"
        >
          {departmentData.length > 0 ? (
            <DepartmentBarChart
              data={departmentData.map((item) => ({
                department: item.department,
                count: item.count,
              }))}
              height={250}
            />
          ) : (
            <div className="chart-empty">No department data yet.</div>
          )}
        </ChartCard>
      </section>

      <section className="analytics-grid analytics-second">
        <ChartCard
          title="Payroll trajectory"
          subtitle="Net pay per payroll run"
          className="analytics-wide"
          action={
            <span className="chart-chip">
              <ArrowUpRight size={14} /> {trends.payroll_trend.length} runs
            </span>
          }
        >
          {trends.payroll_trend.length > 0 ? (
            <PayrollAreaChart data={trends.payroll_trend} height={250} />
          ) : (
            <div className="chart-empty">Generate payroll to see the trend.</div>
          )}
        </ChartCard>

        <section className="card account-health-card">
          <div className="card-heading">
            <div>
              <h2>Account health</h2>
              <p>Activity across the workspace</p>
            </div>
            <span className="icon-tile icon-tile-green">
              <Activity size={18} />
            </span>
          </div>
          <div className="health-big">
            <strong>{activeRate}%</strong>
            <span>accounts active</span>
          </div>
          <Progress value={analytics.active_users} max={analytics.total_users} />
          <div className="glance-rows">
            <div>
              <span>Active accounts</span>
              <strong>{analytics.active_users}</strong>
            </div>
            <div>
              <span>Inactive accounts</span>
              <strong>{analytics.inactive_users}</strong>
            </div>
            <div>
              <span>Leave approved</span>
              <strong>{trends.leave_breakdown.approved}</strong>
            </div>
            <div>
              <span>Leave rejected</span>
              <strong>{trends.leave_breakdown.rejected}</strong>
            </div>
          </div>
        </section>
      </section>

      <section className="card table-card">
        <div className="card-heading card-heading-inset">
          <div>
            <h2>Role breakdown</h2>
            <p>How access is distributed</p>
          </div>
          <Badge tone="slate">{analytics.total_users} accounts</Badge>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Accounts</th>
                <th>Share</th>
                <th>Access profile</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(analytics.users_by_role).map(([role, count]) => (
                <tr key={role}>
                  <td>
                    <Badge status={role} />
                  </td>
                  <td className="cell-strong">{count}</td>
                  <td>
                    <div className="share-cell">
                      <Progress value={count} max={analytics.total_users} />
                      <span>
                        {analytics.total_users
                          ? Math.round((count / analytics.total_users) * 100)
                          : 0}
                        %
                      </span>
                    </div>
                  </td>
                  <td className="muted">
                    {role === "ADMIN"
                      ? "Full system, users and analytics"
                      : role === "HR"
                        ? "People, attendance, leave and payroll"
                        : "Self-service, leave and payslips"}
                  </td>
                </tr>
              ))}
              <tr>
                <td>
                  <span className="person-name">Employee records</span>
                </td>
                <td className="cell-strong">{analytics.total_employees}</td>
                <td>
                  <div className="share-cell">
                    <Progress value={analytics.active_employees} max={analytics.total_employees} />
                    <span>
                      {analytics.total_employees
                        ? Math.round((analytics.active_employees / analytics.total_employees) * 100)
                        : 0}
                      % active
                    </span>
                  </div>
                </td>
                <td className="muted">Linked employee profiles</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="insight-strip">
        <span className="icon-tile icon-tile-teal">
          <UserRoundCheck size={18} />
        </span>
        <p>
          <strong>{analytics.attendance_today.PRESENT || 0} people are present today</strong> and{" "}
          {analytics.pending_leave_requests} leave request
          {analytics.pending_leave_requests === 1 ? " is" : "s are"} waiting for a decision.
        </p>
      </section>
    </div>
  );
}
