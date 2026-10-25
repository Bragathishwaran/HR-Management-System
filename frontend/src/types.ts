export type Role = "EMPLOYEE" | "HR" | "ADMIN";
export type EmployeeStatus = "ACTIVE" | "INACTIVE";
export type AttendanceStatus = "PRESENT" | "ABSENT" | "HALF_DAY";
export type LeaveType = "SICK" | "CASUAL" | "PAID";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface User {
  id: number;
  username: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface Employee {
  id: number;
  user_id: number;
  full_name: string;
  designation: string;
  department: string;
  joining_date: string;
  salary: number | null;
  status: EmployeeStatus;
  username: string | null;
  email: string | null;
}

export interface AttendanceRecord {
  id: number;
  employee_id: number;
  date: string;
  check_in: string | null;
  check_out: string | null;
  working_hours: number | null;
  status: AttendanceStatus;
  is_late: boolean;
  late_minutes: number | null;
  overtime_hours: number | null;
}

export interface CheckInOutResponse {
  attendance: AttendanceRecord;
  message: string;
}

export interface AutoMarkAbsentResponse {
  date: string;
  created: number;
  skipped_existing: number;
  skipped_on_leave: number;
  employee_ids: number[];
}

export interface Leave {
  id: number;
  employee_id: number;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  reason: string;
  status: LeaveStatus;
  created_at: string;
  days_requested: number;
}

export interface LeavePolicy {
  id: number;
  leave_type: LeaveType;
  total_days_allowed: number;
}

export interface LeaveBalance {
  id: number;
  employee_id: number;
  leave_type: LeaveType;
  remaining_days: number;
  total_days_allowed: number | null;
  employee_name: string | null;
}

export interface PayrollBreakdown {
  basic: number;
  allowances: number;
  bonus: number;
  deductions: number;
  gross_salary: number;
  net_salary: number;
}

export interface Payroll {
  id: number;
  employee_id: number;
  basic_salary: number;
  allowances: number;
  deductions: number;
  bonus: number;
  net_salary: number;
  month: string;
  created_at: string;
  gross_salary: number;
  breakdown: PayrollBreakdown;
}

export interface PayrollDetail extends Payroll {
  employee_name: string | null;
  designation: string | null;
  department: string | null;
}

export interface PayrollSummary {
  month: string;
  employees_paid: number;
  total_basic: number;
  total_allowances: number;
  total_bonus: number;
  total_deductions: number;
  total_gross: number;
  total_net: number;
}

export interface PayrollOverview {
  month: string;
  total_net_salary: number;
  records_generated: number;
}

export interface DashboardStats {
  total_employees: number;
  active_employees: number;
  present_today: number;
  half_day_today: number;
  pending_leave_requests: number;
  employees_on_leave_today: number;
  payroll_overview: PayrollOverview;
}

export interface AdminAnalytics {
  total_users: number;
  active_users: number;
  inactive_users: number;
  users_by_role: Record<string, number>;
  total_employees: number;
  active_employees: number;
  department_distribution: Record<string, number>;
  pending_leave_requests: number;
  attendance_today: Record<string, number>;
  payroll_overview: PayrollOverview;
}

export interface SelfServiceDashboard {
  profile: Employee;
  today_attendance: AttendanceRecord | null;
  leave_balances: LeaveBalance[];
  pending_leave_requests: number;
  latest_payroll: Payroll | null;
  unread_notifications: number;
}

export interface AttendanceTrendPoint {
  date: string;
  present: number;
  absent: number;
  half_day: number;
}

export interface LeaveStatusBreakdown {
  pending: number;
  approved: number;
  rejected: number;
}

export interface PayrollTrendPoint {
  month: string;
  total_net: number;
  records: number;
}

export interface DepartmentCount {
  department: string;
  count: number;
}

export interface DashboardTrends {
  attendance_trend: AttendanceTrendPoint[];
  leave_breakdown: LeaveStatusBreakdown;
  payroll_trend: PayrollTrendPoint[];
  department_distribution: DepartmentCount[];
}

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface NotificationList {
  total: number;
  unread: number;
  items: NotificationItem[];
}
