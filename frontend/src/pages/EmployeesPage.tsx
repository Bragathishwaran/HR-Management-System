import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  ChevronRight,
  FilterX,
  Mail,
  Plus,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useResource } from "../hooks/useResource";
import { endpoints } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/format";
import type { Employee, EmployeeStatus } from "../types";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SearchInput,
  Select,
  StatCard,
} from "../components/UI";
import { EmployeeFormModal } from "../components/EmployeeFormModal";

export function EmployeesPage() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const canManage = hasRole("HR", "ADMIN");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState<"all" | EmployeeStatus>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);

  const resource = useResource(
    () => endpoints.employees({ limit: 100 }),
    [],
  );

  useEffect(() => {
    if ((location.state as { create?: boolean } | null)?.create && canManage) {
      setEditing(null);
      setFormOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, canManage, navigate]);

  const employees = resource.data || [];
  const departments = useMemo(
    () => Array.from(new Set(employees.map((employee) => employee.department))).sort(),
    [employees],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return employees.filter((employee) => {
      const matchesSearch =
        !term ||
        employee.full_name.toLowerCase().includes(term) ||
        employee.designation.toLowerCase().includes(term) ||
        employee.department.toLowerCase().includes(term) ||
        (employee.email || "").toLowerCase().includes(term);
      const matchesDepartment =
        department === "all" || employee.department === department;
      const matchesStatus = status === "all" || employee.status === status;
      return matchesSearch && matchesDepartment && matchesStatus;
    });
  }, [employees, search, department, status]);

  const activeCount = employees.filter((employee) => employee.status === "ACTIVE").length;
  const departmentCount = new Set(employees.map((employee) => employee.department)).size;

  const clearFilters = () => {
    setSearch("");
    setDepartment("all");
    setStatus("all");
  };

  if (resource.loading && !resource.data) {
    return <LoadingState label="Opening the people directory…" />;
  }
  if (resource.error) {
    return <ErrorState message={resource.error} onRetry={resource.refresh} />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="People directory"
        title="Your team"
        description="A single view of everyone building WorkSphere."
        actions={
          canManage ? (
            <Button
              icon={<Plus size={16} />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Add employee
            </Button>
          ) : undefined
        }
      />

      <section className="stats-grid stats-grid-3">
        <StatCard label="Total people" value={employees.length} icon={Users} tone="green" />
        <StatCard
          label="Active"
          value={activeCount}
          meta={`${employees.length - activeCount} inactive`}
          icon={UserCheck}
          tone="teal"
        />
        <StatCard
          label="Departments"
          value={departmentCount}
          meta="Across the organisation"
          icon={Building2}
          tone="purple"
        />
      </section>

      <section className="card table-card">
        <div className="table-toolbar">
          <div className="toolbar-left">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search name, role, email…"
            />
            <Select
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              aria-label="Filter by department"
              className="toolbar-select"
            >
              <option value="all">All departments</option>
              {departments.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value as "all" | EmployeeStatus)}
              aria-label="Filter by status"
              className="toolbar-select"
            >
              <option value="all">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
            {(search || department !== "all" || status !== "all") && (
              <button type="button" className="text-button" onClick={clearFilters}>
                <FilterX size={14} /> Clear
              </button>
            )}
          </div>
          <span className="table-count">
            {filtered.length} of {employees.length}
          </span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={UserX}
            title={employees.length === 0 ? "No employees yet" : "No matching people"}
            description={
              employees.length === 0
                ? canManage
                  ? "Add your first employee to get the workspace moving."
                  : "People Ops has not added anyone yet."
                : "Try a different search or clear the filters."
            }
            action={
              employees.length === 0 && canManage ? (
                <Button size="sm" onClick={() => setFormOpen(true)}>
                  Add employee
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table people-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Joined</th>
                  {canManage && <th>Salary</th>}
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((employee) => {
                  const canOpen = canManage || employee.username === user?.username;
                  return (
                    <tr key={employee.id} className={canOpen ? "row-clickable" : ""}>
                      <td>
                        <div className="person-cell">
                          <Avatar name={employee.full_name} size="sm" />
                          <div>
                            {canOpen ? (
                              <Link to={`/employees/${employee.id}`} className="person-name">
                                {employee.full_name}
                              </Link>
                            ) : (
                              <span className="person-name">{employee.full_name}</span>
                            )}
                            <span className="person-sub">
                              {employee.email || employee.username || "No account linked"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="cell-strong">{employee.designation}</span>
                      </td>
                      <td>
                        <span className="department-chip">{employee.department}</span>
                      </td>
                      <td>{formatDate(employee.joining_date)}</td>
                      {canManage && (
                        <td>
                          <span className="cell-strong">
                            {formatCurrency(employee.salary)}
                          </span>
                        </td>
                      )}
                      <td>
                        <Badge status={employee.status} dot />
                      </td>
                      <td className="cell-actions">
                        {canOpen ? (
                          <Link
                            to={`/employees/${employee.id}`}
                            className="table-action"
                            aria-label={`View ${employee.full_name}`}
                          >
                            <ChevronRight size={17} />
                          </Link>
                        ) : (
                          <span className="table-action-muted" title="Profile visible to the employee and People Ops">
                            <Mail size={15} />
                          </span>
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

      {canManage && (
        <section className="directory-footnote">
          <ArrowRight size={16} />
          <span>
            Need to change a role or deactivate a login? Administrators can manage access
            from <Link to="/users">User access</Link>.
          </span>
        </section>
      )}

      <EmployeeFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        employee={editing}
        departments={departments}
        onSaved={() => resource.refresh()}
      />
    </div>
  );
}
