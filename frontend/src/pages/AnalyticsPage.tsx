import { useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarRange,
  Clock3,
  Download,
  Gauge,
  RefreshCw,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import { useResource } from "../hooks/useResource";
import { endpoints } from "../lib/api";
import { downloadCsv, formatDate, todayISO } from "../lib/format";
import type { AnalyticsReport } from "../types";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Progress,
  Select,
  StatCard,
} from "../components/UI";
import {
  AttendanceTrendChart,
  ChartCard,
  ChartLegend,
  chartColors,
  DepartmentBarChart,
  DonutChart,
  LeaveTrendChart,
} from "../components/Charts";

type Granularity = "day" | "week" | "month";

function dateOffset(days: number, from = todayISO()): string {
  const date = new Date(`${from}T00:00:00`);
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function periodLabel(period: string, granularity: Granularity): string {
  if (granularity === "week") return period.split("-W")[1] ? `W${period.split("-W")[1]}` : period;
  if (granularity === "month") {
    const [year, month] = period.split("-").map(Number);
    if (!year || !month) return period;
    return new Date(year, month - 1, 1).toLocaleDateString([], {
      month: "short",
      year: "2-digit",
    });
  }
  const date = new Date(`${period}T00:00:00`);
  if (Number.isNaN(date.getTime())) return period;
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

function leaveTypeLabel(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export function AnalyticsPage() {
  const toast = useToast();
  const [startDate, setStartDate] = useState(dateOffset(-29));
  const [endDate, setEndDate] = useState(todayISO());
  const [department, setDepartment] = useState("all");
  const [granularity, setGranularity] = useState<Granularity>("week");

  const resource = useResource(async () => {
    const [report, facets] = await Promise.all([
      endpoints.analyticsReport({
        start_date: startDate,
        end_date: endDate,
        department: department === "all" ? undefined : department,
        granularity,
      }),
      endpoints.employeeFacets(),
    ]);
    return { report, facets };
  }, [startDate, endDate, department, granularity]);

  const report: AnalyticsReport | undefined = resource.data?.report;
  const departments = resource.data?.facets.departments || [];

  const attendanceData = useMemo(
    () =>
      (report?.attendance_trends || []).map((point) => ({
        label: periodLabel(point.period, granularity),
        present: point.present,
        absent: point.absent,
        half_day: point.half_day,
        late: point.late,
      })),
    [report, granularity],
  );

  const leaveData = useMemo(
    () =>
      (report?.leave_trends || []).map((point) => ({
        label: periodLabel(point.period, "month"),
        approved: point.approved,
        pending: point.pending,
        rejected: point.rejected,
      })),
    [report],
  );

  const ratingData = useMemo(() => {
    const distribution = report?.performance.rating_distribution || {};
    const palette: Record<string, string> = {
      "5": chartColors.green,
      "4": chartColors.teal,
      "3": chartColors.amber,
      "2": chartColors.rose,
      "1": chartColors.purple,
    };
    return Array.from({ length: 5 }, (_, index) => {
      const rating = String(5 - index);
      return {
        name: `${rating} star${rating === "1" ? "" : "s"}`,
        value: distribution[rating] || 0,
        color: palette[rating],
      };
    });
  }, [report]);

  const leaveTypeData = useMemo(
    () =>
      (report?.leave_types || []).map((metric) => ({
        name: leaveTypeLabel(metric.leave_type),
        value: metric.days,
        requests: metric.requests,
        color:
          metric.leave_type === "SICK"
            ? chartColors.rose
            : metric.leave_type === "CASUAL"
              ? chartColors.amber
              : chartColors.teal,
      })),
    [report],
  );

  const applyPreset = (days: number | "year") => {
    const end = todayISO();
    if (days === "year") {
      setStartDate(`${end.slice(0, 4)}-01-01`);
    } else {
      setStartDate(dateOffset(-(days - 1), end));
    }
    setEndDate(end);
  };

  const exportReport = () => {
    if (!report) return;
    downloadCsv("worksphere-analytics.csv", [
      ["WorkSphere analytics report"],
      ["From", report.filters.start_date || ""],
      ["To", report.filters.end_date || ""],
      ["Department", report.filters.department || "All departments"],
      [],
      ["Metric", "Value"],
      ["Total employees", report.overview.total_employees],
      ["Departments", report.overview.departments],
      ["Attendance records", report.overview.attendance_records],
      ["Present", report.overview.present],
      ["Absent", report.overview.absent],
      ["Half day", report.overview.half_day],
      ["Late arrivals", report.overview.late],
      ["Early exits", report.overview.early_exits],
      ["Attendance rate (%)", report.overview.attendance_rate],
      ["Leave requests", report.overview.leave_requests],
      ["Approved leave days", report.overview.approved_leave_days],
      ["Average rating", report.overview.average_rating],
      ["Reviews", report.overview.reviews],
      [],
      ["Department", "Headcount", "Present", "Absent", "Late", "Attendance rate", "Leave days", "Rating", "Reviews"],
      ...report.departments.map((row) => [
        row.department,
        row.headcount,
        row.present,
        row.absent,
        row.late,
        row.attendance_rate,
        row.leave_days,
        row.average_rating,
        row.reviews,
      ]),
    ]);
    toast.success("Report exported", "The filtered analytics snapshot was saved as CSV.");
  };

  if (resource.loading && !resource.data) {
    return <LoadingState label="Crunching the numbers…" />;
  }
  if (resource.error || !report) {
    return (
      <ErrorState
        message={resource.error || "Analytics unavailable"}
        onRetry={resource.refresh}
      />
    );
  }

  const overview = report.overview;
  const hasFilters = department !== "all";
  const attendanceTotal =
    overview.present + overview.absent + overview.half_day;
  const departmentChart = report.departments.map((row) => ({
    department: row.department,
    count: row.headcount,
  }));
  const lateRate =
    overview.attendance_records > 0
      ? (overview.late / overview.attendance_records) * 100
      : 0;

  const miniStats: Array<{
    label: string;
    value: string | number;
    meta: string;
    icon: LucideIcon;
    tone: "green" | "amber" | "blue" | "purple" | "rose" | "teal";
  }> = [
    {
      label: "Headcount",
      value: overview.total_employees,
      meta: `${overview.departments} ${overview.departments === 1 ? "department" : "departments"}`,
      icon: Users,
      tone: "green",
    },
    {
      label: "Attendance rate",
      value: `${overview.attendance_rate}%`,
      meta: `${overview.present} present · ${overview.absent} absent`,
      icon: Gauge,
      tone: "teal",
    },
    {
      label: "Approved leave",
      value: overview.approved_leave_days,
      meta: `${overview.leave_requests} requests in range`,
      icon: CalendarRange,
      tone: "amber",
    },
    {
      label: "Avg. rating",
      value: overview.reviews ? overview.average_rating.toFixed(1) : "—",
      meta: `${overview.reviews} reviews recorded`,
      icon: Star,
      tone: "purple",
    },
  ];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="System intelligence"
        title="Workforce analytics"
        description="Filter people, time and performance signals across any date range."
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
              variant="secondary"
              icon={<Download size={16} />}
              onClick={exportReport}
            >
              Export report
            </Button>
          </>
        }
      />

      <section className="card analytics-filter-bar">
        <div className="filter-group">
          <label htmlFor="analytics-start">From</label>
          <input
            id="analytics-start"
            className="input"
            type="date"
            value={startDate}
            max={endDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="analytics-end">To</label>
          <input
            id="analytics-end"
            className="input"
            type="date"
            value={endDate}
            min={startDate}
            max={todayISO()}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="analytics-department">Department</label>
          <Select
            id="analytics-department"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            className="toolbar-select"
          >
            <option value="all">All departments</option>
            {departments.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </div>
        <div className="filter-group">
          <label htmlFor="analytics-granularity">Trend by</label>
          <Select
            id="analytics-granularity"
            value={granularity}
            onChange={(event) =>
              setGranularity(event.target.value as Granularity)
            }
            className="toolbar-select"
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </Select>
        </div>
        <div className="filter-presets">
          <button type="button" onClick={() => applyPreset(30)}>
            30 days
          </button>
          <button type="button" onClick={() => applyPreset(90)}>
            90 days
          </button>
          <button type="button" onClick={() => applyPreset("year")}>
            This year
          </button>
          {hasFilters && (
            <button
              type="button"
              className="is-reset"
              onClick={() => setDepartment("all")}
            >
              Clear filters
            </button>
          )}
        </div>
      </section>

      <section className="stats-grid">
        {miniStats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            meta={stat.meta}
            icon={stat.icon}
            tone={stat.tone}
          />
        ))}
      </section>

      <section className="analytics-grid analytics-second">
        <ChartCard
          title="Attendance trend"
          subtitle={`${formatDate(report.filters.start_date)} – ${formatDate(report.filters.end_date)}`}
          className="analytics-wide"
          action={
            <span className="chart-chip">
              <Clock3 size={14} /> {overview.late} late · {overview.early_exits} early exits
            </span>
          }
        >
          {attendanceTotal > 0 ? (
            <>
              <AttendanceTrendChart data={attendanceData} />
              <ChartLegend
                items={[
                  { label: "Present", color: chartColors.green },
                  { label: "Absent", color: chartColors.rose },
                  { label: "Late", color: chartColors.amber },
                ]}
              />
            </>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="No attendance in range"
              description="Try a wider date range or another department."
            />
          )}
        </ChartCard>

        <ChartCard
          title="Leave movement"
          subtitle="Requests by status each month"
          action={
            <span className="chart-chip">{overview.leave_requests} requests</span>
          }
        >
          {leaveData.some(
            (point) => point.approved + point.pending + point.rejected > 0,
          ) ? (
            <>
              <LeaveTrendChart data={leaveData} />
              <ChartLegend
                items={[
                  { label: "Approved", color: chartColors.green },
                  { label: "Pending", color: chartColors.amber },
                  { label: "Rejected", color: chartColors.rose },
                ]}
              />
            </>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="No leave in range"
              description="Leave requests will appear here once they overlap the selected dates."
            />
          )}
        </ChartCard>
      </section>

      <section className="analytics-grid analytics-second">
        <ChartCard
          title="Performance ratings"
          subtitle="How reviews are distributed"
          className="analytics-wide"
          action={
            <span className="chart-chip">
              <Star size={14} /> {report.performance.average_rating.toFixed(1)} avg
            </span>
          }
        >
          <div className="analytics-donut-row">
            <DonutChart
              data={ratingData}
              centerValue={report.performance.total_reviews}
              centerLabel="Reviews"
              height={230}
            />
            <div className="analytics-legend-stack">
              <ChartLegend
                items={ratingData.map((item) => ({
                  label: item.name,
                  value: item.value,
                  color: item.color,
                }))}
              />
              <div className="analytics-note">
                <Star size={15} fill="currentColor" />
                <span>
                  {report.performance.total_reviews
                    ? `Top team: ${
                        report.performance.departments[0]?.department || "—"
                      }`
                    : "No reviews recorded in this range."}
                </span>
              </div>
            </div>
          </div>
        </ChartCard>

        <ChartCard
          title="Leave types"
          subtitle="Approved and pending days by type"
        >
          <div className="analytics-donut-row is-compact">
            <DonutChart
              data={leaveTypeData}
              centerValue={overview.approved_leave_days}
              centerLabel="Days"
              height={210}
            />
            <ChartLegend
              items={leaveTypeData.map((item) => ({
                label: item.name,
                value: `${item.requests} req`,
                color: item.color,
              }))}
            />
          </div>
        </ChartCard>
      </section>

      <section className="analytics-grid analytics-second">
        <ChartCard
          title="Headcount by department"
          subtitle="Active people in the filtered scope"
          className="analytics-wide"
        >
          {departmentChart.length > 0 ? (
            <DepartmentBarChart data={departmentChart} height={250} />
          ) : (
            <div className="chart-empty">No department data for this range.</div>
          )}
        </ChartCard>

        <section className="card analytics-signal-card">
          <div className="card-heading">
            <div>
              <h2>Punctuality signal</h2>
              <p>Late arrivals as a share of attendance records</p>
            </div>
            <Badge tone={lateRate > 15 ? "rose" : lateRate > 5 ? "amber" : "green"}>
              {lateRate.toFixed(1)}% late
            </Badge>
          </div>
          <div className="health-big">
            <strong>{overview.attendance_rate}%</strong>
            <span>attendance rate</span>
          </div>
          <Progress
            value={overview.attendance_rate}
            max={100}
            tone={overview.attendance_rate >= 85 ? "green" : "amber"}
          />
          <div className="glance-rows">
            <div>
              <span>Present records</span>
              <strong>{overview.present}</strong>
            </div>
            <div>
              <span>Late arrivals</span>
              <strong>{overview.late}</strong>
            </div>
            <div>
              <span>Early exits</span>
              <strong>{overview.early_exits}</strong>
            </div>
            <div>
              <span>Half days</span>
              <strong>{overview.half_day}</strong>
            </div>
          </div>
        </section>
      </section>

      <section className="card table-card">
        <div className="card-heading card-heading-inset">
          <div>
            <h2>Department report</h2>
            <p>Attendance, leave and performance side by side</p>
          </div>
          <Badge tone="slate">
            {report.departments.length}{" "}
            {report.departments.length === 1 ? "team" : "teams"}
          </Badge>
        </div>
        {report.departments.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No department data"
            description="Add employees or widen the date range to populate this report."
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Headcount</th>
                  <th>Present</th>
                  <th>Absent</th>
                  <th>Late</th>
                  <th>Attendance</th>
                  <th>Leave days</th>
                  <th>Rating</th>
                </tr>
              </thead>
              <tbody>
                {report.departments.map((row) => (
                  <tr key={row.department}>
                    <td>
                      <span className="department-chip">{row.department}</span>
                    </td>
                    <td className="cell-strong">{row.headcount}</td>
                    <td>{row.present}</td>
                    <td>{row.absent}</td>
                    <td>{row.late}</td>
                    <td>
                      <div className="share-cell">
                        <Progress
                          value={row.attendance_rate}
                          max={100}
                          tone={row.attendance_rate >= 85 ? "green" : "amber"}
                        />
                        <span>{row.attendance_rate.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td>{row.leave_days}</td>
                    <td>
                      {row.reviews ? (
                        <span className="rating-inline">
                          <Star size={13} fill="currentColor" />
                          {row.average_rating.toFixed(1)}
                          <small>({row.reviews})</small>
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="insight-strip">
        <span className="icon-tile icon-tile-teal">
          <Gauge size={18} />
        </span>
        <p>
          <strong>
            {overview.attendance_rate}% attendance across{" "}
            {overview.attendance_records} records
          </strong>{" "}
          from {formatDate(report.filters.start_date)} to{" "}
          {formatDate(report.filters.end_date)}
          {report.filters.department ? ` for ${report.filters.department}` : ""}.
          Use the date presets to compare busy periods, or export the filtered
          snapshot for a leadership review.
        </p>
      </section>
    </div>
  );
}
