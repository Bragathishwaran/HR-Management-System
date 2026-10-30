import type {
  AttendanceStatus,
  EmployeeStatus,
  LeaveStatus,
  LeaveType,
  Role,
} from "../types";

const CURRENCY = import.meta.env.VITE_CURRENCY || "INR";

export function formatCurrency(value: number | null | undefined, compact = false): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: CURRENCY,
      maximumFractionDigits: compact ? 1 : 0,
      notation: compact ? "compact" : "standard",
    }).format(value);
  } catch {
    return `${CURRENCY} ${value.toLocaleString("en-IN")}`;
  }
}

/** Backend datetimes are naive UTC; add Z so browsers don't treat them as local. */
export function parseApiDateTime(value: string): Date {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasZone ? value : `${value}Z`);
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  return parseApiDateTime(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return parseApiDateTime(value).toLocaleString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value: string | null | undefined, withYear = true): string {
  if (!value) return "—";
  const date = value.length <= 10 ? new Date(`${value}T00:00:00`) : parseApiDateTime(value);
  return date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" as const } : {}),
  });
}

export function formatDateLong(value: string | null | undefined): string {
  if (!value) return "—";
  const date = value.length <= 10 ? new Date(`${value}T00:00:00`) : parseApiDateTime(value);
  return date.toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function timeAgo(value: string): string {
  const timestamp = parseApiDateTime(value).getTime();
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value, false);
}

export function todayISO(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function monthKey(date = new Date()): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function monthInputFromKey(key: string): string {
  const parsed = new Date(`${key} 1`);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 7);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

export function monthKeyFromInput(value: string): string {
  if (!value) return monthKey();
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function daysBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);
}

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export const roleLabel: Record<Role, string> = {
  EMPLOYEE: "Employee",
  HR: "People Ops",
  ADMIN: "Administrator",
};

export function statusLabel(
  status: AttendanceStatus | EmployeeStatus | LeaveStatus | string,
): string {
  const labels: Record<string, string> = {
    PRESENT: "Present",
    ABSENT: "Absent",
    HALF_DAY: "Half day",
    ACTIVE: "Active",
    INACTIVE: "Inactive",
    PENDING: "Pending",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    SICK: "Sick leave",
    CASUAL: "Casual leave",
    PAID: "Paid leave",
  };
  return labels[status] || titleCase(status);
}

export function leaveAccent(type: LeaveType): string {
  return {
    SICK: "rose",
    CASUAL: "amber",
    PAID: "teal",
  }[type];
}

export function downloadPayslip(payslip: {
  id: number;
  employee_name?: string | null;
  designation?: string | null;
  department?: string | null;
  month: string;
  basic_salary: number;
  allowances: number;
  bonus: number;
  deductions: number;
  gross_salary: number;
  net_salary: number;
  created_at?: string;
}): void {
  const name = payslip.employee_name || "Employee";
  const rows = [
    ["Basic salary", payslip.basic_salary],
    ["Allowances", payslip.allowances],
    ["Bonus", payslip.bonus],
    ["Gross salary", payslip.gross_salary],
    ["Deductions", -payslip.deductions],
    ["Net pay", payslip.net_salary],
  ];
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Payslip ${payslip.month} - ${name}</title>
<style>
  body{font-family:Inter,Arial,sans-serif;color:#161f1b;padding:48px;max-width:760px;margin:auto}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #161f1b;padding-bottom:24px}
  h1{margin:0;font-size:28px;letter-spacing:-.04em} .brand{font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#6d7a72}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 32px;margin:28px 0;font-size:14px}
  .meta span{color:#6b756f} .meta b{display:block;color:#161f1b;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:14px} td{padding:12px 0;border-bottom:1px solid #e8e5de}
  td:last-child{text-align:right;font-variant-numeric:tabular-nums}
  .net td{font-weight:700;font-size:18px;border-bottom:0;padding-top:22px}
  .foot{margin-top:48px;font-size:11px;color:#8a938d}
</style></head><body>
<div class="top"><div><div class="brand">WorkSphere</div><h1>Salary slip</h1></div><div style="text-align:right"><b>${payslip.month}</b><div style="font-size:12px;color:#6b756f">Slip #${String(payslip.id).padStart(5, "0")}</div></div></div>
<div class="meta">
  <div><span>Employee</span><b>${name}</b></div>
  <div><span>Department</span><b>${payslip.department || "—"}</b></div>
  <div><span>Designation</span><b>${payslip.designation || "—"}</b></div>
  <div><span>Monthly gross</span><b>${formatCurrency(payslip.gross_salary)}</b></div>
</div>
<table>${rows
    .map(
      ([label, value]) =>
        `<tr${label === "Net pay" ? ' class="net"' : ""}><td>${label}</td><td>${formatCurrency(
          value as number,
        )}</td></tr>`,
    )
    .join("")}</table>
<div class="foot">This is a system-generated payslip from WorkSphere HRMS. Please contact People Ops for any discrepancies.</div>
</body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `payslip-${name.replace(/\s+/g, "-").toLowerCase()}-${payslip.month}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename: string, rows: Array<Array<string | number>>): void {
  const content = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
