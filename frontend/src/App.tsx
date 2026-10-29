import { Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { AnnouncementsPage } from "./pages/AnnouncementsPage";
import { AttendancePage } from "./pages/AttendancePage";
import { DashboardPage } from "./pages/DashboardPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { EmployeeDetailPage } from "./pages/EmployeeDetailPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { FeedbackPage } from "./pages/FeedbackPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { InternalTasksPage } from "./pages/InternalTasksPage";
import { LeaveCalendarPage } from "./pages/LeaveCalendarPage";
import { LeavePoliciesPage } from "./pages/LeavePoliciesPage";
import { LeavesPage } from "./pages/LeavesPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { PayrollPage } from "./pages/PayrollPage";
import { PerformancePage } from "./pages/PerformancePage";
import { ProfilePage } from "./pages/ProfilePage";
import { ProfileSettingsPage } from "./pages/ProfileSettingsPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ResignationsPage } from "./pages/ResignationsPage";
import { ShiftsPage } from "./pages/ShiftsPage";
import { UsersPage } from "./pages/UsersPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="/employees" element={<EmployeesPage />} />
        <Route path="/employees/:id" element={<EmployeeDetailPage />} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/shifts" element={<ShiftsPage />} />
        <Route path="/leaves" element={<LeavesPage />} />
        <Route path="/leave-calendar" element={<LeaveCalendarPage />} />
        <Route path="/payroll" element={<PayrollPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/performance" element={<PerformancePage />} />
        <Route
          path="/leave-policies"
          element={
            <ProtectedRoute roles={["HR", "ADMIN"]}>
              <LeavePoliciesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute roles={["HR", "ADMIN"]}>
              <AnalyticsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile-settings" element={<ProfileSettingsPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/resignations" element={<ResignationsPage />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
        <Route path="/tasks" element={<InternalTasksPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route
          path="/integrations"
          element={
            <ProtectedRoute roles={["HR", "ADMIN"]}>
              <IntegrationsPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
