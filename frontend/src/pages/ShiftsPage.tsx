import { useMemo, useState } from "react";
import {
  AlarmClock,
  CalendarDays,
  Clock3,
  Moon,
  RefreshCw,
  Sun,
  Sunrise,
  Trash2,
  UserCog,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useResource } from "../hooks/useResource";
import { endpoints } from "../lib/api";
import {
  formatDate,
  formatTime,
  todayISO,
} from "../lib/format";
import type { ShiftName } from "../types";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Select,
  StatCard,
} from "../components/UI";

const shiftIcons: Record<ShiftName, LucideIcon> = {
  MORNING: Sunrise,
  EVENING: Sun,
  NIGHT: Moon,
};

function shiftTime(value: string): string {
  return value.slice(0, 5);
}

export function ShiftsPage() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const canManage = hasRole("HR", "ADMIN");
  const [date, setDate] = useState(todayISO());
  const [department, setDepartment] = useState("all");
  const [assignOpen, setAssignOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);

  const resource = useResource(async () => {
    const [shifts, schedule, assignments, employees] = await Promise.all([
      endpoints.shifts(),
      endpoints.shiftSchedule({
        date,
        department: department === "all" ? undefined : department,
      }),
      endpoints.shiftAssignments(
        department === "all" ? undefined : { department },
      ),
      canManage ? endpoints.employees({ limit: 100 }) : Promise.resolve([]),
    ]);
    return { shifts, schedule, assignments, employees };
  }, [date, department, canManage]);

  const shifts = resource.data?.shifts || [];
  const schedule = resource.data?.schedule || [];
  const assignments = resource.data?.assignments || [];
  const employees = resource.data?.employees || [];

  const departments = useMemo(
    () =>
      Array.from(new Set(schedule.map((entry) => entry.department))).sort(),
    [schedule],
  );

  const stats = useMemo(() => {
    const assigned = schedule.filter((entry) => entry.shift).length;
    const late = schedule.filter((entry) => entry.is_late).length;
    const early = schedule.filter((entry) => entry.is_early_exit).length;
    const unassigned = schedule.length - assigned;
    return { assigned, late, early, unassigned };
  }, [schedule]);

  const shiftCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    schedule.forEach((entry) => {
      const key = entry.shift?.name || "UNASSIGNED";
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [schedule]);

  const openAssign = (presetEmployee?: number, presetShift?: number) => {
    setEmployeeId(presetEmployee ? String(presetEmployee) : "");
    setShiftId(presetShift ? String(presetShift) : "");
    setAssignOpen(true);
  };

  const submitAssignment = async () => {
    if (!employeeId || !shiftId) {
      toast.error("Choose an employee and a shift", "Both fields are required.");
      return;
    }
    setSaving(true);
    try {
      const result = await endpoints.assignShift(Number(employeeId), Number(shiftId));
      toast.success(
        "Shift assigned",
        `${result.employee_name} now works the ${result.shift.name.toLowerCase()} shift.`,
      );
      setAssignOpen(false);
      resource.refresh();
      window.dispatchEvent(new Event("worksphere:notifications"));
    } catch (error) {
      toast.error("Could not assign shift", (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const removeAssignment = async (id: number, name: string) => {
    try {
      await endpoints.removeShiftAssignment(id);
      toast.success("Assignment removed", `${name} no longer has a fixed shift.`);
      resource.refresh();
    } catch (error) {
      toast.error("Could not remove assignment", (error as Error).message);
    }
  };

  const runAutomation = async () => {
    setProcessing(true);
    try {
      const result = await endpoints.autoProcessAttendance(date);
      toast.success(
        "Attendance automation complete",
        `${result.marked_absent} absent · ${result.marked_late} late · ${result.marked_early_exit} early exits · ${result.skipped_on_leave} on leave.`,
      );
      resource.refresh();
      window.dispatchEvent(new Event("worksphere:notifications"));
    } catch (error) {
      toast.error("Automation failed", (error as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  if (resource.loading && !resource.data) {
    return <LoadingState label="Building the shift schedule…" />;
  }
  if (resource.error) {
    return <ErrorState message={resource.error} onRetry={resource.refresh} />;
  }

  const ownAssignment = assignments[0];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Workforce scheduling"
        title="Shifts & schedule"
        description="Plan coverage across morning, evening and overnight shifts."
        actions={
          canManage ? (
            <>
              <Button
                variant="secondary"
                icon={<RefreshCw size={16} />}
                onClick={runAutomation}
                loading={processing}
              >
                Run automation
              </Button>
              <Button icon={<UserPlus size={16} />} onClick={() => openAssign()}>
                Assign shift
              </Button>
            </>
          ) : undefined
        }
      />

      {!canManage && ownAssignment && (
        <section className="shift-hero card">
          <div>
            <span className="eyebrow">Your shift</span>
            <h2>{ownAssignment.shift.name.charAt(0) + ownAssignment.shift.name.slice(1).toLowerCase()}</h2>
            <p>
              {shiftTime(ownAssignment.shift.start_time)} –{" "}
              {shiftTime(ownAssignment.shift.end_time)} UTC
            </p>
          </div>
          <div className="shift-hero-grid">
            <div>
              <span>Assigned since</span>
              <strong>{formatDate(ownAssignment.assigned_at)}</strong>
            </div>
            <div>
              <span>Department</span>
              <strong>{ownAssignment.department}</strong>
            </div>
            <div>
              <span>Overnight</span>
              <strong>
                {ownAssignment.shift.end_time <= ownAssignment.shift.start_time
                  ? "Yes"
                  : "No"}
              </strong>
            </div>
          </div>
        </section>
      )}

      <section className="stats-grid">
        <StatCard
          label="On a shift"
          value={stats.assigned}
          meta={`${schedule.length} people scheduled`}
          icon={Users}
          tone="green"
        />
        <StatCard
          label="Late arrivals"
          value={stats.late}
          meta={formatDate(date)}
          icon={AlarmClock}
          tone="amber"
        />
        <StatCard
          label="Early exits"
          value={stats.early}
          meta="Left before shift end"
          icon={Clock3}
          tone="rose"
        />
        <StatCard
          label="No shift set"
          value={stats.unassigned}
          meta="Using company hours"
          icon={UserCog}
          tone="purple"
        />
      </section>

      <section className="card table-card">
        <div className="table-toolbar table-toolbar-wrap">
          <div className="toolbar-left">
            <div className="date-filter">
              <label htmlFor="shift-date">Schedule date</label>
              <Input
                id="shift-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            {canManage && (
              <Select
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                aria-label="Filter schedule by department"
                className="toolbar-select"
              >
                <option value="all">All departments</option>
                {departments.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            )}
            <span className="shift-count-row">
              {shifts.map((shift) => (
                <span key={shift.id} className="shift-pill">
                  {shift.name.charAt(0) + shift.name.slice(1).toLowerCase()}
                  <strong>{shiftCounts[shift.name] || 0}</strong>
                </span>
              ))}
              {(shiftCounts.UNASSIGNED || 0) > 0 && (
                <span className="shift-pill shift-pill-muted">
                  Unassigned <strong>{shiftCounts.UNASSIGNED}</strong>
                </span>
              )}
            </span>
          </div>
          <span className="table-count">{schedule.length} people</span>
        </div>

        {schedule.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No one scheduled"
            description="Assign shifts to see the daily coverage plan."
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Shift</th>
                  <th>Window</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Punctuality</th>
                  <th>Status</th>
                  {canManage && <th aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {schedule.map((entry) => {
                  const ShiftIcon = entry.shift ? shiftIcons[entry.shift.name] : Clock3;
                  return (
                    <tr key={entry.employee_id}>
                      <td>
                        <div className="person-cell">
                          <Avatar name={entry.employee_name} size="xs" />
                          <div>
                            <span className="person-name">{entry.employee_name}</span>
                            <span className="person-sub">
                              {entry.designation} · {entry.department}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        {entry.shift ? (
                          <span className={`shift-chip shift-${entry.shift.name.toLowerCase()}`}>
                            <ShiftIcon size={13} />
                            {entry.shift.name.charAt(0) + entry.shift.name.slice(1).toLowerCase()}
                          </span>
                        ) : (
                          <span className="muted">Company hours</span>
                        )}
                      </td>
                      <td>
                        {entry.shift
                          ? `${shiftTime(entry.shift.start_time)} – ${shiftTime(entry.shift.end_time)}`
                          : "09:00 – 17:00"}
                      </td>
                      <td>{formatTime(entry.check_in)}</td>
                      <td>{formatTime(entry.check_out)}</td>
                      <td>
                        {entry.is_late ? (
                          <span className="late-mark">{entry.late_minutes} min late</span>
                        ) : entry.is_early_exit ? (
                          <span className="early-mark">
                            {entry.early_exit_minutes} min early
                          </span>
                        ) : (
                          <span className="muted">On schedule</span>
                        )}
                      </td>
                      <td>
                        {entry.attendance_status ? (
                          <Badge status={entry.attendance_status} dot />
                        ) : (
                          <Badge tone="slate">Not checked in</Badge>
                        )}
                      </td>
                      {canManage && (
                        <td className="cell-actions">
                          <button
                            type="button"
                            className="table-action"
                            title="Change shift"
                            aria-label={`Change shift for ${entry.employee_name}`}
                            onClick={() =>
                              openAssign(entry.employee_id, entry.shift?.id)
                            }
                          >
                            <UserCog size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card table-card">
        <div className="card-heading card-heading-inset">
          <div>
            <h2>Shift assignments</h2>
            <p>
              {canManage
                ? "One active shift per employee; choosing a new shift replaces the old one."
                : "Your current shift assignment."}
            </p>
          </div>
          <Badge tone="slate">{assignments.length} assigned</Badge>
        </div>
        {assignments.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title="No shift assignments yet"
            description={
              canManage
                ? "Assign a shift to start tracking punctuality against it."
                : "People Ops has not assigned a fixed shift to your profile."
            }
            action={
              canManage ? (
                <Button size="sm" onClick={() => openAssign()}>
                  Assign a shift
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Shift</th>
                  <th>Window (UTC)</th>
                  <th>Assigned</th>
                  {canManage && <th aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td>
                      <span className="person-name">{assignment.employee_name}</span>
                    </td>
                    <td>
                      <span className="department-chip">{assignment.department}</span>
                    </td>
                    <td>
                      <Badge tone="blue">{assignment.shift.name}</Badge>
                    </td>
                    <td>
                      {shiftTime(assignment.shift.start_time)} –{" "}
                      {shiftTime(assignment.shift.end_time)}
                    </td>
                    <td>{formatDate(assignment.assigned_at)}</td>
                    {canManage && (
                      <td className="cell-actions">
                        <IconButton
                          label={`Remove shift for ${assignment.employee_name}`}
                          onClick={() =>
                            removeAssignment(assignment.employee_id, assignment.employee_name)
                          }
                        >
                          <Trash2 size={15} />
                        </IconButton>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManage && (
        <section className="insight-strip">
          <span className="icon-tile icon-tile-purple">
            <UserCog size={18} />
          </span>
          <p>
            <strong>Automation runs against the selected date.</strong> It marks
            missing employees absent after their grace window and recalculates late
            arrivals and early exits for anyone with a recorded check-in.
          </p>
        </section>
      )}

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign a shift"
        description="Each employee has one active shift. Assigning a new shift replaces the current one."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submitAssignment} loading={saving}>
              Save assignment
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Employee" htmlFor="assign-employee" required>
            <Select
              id="assign-employee"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
            >
              <option value="">Select an employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name} · {employee.department}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Shift" htmlFor="assign-shift" required>
            <Select
              id="assign-shift"
              value={shiftId}
              onChange={(event) => setShiftId(event.target.value)}
            >
              <option value="">Select a shift</option>
              {shifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shift.name} · {shiftTime(shift.start_time)} –{" "}
                  {shiftTime(shift.end_time)} UTC
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {employeeId && assignments.some((item) => item.employee_id === Number(employeeId)) && (
          <p className="form-note">
            This employee already has an assignment. Saving will replace it and notify
            them.
          </p>
        )}
      </Modal>
    </div>
  );
}
