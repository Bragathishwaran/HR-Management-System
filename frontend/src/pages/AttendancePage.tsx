import { useMemo, useState } from "react";
import {
  CalendarCheck2,
  CalendarX2,
  Check,
  Clock3,
  Download,
  LogIn,
  LogOut,
  RefreshCw,
  Timer,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useNow, useResource } from "../hooks/useResource";
import { endpoints } from "../lib/api";
import {
  downloadCsv,
  formatDate,
  formatDateLong,
  formatTime,
  todayISO,
} from "../lib/format";
import type { AttendanceRecord, AttendanceStatus } from "../types";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Select,
  StatCard,
} from "../components/UI";

function EmployeeAttendance() {
  const toast = useToast();
  const now = useNow();
  const [clocking, setClocking] = useState<"in" | "out" | null>(null);

  const resource = useResource(async () => {
    const [today, history] = await Promise.all([
      endpoints.todayAttendance(),
      endpoints.myAttendance({ limit: 60 }),
    ]);
    return { today, history };
  }, []);

  if (resource.loading && !resource.data) {
    return <LoadingState label="Loading your attendance…" />;
  }
  if (resource.error || !resource.data) {
    return <ErrorState message={resource.error || "Attendance unavailable"} onRetry={resource.refresh} />;
  }

  const { today, history } = resource.data;
  const clockState = !today?.check_in ? "not-in" : !today?.check_out ? "working" : "done";
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const thisMonth = history.filter((record) => record.date.startsWith(monthPrefix));
  const present = thisMonth.filter((record) => record.status === "PRESENT").length;
  const halfDay = thisMonth.filter((record) => record.status === "HALF_DAY").length;
  const late = thisMonth.filter((record) => record.is_late).length;
  const hours = thisMonth.reduce((sum, record) => sum + (record.working_hours || 0), 0);

  const clockAction = async (action: "in" | "out") => {
    setClocking(action);
    try {
      const result = action === "in" ? await endpoints.checkIn() : await endpoints.checkOut();
      toast.success(action === "in" ? "Checked in" : "Checked out", result.message);
      resource.refresh();
      window.dispatchEvent(new Event("worksphere:notifications"));
    } catch (error) {
      toast.error("Attendance update failed", (error as Error).message);
    } finally {
      setClocking(null);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={formatDateLong(new Date().toISOString())}
        title="Your attendance"
        description="Check in, check out and keep an eye on your hours."
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

      <section className="attendance-hero-grid">
        <article className="clock-card attendance-clock">
          <div className="clock-card-top">
            <div>
              <span className="clock-eyebrow">
                <Clock3 size={15} /> Today’s shift
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
                ? "On the clock"
                : clockState === "done"
                  ? "Completed"
                  : "Not started"}
            </Badge>
          </div>
          <div className="clock-metrics">
            <div>
              <span>Checked in</span>
              <strong>{formatTime(today?.check_in)}</strong>
            </div>
            <div>
              <span>Checked out</span>
              <strong>{formatTime(today?.check_out)}</strong>
            </div>
            <div>
              <span>Recorded</span>
              <strong>
                {today?.working_hours ? `${today.working_hours.toFixed(2)}h` : "—"}
              </strong>
            </div>
          </div>
          <div className="clock-actions">
            {clockState === "not-in" && (
              <Button size="lg" loading={clocking === "in"} onClick={() => clockAction("in")} icon={<LogIn size={18} />}>
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
                <Check size={17} /> Shift complete · {today?.working_hours?.toFixed(1)}h recorded
              </span>
            )}
            {today?.is_late && <span className="clock-hint">Late by {today.late_minutes} minutes</span>}
          </div>
          <div className="clock-orbs">
            <span />
            <span />
          </div>
        </article>

        <div className="attendance-side">
          <div className="attendance-side-card">
            <span className="icon-tile icon-tile-green">
              <CalendarCheck2 size={18} />
            </span>
            <div>
              <span>Present this month</span>
              <strong>{present + halfDay} days</strong>
            </div>
          </div>
          <div className="attendance-side-card">
            <span className="icon-tile icon-tile-amber">
              <Timer size={18} />
            </span>
            <div>
              <span>Late arrivals</span>
              <strong>{late}</strong>
            </div>
          </div>
          <div className="attendance-side-card">
            <span className="icon-tile icon-tile-purple">
              <Clock3 size={18} />
            </span>
            <div>
              <span>Hours logged</span>
              <strong>{hours.toFixed(1)}h</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="card table-card">
        <div className="card-heading card-heading-inset">
          <div>
            <h2>Attendance history</h2>
            <p>Your latest 60 records</p>
          </div>
          <Badge tone="slate">{history.length} records</Badge>
        </div>
        {history.length === 0 ? (
          <EmptyState
            icon={CalendarX2}
            title="No attendance yet"
            description="Your first check-in will start your history."
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Working hours</th>
                  <th>Late</th>
                  <th>Overtime</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record) => (
                  <tr key={record.id}>
                    <td className="cell-strong">{formatDate(record.date)}</td>
                    <td>{formatTime(record.check_in)}</td>
                    <td>{formatTime(record.check_out)}</td>
                    <td>{record.working_hours ? `${record.working_hours.toFixed(2)}h` : "—"}</td>
                    <td>
                      {record.is_late ? (
                        <span className="late-mark">{record.late_minutes} min</span>
                      ) : (
                        <span className="muted">On time</span>
                      )}
                    </td>
                    <td>{record.overtime_hours ? `${record.overtime_hours.toFixed(2)}h` : "—"}</td>
                    <td>
                      <Badge status={record.status} dot />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StaffAttendance() {
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AttendanceStatus>("all");
  const [absentOpen, setAbsentOpen] = useState(false);
  const [absentDate, setAbsentDate] = useState(todayISO());
  const [marking, setMarking] = useState(false);

  const resource = useResource(async () => {
    const [records, employees] = await Promise.all([
      endpoints.attendanceHistory({
        employee_id: employeeId === "all" ? undefined : Number(employeeId),
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        limit: 200,
      }),
      endpoints.employees({ limit: 100 }),
    ]);
    return { records, employees };
  }, [employeeId, startDate, endDate]);

  const records = resource.data?.records || [];
  const employees = resource.data?.employees || [];
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));

  const filtered = useMemo(
    () => records.filter((record) => statusFilter === "all" || record.status === statusFilter),
    [records, statusFilter],
  );

  const present = records.filter((record) => record.status === "PRESENT").length;
  const absent = records.filter((record) => record.status === "ABSENT").length;
  const late = records.filter((record) => record.is_late).length;
  const averageHours =
    records.filter((record) => record.working_hours).length > 0
      ? records.reduce((sum, record) => sum + (record.working_hours || 0), 0) /
        records.filter((record) => record.working_hours).length
      : 0;

  const exportCsv = () => {
    downloadCsv("worksphere-attendance.csv", [
      ["Date", "Employee", "Check-in", "Check-out", "Hours", "Late minutes", "Status"],
      ...filtered.map((record) => [
        record.date,
        employeeMap.get(record.employee_id)?.full_name || `Employee #${record.employee_id}`,
        record.check_in ? formatTime(record.check_in) : "",
        record.check_out ? formatTime(record.check_out) : "",
        record.working_hours ?? "",
        record.late_minutes ?? "",
        record.status,
      ]),
    ]);
    toast.success("Attendance exported", `${filtered.length} records saved as CSV.`);
  };

  const runAbsentSweep = async () => {
    setMarking(true);
    try {
      const result = await endpoints.autoMarkAbsent(absentDate);
      toast.success(
        "Absence sweep complete",
        `${result.created} marked absent · ${result.skipped_existing} already recorded · ${result.skipped_on_leave} on leave.`,
      );
      setAbsentOpen(false);
      resource.refresh();
      window.dispatchEvent(new Event("worksphere:notifications"));
    } catch (error) {
      toast.error("Could not mark absences", (error as Error).message);
    } finally {
      setMarking(false);
    }
  };

  if (resource.loading && !resource.data) {
    return <LoadingState label="Gathering attendance records…" />;
  }
  if (resource.error) {
    return <ErrorState message={resource.error} onRetry={resource.refresh} />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Time & attendance"
        title="Attendance overview"
        description="Track who’s in, who’s away and where the late arrivals are."
        actions={
          <>
            <Button variant="secondary" icon={<Download size={16} />} onClick={exportCsv}>
              Export CSV
            </Button>
            <Button icon={<CalendarX2 size={16} />} onClick={() => setAbsentOpen(true)}>
              Mark absences
            </Button>
          </>
        }
      />

      <section className="stats-grid">
        <StatCard label="Records shown" value={filtered.length} meta={`${employees.length} people`} icon={Users} tone="green" />
        <StatCard
          label="Present"
          value={present}
          meta={`${records.length ? Math.round((present / records.length) * 100) : 0}% of records`}
          icon={UserRoundCheck}
          tone="teal"
        />
        <StatCard label="Absent" value={absent} meta={`${late} late arrivals`} icon={CalendarX2} tone="rose" />
        <StatCard label="Avg. hours" value={`${averageHours.toFixed(1)}h`} meta="Per completed shift" icon={Timer} tone="amber" />
      </section>

      <section className="card table-card">
        <div className="table-toolbar table-toolbar-wrap">
          <div className="toolbar-left">
            <Select
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              aria-label="Filter by employee"
              className="toolbar-select"
            >
              <option value="all">All employees</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </Select>
            <div className="date-filter">
              <label htmlFor="attendance-from">From</label>
              <Input
                id="attendance-from"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="date-filter">
              <label htmlFor="attendance-to">To</label>
              <Input
                id="attendance-to"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | AttendanceStatus)}
              aria-label="Filter by status"
              className="toolbar-select"
            >
              <option value="all">All statuses</option>
              <option value="PRESENT">Present</option>
              <option value="HALF_DAY">Half day</option>
              <option value="ABSENT">Absent</option>
            </Select>
            {(employeeId !== "all" || startDate || endDate || statusFilter !== "all") && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setEmployeeId("all");
                  setStartDate("");
                  setEndDate("");
                  setStatusFilter("all");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
          <span className="table-count">{filtered.length} records</span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={CalendarX2}
            title="No attendance records"
            description="Adjust the filters or run an absence sweep for the day."
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Hours</th>
                  <th>Late</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((record) => {
                  const employee = employeeMap.get(record.employee_id);
                  return (
                    <tr key={record.id}>
                      <td>
                        <div className="person-cell">
                          <Avatar
                            name={employee?.full_name || `Employee ${record.employee_id}`}
                            size="xs"
                          />
                          <div>
                            <span className="person-name">
                              {employee?.full_name || `Employee #${record.employee_id}`}
                            </span>
                            <span className="person-sub">{employee?.department || "—"}</span>
                          </div>
                        </div>
                      </td>
                      <td>{formatDate(record.date)}</td>
                      <td>{formatTime(record.check_in)}</td>
                      <td>{formatTime(record.check_out)}</td>
                      <td>{record.working_hours ? `${record.working_hours.toFixed(2)}h` : "—"}</td>
                      <td>
                        {record.is_late ? (
                          <span className="late-mark">{record.late_minutes} min</span>
                        ) : (
                          <span className="muted">On time</span>
                        )}
                      </td>
                      <td>
                        <Badge status={record.status} dot />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={absentOpen}
        onClose={() => setAbsentOpen(false)}
        title="Mark missing employees absent"
        description="Creates ABSENT records for active employees without a record that day. Approved leave is skipped, existing records are left untouched."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAbsentOpen(false)} disabled={marking}>
              Cancel
            </Button>
            <Button onClick={runAbsentSweep} loading={marking}>
              Run absence sweep
            </Button>
          </>
        }
      >
        <Field label="Attendance date" htmlFor="absent-date" hint="Future dates cannot be swept.">
          <Input
            id="absent-date"
            type="date"
            value={absentDate}
            max={todayISO()}
            onChange={(event) => setAbsentDate(event.target.value)}
          />
        </Field>
      </Modal>
    </div>
  );
}

export function AttendancePage() {
  const { hasRole } = useAuth();
  return hasRole("HR", "ADMIN") ? <StaffAttendance /> : <EmployeeAttendance />;
}
