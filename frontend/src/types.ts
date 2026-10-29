export type Role = "EMPLOYEE" | "HR" | "ADMIN";
export type EmployeeStatus = "ACTIVE" | "INACTIVE";
export type AttendanceStatus = "PRESENT" | "ABSENT" | "HALF_DAY";
export type LeaveType = "SICK" | "CASUAL" | "PAID";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED";
export type ShiftName = "MORNING" | "EVENING" | "NIGHT";
export type DocumentType = "ID_PROOF" | "CERTIFICATE" | "CONTRACT" | "OTHER";

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
  shift_id: number | null;
  is_early_exit: boolean;
  early_exit_minutes: number | null;
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
  category: string;
  dedupe_key: string | null;
  created_at: string;
}

export interface NotificationList {
  total: number;
  unread: number;
  items: NotificationItem[];
}

// ---------------------------------------------------------------------------
// Phase 3 — shifts, leave calendar, documents, performance, analytics, alerts
// ---------------------------------------------------------------------------
export interface Shift {
  id: number;
  name: ShiftName;
  start_time: string;
  end_time: string;
}

export interface EmployeeShift {
  id: number;
  employee_id: number;
  shift_id: number;
  assigned_at: string;
  employee_name: string;
  department: string;
  shift: Shift;
}

export interface ShiftScheduleEntry {
  employee_id: number;
  employee_name: string;
  department: string;
  designation: string;
  shift: Shift | null;
  attendance_status: AttendanceStatus | null;
  check_in: string | null;
  check_out: string | null;
  is_late: boolean;
  late_minutes: number | null;
  is_early_exit: boolean;
  early_exit_minutes: number | null;
}

export interface AutoAttendanceResponse {
  date: string;
  processed: number;
  marked_absent: number;
  marked_late: number;
  marked_early_exit: number;
  skipped_on_leave: number;
  employee_ids: number[];
}

export interface LeaveCalendarEntry {
  id: number;
  employee_id: number;
  employee_name: string;
  department: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  status: LeaveStatus;
  is_own: boolean;
  days: number;
}

export interface TeamMember {
  employee_id: number;
  full_name: string;
  designation: string;
  department: string;
  shift: Shift | null;
  today_attendance: AttendanceStatus | null;
}

export interface TeamAvailability {
  date: string;
  department: string | null;
  total_employees: number;
  available: TeamMember[];
  on_leave: LeaveCalendarEntry[];
}

export interface LeaveConflictEntry {
  id: number;
  employee_id: number;
  employee_name: string;
  department: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  status: LeaveStatus;
}

export interface LeaveConflictResponse {
  start_date: string;
  end_date: string;
  department: string | null;
  max_concurrent: number;
  allowed: boolean;
  conflict_count: number;
  conflicts: LeaveConflictEntry[];
}

export interface DocumentRecord {
  id: number;
  employee_id: number;
  file_name: string;
  file_url: string;
  document_type: DocumentType;
  content_type: string;
  file_size: number;
  expiry_date: string | null;
  uploaded_at: string;
  employee_name: string | null;
  uploaded_by: string | null;
}

export interface PerformanceReview {
  id: number;
  employee_id: number;
  review_period: string;
  rating: number;
  feedback: string;
  created_at: string;
  employee_name: string | null;
  department: string | null;
  reviewed_by: string | null;
}

export interface EmployeePerformanceSummary {
  employee_id: number;
  employee_name: string | null;
  average_rating: number;
  reviews: number;
  latest_rating: number | null;
  rating_distribution: Record<string, number>;
}

export interface DepartmentRating {
  department: string;
  average_rating: number;
  reviews: number;
}

export interface TeamPerformanceInsights {
  average_rating: number;
  total_reviews: number;
  rating_distribution: Record<string, number>;
  departments: DepartmentRating[];
}

export interface AnalyticsFilters {
  start_date: string | null;
  end_date: string | null;
  department: string | null;
}

