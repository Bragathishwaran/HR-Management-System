import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Download,
  Mail,
  Pencil,
  Phone,
  Trash2,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useResource } from "../hooks/useResource";
import { endpoints } from "../lib/api";
import {
  downloadPayslip,
  formatCurrency,
  formatDate,
  formatTime,
  leaveAccent,
  statusLabel,
} from "../lib/format";
import {
  Avatar,
  Badge,
  Button,
  ConfirmModal,
  EmptyState,
  ErrorState,
  LoadingState,
  Progress,
} from "../components/UI";
import { EmployeeFormModal } from "../components/EmployeeFormModal";

type DetailTab = "overview" | "attendance" | "leave" | "payslips";

export function EmployeeDetailPage() {
  const { id } = useParams();
  const employeeId = Number(id);
  const { hasRole, user, refreshUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const isStaff = hasRole("HR", "ADMIN");
  const [tab, setTab] = useState<DetailTab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);

  const resource = useResource(async () => {
    const employee = await endpoints.employee(employeeId);
    const [balances, attendance, leaves, payroll] = await Promise.all([
      endpoints.leaveBalances({ employee_id: employeeId }),
      endpoints.attendanceHistory({ employee_id: employeeId, limit: 60 }),
      endpoints.leaves({ employee_id: employeeId, limit: 30 }),
      endpoints.payroll({ employee_id: employeeId, limit: 30 }),
    ]);
    return { employee, balances, attendance, leaves, payroll };
  }, [employeeId]);

  const departments = useMemo(
    () => Array.from(new Set(resource.data ? [resource.data.employee.department] : [])),
    [resource.data],
  );

  if (resource.loading && !resource.data) {
    return <LoadingState label="Loading employee profile…" />;
  }
  if (resource.error || !resource.data) {
    return (
      <div className="page-stack">
        <button type="button" className="back-link" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Back
        </button>
        <ErrorState message={resource.error || "Employee not found"} onRetry={resource.refresh} />
      </div>
    );
  }

  const { employee, balances, attendance, leaves, payroll } = resource.data;
  const isOwn = employee.username === user?.username;
  const canEdit = isStaff;
  const presentCount = attendance.filter((record) => record.status === "PRESENT").length;
  const totalHours = attendance.reduce((sum, record) => sum + (record.working_hours || 0), 0);

  const remove = async () => {
    setDeleting(true);
    try {
      await endpoints.deleteEmployee(employee.id);
      toast.success("Employee removed", `${employee.full_name}’s profile was deleted.`);
      navigate("/employees");
    } catch (error) {
      toast.error("Could not delete employee", (error as Error).message);
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const onSaved = () => {
    resource.refresh();
    if (isOwn) void refreshUser().catch(() => undefined);
  };

  const handleDownload = async (payrollId: number) => {
    setDownloading(payrollId);
    try {
      const detail = await endpoints.payrollDetail(payrollId);
      downloadPayslip(detail);
      toast.success("Payslip downloaded", `Slip for ${detail.month} saved to your device.`);
    } catch (error) {
      toast.error("Download failed", (error as Error).message);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="page-stack">
      <div className="detail-topline">
        <button type="button" className="back-link" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Back to people
        </button>
        {canEdit && (
          <div className="page-actions">
            <Button
              variant="secondary"
              size="sm"
              icon={<Pencil size={15} />}
              onClick={() => setEditOpen(true)}
            >
              Edit
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 size={15} />}
              onClick={() => setDeleteOpen(true)}
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      <section className="profile-hero card">
        <div className="profile-hero-main">
          <Avatar name={employee.full_name} size="xl" />
          <div className="profile-hero-copy">
            <div className="profile-role-line">
              <Badge status="EMPLOYEE" />
              <Badge status={employee.status} dot />
            </div>
            <h1>{employee.full_name}</h1>
            <p>
              {employee.designation} · {employee.department}
            </p>
            <div className="profile-contact">
              {employee.email && (
                <span>
                  <Mail size={14} /> {employee.email}
                </span>
              )}
              {employee.username && (
                <span>
                  <UserRound size={14} /> @{employee.username}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="profile-hero-stats">
          <div>
            <span>Joined</span>
            <strong>{formatDate(employee.joining_date)}</strong>
          </div>
          <div>
            <span>Monthly salary</span>
            <strong>{formatCurrency(employee.salary)}</strong>
          </div>
          <div>
            <span>Present days</span>
            <strong>{presentCount}</strong>
          </div>
          <div>
            <span>Hours logged</span>
            <strong>{totalHours.toFixed(1)}h</strong>
          </div>
        </div>
      </section>

      <div className="tab-bar" role="tablist" aria-label="Employee details">
        {(
          [
            ["overview", "Overview"],
            ["attendance", `Attendance (${attendance.length})`],
            ["leave", `Leave (${leaves.length})`],
            ["payslips", `Payslips (${payroll.length})`],
          ] as Array<[DetailTab, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? "is-active" : ""}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="detail-grid">
          <section className="card detail-info-card">
            <div className="card-heading">
              <div>
                <h2>Employment details</h2>
                <p>The essentials, at a glance.</p>
              </div>
              <span className="icon-tile icon-tile-green">
                <BriefcaseBusiness size={18} />
              </span>
            </div>
            <div className="info-grid">
              <div>
                <span>
                  <Building2 size={14} /> Department
                </span>
                <strong>{employee.department}</strong>
              </div>
              <div>
                <span>
                  <BriefcaseBusiness size={14} /> Designation
                </span>
                <strong>{employee.designation}</strong>
              </div>
              <div>
                <span>
                  <CalendarDays size={14} /> Joining date
                </span>
                <strong>{formatDate(employee.joining_date)}</strong>
              </div>
              <div>
                <span>
                  <WalletCards size={14} /> Salary
                </span>
                <strong>{formatCurrency(employee.salary)} / month</strong>
              </div>
              <div>
                <span>
                  <Mail size={14} /> Email
                </span>
                <strong>{employee.email || "No account linked"}</strong>
              </div>
              <div>
                <span>
                  <Phone size={14} /> Status
                </span>
                <strong>{statusLabel(employee.status)}</strong>
              </div>
            </div>
          </section>

          <section className="card detail-balance-card">
            <div className="card-heading">
              <div>
                <h2>Leave balances</h2>
                <p>Remaining this year</p>
              </div>
              <Link to="/leaves" className="text-link">
                All leave
              </Link>
            </div>
            <div className="detail-balance-list">
              {balances.map((balance) => {
                const total = balance.total_days_allowed || 1;
                const tone = leaveAccent(balance.leave_type);
                return (
                  <div key={balance.leave_type} className="detail-balance-item">
                    <div>
                      <span className={`leave-dot leave-${tone}`} />
                      <strong>{statusLabel(balance.leave_type)}</strong>
                      <span>
                        {balance.remaining_days} / {balance.total_days_allowed || "—"} days left
                      </span>
                    </div>
                    <Progress
                      value={balance.remaining_days}
                      max={total}
                      tone={tone === "rose" ? "rose" : tone === "amber" ? "amber" : "green"}
                    />
                  </div>
                );
              })}
              {balances.length === 0 && <p className="muted">No leave balances initialised.</p>}
            </div>
          </section>

          <section className="card detail-activity-card">
            <div className="card-heading">
              <div>
                <h2>Recent attendance</h2>
                <p>Latest check-ins and hours</p>
              </div>
              <button type="button" className="text-button" onClick={() => setTab("attendance")}>
                View all
              </button>
            </div>
            {attendance.length === 0 ? (
              <EmptyState compact icon={CalendarDays} title="No attendance records" />
            ) : (
              <div className="mini-table-wrap">
                <table className="data-table compact-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>In</th>
                      <th>Out</th>
                      <th>Hours</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.slice(0, 5).map((record) => (
                      <tr key={record.id}>
                        <td>{formatDate(record.date)}</td>
                        <td>{formatTime(record.check_in)}</td>
                        <td>{formatTime(record.check_out)}</td>
                        <td>{record.working_hours ? `${record.working_hours.toFixed(1)}h` : "—"}</td>
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

          <section className="card detail-activity-card">
            <div className="card-heading">
              <div>
                <h2>Recent leave</h2>
                <p>Time-off activity</p>
              </div>
              <button type="button" className="text-button" onClick={() => setTab("leave")}>
                View all
              </button>
            </div>
            {leaves.length === 0 ? (
              <EmptyState compact icon={CalendarDays} title="No leave requests" />
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
                    {leaves.slice(0, 5).map((leave) => (
                      <tr key={leave.id}>
                        <td>
                          <Badge status={leave.leave_type} />
                        </td>
                        <td>
                          {formatDate(leave.start_date, false)} → {formatDate(leave.end_date, false)}
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
        </div>
      )}

      {tab === "attendance" && (
        <section className="card table-card">
          <div className="card-heading card-heading-inset">
            <div>
              <h2>Attendance history</h2>
              <p>Latest records for {employee.full_name}</p>
            </div>
          </div>
          {attendance.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No attendance records" description="Check-ins will appear here." />
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
                  {attendance.map((record) => (
                    <tr key={record.id}>
                      <td>{formatDate(record.date)}</td>
                      <td>{formatTime(record.check_in)}</td>
                      <td>{formatTime(record.check_out)}</td>
                      <td>{record.working_hours ? `${record.working_hours.toFixed(2)}h` : "—"}</td>
                      <td>{record.is_late ? `${record.late_minutes} min` : "On time"}</td>
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
      )}

      {tab === "leave" && (
        <section className="card table-card">
          <div className="card-heading card-heading-inset">
            <div>
              <h2>Leave history</h2>
              <p>Requests and outcomes</p>
            </div>
          </div>
          {leaves.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No leave requests" description="Time-off requests will appear here." />
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
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.map((leave) => (
                    <tr key={leave.id}>
                      <td>
                        <Badge status={leave.leave_type} />
                      </td>
                      <td>{formatDate(leave.start_date)}</td>
                      <td>{formatDate(leave.end_date)}</td>
                      <td>{leave.days_requested}</td>
                      <td className="cell-wrap">{leave.reason}</td>
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
      )}

      {tab === "payslips" && (
        <section className="card table-card">
          <div className="card-heading card-heading-inset">
            <div>
              <h2>Payslip history</h2>
              <p>Salary runs for {employee.full_name}</p>
            </div>
          </div>
          {payroll.length === 0 ? (
            <EmptyState icon={WalletCards} title="No payslips yet" description="Generated payslips will appear here." />
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Basic</th>
                    <th>Allowances</th>
                    <th>Bonus</th>
                    <th>Deductions</th>
                    <th>Net</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {payroll.map((record) => (
                    <tr key={record.id}>
                      <td className="cell-strong">{record.month}</td>
                      <td>{formatCurrency(record.basic_salary)}</td>
                      <td>{formatCurrency(record.allowances)}</td>
                      <td>{formatCurrency(record.bonus)}</td>
                      <td>-{formatCurrency(record.deductions)}</td>
                      <td className="cell-strong">{formatCurrency(record.net_salary)}</td>
                      <td>
                        <button
                          type="button"
                          className="table-action"
                          onClick={() => handleDownload(record.id)}
                          disabled={downloading === record.id}
                          aria-label={`Download payslip for ${record.month}`}
                        >
                          <Download size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <EmployeeFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        employee={employee}
        departments={departments}
        onSaved={onSaved}
      />

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={remove}
        title="Delete this employee?"
        description={`This permanently removes ${employee.full_name}’s profile and all attendance, leave and payroll records. The linked login account is also removed.`}
        confirmLabel="Delete employee"
        loading={deleting}
      />
    </div>
  );
}
