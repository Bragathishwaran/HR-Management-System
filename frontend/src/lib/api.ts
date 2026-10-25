import type {
  AdminAnalytics,
  AttendanceRecord,
  AutoMarkAbsentResponse,
  CheckInOutResponse,
  DashboardStats,
  DashboardTrends,
  Employee,
  Leave,
  LeaveBalance,
  LeavePolicy,
  LeaveStatus,
  NotificationList,
  Payroll,
  PayrollDetail,
  PayrollSummary,
  SelfServiceDashboard,
  TokenResponse,
  User,
  User as UserType,
} from "../types";

// The Vite dev server proxies `/api` to FastAPI. A production build does not
// have that proxy, so use the local backend unless an explicit API URL is set.
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
export const API_BASE = (
  configuredApiUrl || (import.meta.env.DEV ? "/api" : "http://localhost:8000")
).replace(/\/$/, "");
const STORAGE_KEY = "worksphere.auth";

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export function getStoredToken(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string; expiresAt?: number };
    if (!parsed.token) return null;
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

export function getStoredSession(): { token: string; user: User } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      token?: string;
      user?: User;
      expiresAt?: number;
    };
    if (!parsed.token || !parsed.user) return null;
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return { token: parsed.token, user: parsed.user };
  } catch {
    return null;
  }
}

export function storeSession(token: string, user: User, expiresIn: number): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      token,
      user,
      expiresAt: Date.now() + Math.max(0, expiresIn - 30) * 1000,
    }),
  );
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

function formatErrorDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          const entry = item as { msg: string; loc?: unknown[] };
          const field = entry.loc
            ?.filter((part) => part !== "body" && part !== "query")
            .join(".");
          return field ? `${field}: ${entry.msg}` : entry.msg;
        }
        return String(item);
      })
      .join(" · ");
  }
  if (detail && typeof detail === "object" && "detail" in detail) {
    return formatErrorDetail((detail as { detail: unknown }).detail);
  }
  return "Something went wrong. Please try again.";
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  form?: Record<string, string>;
  params?: Record<string, string | number | boolean | null | undefined>;
  auth?: boolean;
  signal?: AbortSignal;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = "GET",
    body,
    form,
    params,
    auth = true,
    signal,
  } = options;

  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        query.set(key, String(value));
      }
    });
  }
  const url = `${API_BASE}${path}${query.size ? `?${query.toString()}` : ""}`;

  const headers: Record<string, string> = { Accept: "application/json" };
  let payload: BodyInit | undefined;

  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  if (auth) {
    const token = getStoredToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: payload,
      signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(
      "Cannot reach the WorkSphere API. Make sure the backend is running.",
      0,
    );
  }

  if (response.status === 401 && auth && getStoredToken()) {
    window.dispatchEvent(new Event("worksphere:unauthorized"));
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text();

  if (!response.ok) {
    const message = formatErrorDetail(
      data && typeof data === "object" && "detail" in data
        ? (data as { detail: unknown }).detail
        : "Request failed",
    );
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

export function loginRequest(username: string, password: string): Promise<TokenResponse> {
  return api<TokenResponse>("/auth/token", {
    method: "POST",
    form: { username, password },
    auth: false,
  });
}

export function registerRequest(payload: {
  username: string;
  email: string;
  password: string;
}): Promise<UserType> {
  return api<UserType>("/auth/register", {
    method: "POST",
    body: { ...payload, role: "EMPLOYEE" },
    auth: false,
  });
}

// ---------------------------------------------------------------------------
// Typed endpoint helpers
// ---------------------------------------------------------------------------
export const endpoints = {
  me: () => api<User>("/auth/me"),

  // Employees
  employees: (params?: RequestOptions["params"]) =>
    api<Employee[]>("/employees/", { params }),
  employee: (id: number) => api<Employee>(`/employees/${id}`),
  createEmployee: (payload: Record<string, unknown>) =>
    api<Employee>("/employees/", { method: "POST", body: payload }),
  updateEmployee: (id: number, payload: Record<string, unknown>) =>
    api<Employee>(`/employees/${id}`, { method: "PUT", body: payload }),
  deleteEmployee: (id: number) =>
    api<void>(`/employees/${id}`, { method: "DELETE" }),

  // Attendance
  checkIn: () =>
    api<CheckInOutResponse>("/attendance/check-in", { method: "POST" }),
  checkOut: () =>
    api<CheckInOutResponse>("/attendance/check-out", { method: "POST" }),
  todayAttendance: () => api<AttendanceRecord | null>("/attendance/today"),
  attendanceHistory: (params?: RequestOptions["params"]) =>
    api<AttendanceRecord[]>("/attendance/history", { params }),
  autoMarkAbsent: (date: string) =>
    api<AutoMarkAbsentResponse>("/attendance/auto-mark-absent", {
      method: "POST",
      params: { date },
    }),

  // Leaves
  applyLeave: (payload: {
    leave_type: string;
    start_date: string;
    end_date: string;
    reason: string;
  }) => api<Leave>("/leaves/apply", { method: "POST", body: payload }),
  leaves: (params?: RequestOptions["params"]) =>
    api<Leave[]>("/leaves/", { params }),
  leaveBalances: (params?: RequestOptions["params"]) =>
    api<LeaveBalance[]>("/leaves/balances", { params }),
  updateLeaveStatus: (id: number, status: Exclude<LeaveStatus, "PENDING">) =>
    api<Leave>(`/leaves/${id}/status`, {
      method: "PATCH",
      body: { status },
    }),

  // Policies
  leavePolicies: () => api<LeavePolicy[]>("/leave-policies/"),
  updateLeavePolicy: (type: string, totalDays: number) =>
    api<LeavePolicy>(`/leave-policies/${type}`, {
      method: "PUT",
      body: { total_days_allowed: totalDays },
    }),

  // Payroll
  payroll: (params?: RequestOptions["params"]) =>
    api<Payroll[]>("/payroll/", { params }),
  payrollSummary: (month?: string) =>
    api<PayrollSummary>("/payroll/summary", { params: { month } }),
  payrollDetail: (id: number) => api<PayrollDetail>(`/payroll/${id}`),
  generatePayroll: (payload: Record<string, unknown>) =>
    api<Payroll>("/payroll/generate", { method: "POST", body: payload }),

  // Dashboard
  dashboardStats: () => api<DashboardStats>("/dashboard/stats"),
  dashboardTrends: () => api<DashboardTrends>("/dashboard/trends"),
  adminAnalytics: () => api<AdminAnalytics>("/dashboard/analytics"),

  // Self service
  myProfile: () => api<Employee>("/me/profile"),
  myDashboard: () => api<SelfServiceDashboard>("/me/dashboard"),
  myAttendance: (params?: RequestOptions["params"]) =>
    api<AttendanceRecord[]>("/me/attendance", { params }),
  myLeaves: (params?: RequestOptions["params"]) =>
    api<Leave[]>("/me/leaves", { params }),
  myPayroll: (params?: RequestOptions["params"]) =>
    api<Payroll[]>("/me/payroll", { params }),
  myBalances: () => api<LeaveBalance[]>("/me/balances"),

  // Notifications
  notifications: (params?: RequestOptions["params"]) =>
    api<NotificationList>("/notifications/", { params }),
  markNotificationRead: (id: number) =>
    api<NotificationList["items"][number]>(`/notifications/${id}/read`, {
      method: "PATCH",
    }),
  markAllNotificationsRead: () =>
    api<{ updated: number }>("/notifications/read-all", { method: "PATCH" }),

  // Admin users
  users: (params?: RequestOptions["params"]) =>
    api<User[]>("/users/", { params }),
  createUser: (payload: Record<string, unknown>) =>
    api<User>("/users/", { method: "POST", body: payload }),
  updateUser: (id: number, payload: Record<string, unknown>) =>
    api<User>(`/users/${id}`, { method: "PATCH", body: payload }),
  deleteUser: (id: number) => api<void>(`/users/${id}`, { method: "DELETE" }),
};
