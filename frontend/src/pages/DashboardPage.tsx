import { useAuth } from "../context/AuthContext";
import { EmployeeDashboard } from "./EmployeeDashboard";
import { StaffDashboard } from "./StaffDashboard";

export function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === "EMPLOYEE" ? <EmployeeDashboard /> : <StaffDashboard />;
}