export interface AnalyticsOverview {
  total_employees: number;
  active_employees: number;
  departments: number;
  attendance_records: number;
  present: number;
  absent: number;
  half_day: number;
  late: number;
  early_exits: number;
  attendance_rate: number;
  leave_requests: number;
  approved_leave_days: number;
  average_rating: number;
  reviews: number;
}

export interface AttendanceAnalyticsPoint {
  period: string;
  present: number;
  absent: number;
  half_day: number;
  late: number;
  total: number;
  attendance_rate: number;
}

export interface LeaveAnalyticsPoint {
  period: string;
  approved: number;
  pending: number;
  rejected: number;
  days: number;
}

export interface LeaveTypeMetric {
  leave_type: LeaveType;
  requests: number;
  days: number;
}

export interface DepartmentAnalyticsRow {
  department: string;
  headcount: number;
  present: number;
  absent: number;
  late: number;
  attendance_rate: number;
  leave_days: number;
  average_rating: number;
  reviews: number;
}

export interface AnalyticsReport {
  filters: AnalyticsFilters;
  overview: AnalyticsOverview;
  attendance_trends: AttendanceAnalyticsPoint[];
  leave_trends: LeaveAnalyticsPoint[];
  leave_types: LeaveTypeMetric[];
  performance: TeamPerformanceInsights;
  departments: DepartmentAnalyticsRow[];
}

export interface NotificationAlertSummary {
  unread: number;
  late_today: number;
  pending_leave_requests: number;
  documents_expiring: number;
  upcoming_document_expiries: DocumentRecord[];
}

export interface AlertRunResponse {
  created: number;
  skipped: number;
  message: string;
}

export interface EmployeeSearchItem extends Employee {
  role: Role | null;
  shift_name: ShiftName | null;
  attendance_rate: number;
  late_count: number;
  average_rating: number;
  review_count: number;
  today_attendance: AttendanceStatus | null;
  on_leave_today: boolean;
}

export interface EmployeeSearchResponse {
  total: number;
  skip: number;
  limit: number;
  items: EmployeeSearchItem[];
}

export interface EmployeeFacets {
  departments: string[];
  designations: string[];
  roles: Role[];
  shifts: Shift[];
}

// ---------------------------------------------------------------------------
// Phase 4 — Employee Experience & System Integrations
// ---------------------------------------------------------------------------
export type OnboardingStatus = "PENDING" | "COMPLETED";
export type ResignationStatus = "PENDING" | "APPROVED" | "REJECTED";
export type TaskStatus = "PENDING" | "COMPLETED";

export interface OnboardingTask {
  id: number;
  employee_id: number;
  task_name: string;
  status: OnboardingStatus;
  due_date: string;
  employee_name: string | null;
}

export interface Resignation {
  id: number;
  employee_id: number;
  reason: string;
  notice_period: string;
  status: ResignationStatus;
  created_at: string;
  employee_name: string | null;
  department: string | null;
}

export interface Announcement {
  id: number;
  title: string;
  message: string;
  created_by_id: number;
  created_at: string;
  created_by: string | null;
}

export interface InternalTask {
  id: number;
  assigned_to_id: number;
  assigned_by_id: number | null;
  title: string;
  description: string;
  due_date: string;
  status: TaskStatus;
  created_at: string;
  assigned_to_name: string | null;
  assigned_by_name: string | null;
}

export interface Feedback {
  id: number;
  employee_id: number | null;
  message: string;
  rating: number;
  is_anonymous: boolean;
  created_at: string;
  employee_name: string | null;
}

export interface FeedbackSummary {
  total: number;
  average_rating: number;
  rating_distribution: Record<string, number>;
}

export interface ProfileInfo {
  user: { id: number; username: string; email: string; role: Role };
  employee: {
    id: number;
    full_name: string;
    designation: string;
    department: string;
    joining_date: string;
    status: EmployeeStatus;
  } | null;
}

export interface NotificationPreferences {
  user_id: number;
  email_notifications: boolean;
  sms_notifications: boolean;
  push_notifications: boolean;
}
