import { useMemo, useState, type FormEvent } from "react";
import {
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CalendarX2,
  Check,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useResource } from "../hooks/useResource";
import { endpoints } from "../lib/api";
import {
  daysBetween,
  formatDate,
  leaveAccent,
  statusLabel,
  todayISO,
} from "../lib/format";
import type { Leave, LeaveStatus, LeaveType } from "../types";
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
  Progress,
  Select,
  StatCard,
  Textarea,
} from "../components/UI";

const leaveTypes: LeaveType[] = ["SICK", "CASUAL", "PAID"];

function EmployeeLeaves() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    leave_type: "CASUAL" as LeaveType,
    start_date: todayISO(),
    end_date: todayISO(),
    reason: "",
  });

  const resource = useResource(async () => {
    const [balances, leaves, policies] = await Promise.all([
      endpoints.myBalances(),
      endpoints.myLeaves({ limit: 100 }),
      endpoints.leavePolicies(),
    ]);
    return { balances, leaves, policies };
  }, []);

  if (resource.loading && !resource.data) {
    return <LoadingState label="Loading your leave balance…" />;
  }
  if (resource.error || !resource.data) {
    return <ErrorState message={resource.error || "Leave data unavailable"} onRetry={resource.refresh} />;
  }

  const { balances, leaves, policies } = resource.data;
  const selectedBalance = balances.find((balance) => balance.leave_type === form.leave_type);
  const requestedDays = daysBetween(form.start_date, form.end_date);
  const pending = leaves.filter((leave) => leave.status === "PENDING").length;
  const approved = leaves.filter((leave) => leave.status === "APPROVED").length;
  const totalRemaining = balances.reduce((sum, balance) => sum + balance.remaining_days, 0);
  const totalAllowed = balances.reduce(
    (sum, balance) => sum + (balance.total_days_allowed || 0),
    0,
  );

  const openModal = () => {
    setForm({
      leave_type: "CASUAL",
      start_date: todayISO(),
      end_date: todayISO(),
      reason: "",
    });
    setError(null);
    setOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (new Date(form.end_date) < new Date(form.start_date)) {
      setError("The end date must be on or after the start date.");
      return;
    }
    if (selectedBalance && requestedDays > selectedBalance.remaining_days) {
      setError(
        `Only ${selectedBalance.remaining_days} day(s) of ${statusLabel(form.leave_type)} remain.`,
      );
      return;
    }
    setSaving(true);
    try {
      await endpoints.applyLeave(form);
      toast.success("Leave request sent", `${requestedDays} day(s) submitted for approval.`);
      setOpen(false);
      resource.refresh();
      window.dispatchEvent(new Event("worksphere:notifications"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Time off"
        title="Your leave"
        description="Plan time away with a clear view of what’s left."
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
            <Button icon={<Plus size={16} />} onClick={openModal}>
              Apply for leave
            </Button>
          </>
        }
      />

      <section className="stats-grid">
        <StatCard
          label="Days available"
          value={totalRemaining}
          meta={`of ${totalAllowed} this year`}
          icon={CalendarDays}
          tone="green"
        />
        <StatCard label="Pending" value={pending} meta="Awaiting People Ops" icon={CalendarClock} tone="amber" />
        <StatCard label="Approved" value={approved} meta="Requests this year" icon={CalendarCheck2} tone="teal" />
        <StatCard label="Requests" value={leaves.length} meta={`${policies.length} leave types`} icon={Sparkles} tone="purple" />
      </section>

      <section className="balance-grid">
        {balances.map((balance) => {
          const total = balance.total_days_allowed || 1;
          const tone = leaveAccent(balance.leave_type);
          const used = Math.max(0, total - balance.remaining_days);
          return (
            <article key={balance.leave_type} className={`card balance-card balance-${tone}`}>
              <div className="balance-card-head">
                <span className={`balance-orb balance-orb-${tone}`}>
                  <CalendarDays size={19} />
                </span>
                <div>
                  <strong>{statusLabel(balance.leave_type)}</strong>
                  <span>{balance.total_days_allowed} days per year</span>
                </div>
                <span className="balance-count">
                  {balance.remaining_days}
                  <small>left</small>
                </span>
              </div>
              <Progress
                value={balance.remaining_days}
                max={total}
                tone={tone === "rose" ? "rose" : tone === "amber" ? "amber" : "green"}
              />
              <div className="balance-card-foot">
                <span>{used} used</span>
                <span>{total} allocated</span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="card table-card">
        <div className="card-heading card-heading-inset">
          <div>
            <h2>Leave history</h2>
            <p>Every request and its latest status</p>
          </div>
          <Badge tone="slate">{leaves.length} requests</Badge>
        </div>

        {leaves.length === 0 ? (
          <EmptyState
            icon={CalendarX2}
            title="No leave requests yet"
            description="Ready for a break? Submit your first request."
            action={
              <Button size="sm" onClick={openModal}>
                Apply for leave
              </Button>
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Days</th>
                  <th>Reason</th>
                  <th>Requested</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {leaves.map((leave) => (
                  <tr key={leave.id}>
                    <td>
                      <Badge status={leave.leave_type} />
                    </td>
                    <td className="cell-strong">{formatDate(leave.start_date)}</td>
                    <td>{formatDate(leave.end_date)}</td>
                    <td>{leave.days_requested}</td>
                    <td className="cell-wrap">{leave.reason}</td>
                    <td>{formatDate(leave.created_at)}</td>
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

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Apply for leave"
        description="Choose your dates and tell your manager what’s up."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="leave-form" loading={saving}>
              Submit request
            </Button>
          </>
        }
      >
        <form id="leave-form" className="modal-form" onSubmit={submit}>
          {error && <div className="form-alert">{error}</div>}

          <Field label="Leave type" htmlFor="leave-type" required>
            <Select
              id="leave-type"
              value={form.leave_type}
              onChange={(event) =>
                setForm((current) => ({ ...current, leave_type: event.target.value as LeaveType }))
              }
            >
              {leaveTypes.map((type) => {
                const balance = balances.find((item) => item.leave_type === type);
                return (
                  <option key={type} value={type}>
                    {statusLabel(type)} · {balance?.remaining_days ?? 0} days left
                  </option>
                );
              })}
            </Select>
          </Field>

          <div className="form-grid">
            <Field label="Start date" htmlFor="leave-start" required>
              <Input
                id="leave-start"
                type="date"
                value={form.start_date}
                onChange={(event) =>
                  setForm((current) => ({ ...current, start_date: event.target.value }))
                }
                required
              />
            </Field>
            <Field label="End date" htmlFor="leave-end" required>
              <Input
                id="leave-end"
                type="date"
                min={form.start_date}
                value={form.end_date}
                onChange={(event) =>
                  setForm((current) => ({ ...current, end_date: event.target.value }))
                }
                required
              />
            </Field>
          </div>

          <div className="leave-summary">
            <div>
              <span>Requesting</span>
              <strong>{requestedDays} day{requestedDays === 1 ? "" : "s"}</strong>
            </div>
            <div>
              <span>Available after</span>
              <strong>
                {selectedBalance
                  ? Math.max(0, selectedBalance.remaining_days - requestedDays)
                  : "—"}{" "}
                days
              </strong>
            </div>
          </div>

          <Field label="Reason" htmlFor="leave-reason" required>
            <Textarea
              id="leave-reason"
              value={form.reason}
              onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
              placeholder="A short note about your time away…"
              rows={4}
              minLength={3}
              maxLength={500}
              required
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}

function StaffLeaves() {
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState<"ALL" | LeaveStatus>("PENDING");
  const [typeFilter, setTypeFilter] = useState<"ALL" | LeaveType>("ALL");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [processingId, setProcessingId] = useState<number | null>(null);

  const resource = useResource(async () => {
    const [leaves, employees] = await Promise.all([
      endpoints.leaves({ limit: 200 }),
      endpoints.employees({ limit: 100 }),
    ]);
    return { leaves, employees };
  }, []);

  if (resource.loading && !resource.data) {
    return <LoadingState label="Reviewing leave requests…" />;
  }
  if (resource.error || !resource.data) {
    return <ErrorState message={resource.error || "Leave data unavailable"} onRetry={resource.refresh} />;
  }

  const { leaves, employees } = resource.data;
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const filtered = useMemo(
    () =>
      leaves.filter((leave) => {
        const statusMatch = statusFilter === "ALL" || leave.status === statusFilter;
        const typeMatch = typeFilter === "ALL" || leave.leave_type === typeFilter;
        const employeeMatch =
          employeeFilter === "all" || leave.employee_id === Number(employeeFilter);
        return statusMatch && typeMatch && employeeMatch;
      }),
    [leaves, statusFilter, typeFilter, employeeFilter],
  );

  const pending = leaves.filter((leave) => leave.status === "PENDING").length;
  const approved = leaves.filter((leave) => leave.status === "APPROVED").length;
  const rejected = leaves.filter((leave) => leave.status === "REJECTED").length;

  const decide = async (leave: Leave, status: Exclude<LeaveStatus, "PENDING">) => {
    setProcessingId(leave.id);
    try {
      await endpoints.updateLeaveStatus(leave.id, status);
      toast.success(
        status === "APPROVED" ? "Leave approved" : "Leave rejected",
        `${employeeMap.get(leave.employee_id)?.full_name || "Employee"} was notified.`,
      );
      resource.refresh();
      window.dispatchEvent(new Event("worksphere:notifications"));
    } catch (error) {
      toast.error("Could not update request", (error as Error).message);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Time off"
        title="Leave management"
        description="Review requests, keep balances fair and give people a clear answer."
        actions={
          <Button
            variant="secondary"
            icon={<RefreshCw size={16} />}
            onClick={resource.refresh}
            loading={resource.loading}
          >
            Refresh queue
          </Button>
        }
      />

      <section className="stats-grid">
        <StatCard label="Awaiting review" value={pending} meta="Needs a decision" icon={CalendarClock} tone="amber" />
        <StatCard label="Approved" value={approved} meta="All time" icon={CalendarCheck2} tone="green" />
        <StatCard label="Rejected" value={rejected} meta="All time" icon={CalendarX2} tone="rose" />
        <StatCard label="Total requests" value={leaves.length} meta={`${employees.length} employees`} icon={CalendarDays} tone="blue" />
      </section>

      <section className="card table-card">
        <div className="table-toolbar table-toolbar-wrap">
          <div className="toolbar-left">
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "ALL" | LeaveStatus)}
              aria-label="Filter by status"
              className="toolbar-select"
            >
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="ALL">All statuses</option>
            </Select>
            <Select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as "ALL" | LeaveType)}
              aria-label="Filter by leave type"
              className="toolbar-select"
            >
              <option value="ALL">All leave types</option>
              <option value="SICK">Sick leave</option>
              <option value="CASUAL">Casual leave</option>
              <option value="PAID">Paid leave</option>
            </Select>
            <Select
              value={employeeFilter}
              onChange={(event) => setEmployeeFilter(event.target.value)}
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
          </div>
          <span className="table-count">{filtered.length} requests</span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={CalendarCheck2}
            title={statusFilter === "PENDING" ? "No requests waiting" : "No matching requests"}
            description={
              statusFilter === "PENDING"
                ? "Your approval queue is empty. Everyone has an answer."
                : "Try a different status, type or employee."
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table leave-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Type</th>
                  <th>Dates</th>
                  <th>Days</th>
                  <th>Reason</th>
                  <th>Requested</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((leave) => {
                  const employee = employeeMap.get(leave.employee_id);
                  const name = employee?.full_name || `Employee #${leave.employee_id}`;
                  return (
                    <tr key={leave.id}>
                      <td>
                        <div className="person-cell">
                          <Avatar name={name} size="xs" />
                          <div>
                            <span className="person-name">{name}</span>
                            <span className="person-sub">{employee?.department || "—"}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge status={leave.leave_type} />
                      </td>
                      <td>
                        <span className="cell-strong">{formatDate(leave.start_date)}</span>
                        <span className="table-sub"> → {formatDate(leave.end_date)}</span>
                      </td>
                      <td>{leave.days_requested}</td>
                      <td className="cell-wrap cell-reason">{leave.reason}</td>
                      <td>{formatDate(leave.created_at)}</td>
                      <td>
                        <Badge status={leave.status} dot />
                      </td>
                      <td>
                        {leave.status === "PENDING" ? (
                          <div className="row-actions">
                            <button
                              type="button"
                              className="action-approve action-labeled"
                              onClick={() => decide(leave, "APPROVED")}
                              disabled={processingId === leave.id}
                            >
                              <Check size={14} /> Approve
                            </button>
                            <button
                              type="button"
                              className="action-reject action-labeled"
                              onClick={() => decide(leave, "REJECTED")}
                              disabled={processingId === leave.id}
                            >
                              <X size={14} /> Reject
                            </button>
                          </div>
                        ) : (
                          <span className="muted">Reviewed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function LeavesPage() {
  const { hasRole } = useAuth();
  return hasRole("HR", "ADMIN") ? <StaffLeaves /> : <EmployeeLeaves />;
}
