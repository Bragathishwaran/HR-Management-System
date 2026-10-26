import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  FilterX,
  Mail,
  Plus,
  Search,
  Star,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useDebounce } from "../hooks/useDebounce";
import { useResource } from "../hooks/useResource";
import { endpoints } from "../lib/api";
import { formatDate } from "../lib/format";
import type {
  Employee,
  EmployeeSearchItem,
  EmployeeStatus,
  Role,
  ShiftName,
} from "../types";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Progress,
  SearchInput,
  Select,
  StatCard,
} from "../components/UI";
import { EmployeeFormModal } from "../components/EmployeeFormModal";

const PAGE_SIZE = 25;

const sortOptions = [
  { value: "name:asc", label: "Name A–Z" },
  { value: "name:desc", label: "Name Z–A" },
  { value: "rating:desc", label: "Rating: high to low" },
  { value: "rating:asc", label: "Rating: low to high" },
  { value: "attendance:desc", label: "Attendance: high to low" },
  { value: "attendance:asc", label: "Attendance: low to high" },
  { value: "late:desc", label: "Most late arrivals" },
  { value: "department:asc", label: "Department A–Z" },
];

function shiftLabel(value: ShiftName): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export function EmployeesPage() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const canManage = hasRole("HR", "ADMIN");

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [department, setDepartment] = useState("all");
  const [designation, setDesignation] = useState("all");
  const [role, setRole] = useState<"all" | Role>("all");
  const [shift, setShift] = useState<"all" | ShiftName>("all");
  const [status, setStatus] = useState<"all" | EmployeeStatus>("all");
  const [availability, setAvailability] = useState<"all" | "leave" | "available">("all");
  const [minRating, setMinRating] = useState("all");
  const [minAttendance, setMinAttendance] = useState("all");
  const [sort, setSort] = useState("name:asc");
  const [skip, setSkip] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);

  const basicResource = useResource(() => endpoints.employees({ limit: 100 }), []);
  const facetsResource = useResource(
    () => endpoints.employeeFacets(),
    [],
    { enabled: canManage },
  );

  const [sortBy, sortOrder] = sort.split(":") as [
    "name" | "rating" | "attendance" | "late" | "department",
    "asc" | "desc",
  ];

  const searchResource = useResource(
    () =>
      endpoints.searchEmployees({
        q: debouncedSearch.trim() || undefined,
        department: department === "all" ? undefined : department,
        designation: designation === "all" ? undefined : designation,
        role: role === "all" ? undefined : role,
        shift_name: shift === "all" ? undefined : shift,
        status: status === "all" ? undefined : status,
        min_rating: minRating === "all" ? undefined : Number(minRating),
        min_attendance_rate:
          minAttendance === "all" ? undefined : Number(minAttendance),
        on_leave_today:
          availability === "all" ? undefined : availability === "leave",
        sort_by: sortBy,
        sort_order: sortOrder,
        skip,
        limit: PAGE_SIZE,
      }),
    [
      debouncedSearch,
      department,
      designation,
      role,
      shift,
      status,
      availability,
      minRating,
      minAttendance,
      sortBy,
      sortOrder,
      skip,
      canManage,
    ],
    { enabled: canManage },
  );

  useEffect(() => {
    setSkip(0);
  }, [
    debouncedSearch,
    department,
    designation,
    role,
    shift,
    status,
    availability,
    minRating,
    minAttendance,
    sort,
  ]);

  useEffect(() => {
    if ((location.state as { create?: boolean } | null)?.create && canManage) {
      setEditing(null);
      setFormOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, canManage, navigate]);

  const directory = basicResource.data || [];
  const advanced = searchResource.data;
  const facets = facetsResource.data;

  const departments = useMemo(() => {
    if (facets?.departments.length) return facets.departments;
    return Array.from(new Set(directory.map((employee) => employee.department))).sort();
  }, [facets, directory]);

  const designations = facets?.designations || [];
  const shifts = facets?.shifts || [];

  const filteredDirectory = useMemo(() => {
    const term = search.trim().toLowerCase();
    return directory.filter((employee) => {
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
  }, [directory, search, department, status]);

  const rows: Array<Employee | EmployeeSearchItem> = canManage
    ? advanced?.items || []
    : filteredDirectory;
  const total = canManage ? advanced?.total || 0 : filteredDirectory.length;

  const activeCount = directory.filter(
    (employee) => employee.status === "ACTIVE",
  ).length;
  const departmentCount = new Set(
    (facets?.departments.length ? facets.departments : directory.map((employee) => employee.department)),
  ).size;
  const page = Math.floor(skip / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hasAdvancedFilters =
    department !== "all" ||
    designation !== "all" ||
    role !== "all" ||
    shift !== "all" ||
    status !== "all" ||
    availability !== "all" ||
    minRating !== "all" ||
    minAttendance !== "all" ||
    search.trim() !== "";

  const clearFilters = () => {
    setSearch("");
    setDepartment("all");
    setDesignation("all");
    setRole("all");
    setShift("all");
    setStatus("all");
    setAvailability("all");
    setMinRating("all");
    setMinAttendance("all");
    setSort("name:asc");
    setSkip(0);
  };

  const refreshAll = () => {
    basicResource.refresh();
    if (canManage) {
      searchResource.refresh();
      facetsResource.refresh();
    }
  };

  const initialLoading =
    (basicResource.loading && !basicResource.data) ||
    (canManage && searchResource.loading && !searchResource.data);
  const error =
    basicResource.error ||
    (canManage ? searchResource.error || facetsResource.error : null);

  if (initialLoading) {
    return <LoadingState label="Opening the people directory…" />;
  }
  if (error) {
    return <ErrorState message={error} onRetry={refreshAll} />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="People directory"
        title="Your team"
        description={
          canManage
            ? "Search across profiles, shifts, attendance and review history."
            : "A single view of everyone building WorkSphere."
        }
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

      <section className="stats-grid">
        <StatCard
          label="Total people"
          value={directory.length}
          meta={canManage ? "Directory snapshot" : "Across the organisation"}
          icon={Users}
          tone="green"
        />
        <StatCard
          label="Active"
          value={activeCount}
          meta={`${directory.length - activeCount} inactive`}
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
        {canManage && (
          <StatCard
            label="Matching people"
            value={total}
            meta={hasAdvancedFilters ? "With current filters" : "Full directory"}
            icon={Search}
            tone="amber"
          />
        )}
      </section>

      {canManage ? (
        <section className="card advanced-search">
          <div className="advanced-search-head">
            <div>
              <h2>Advanced employee search</h2>
              <p>
                Combine role, shift, attendance and rating filters. Metrics use the
                last 30 days of attendance.
              </p>
            </div>
            <Badge tone={hasAdvancedFilters ? "amber" : "slate"}>
              {total} match{total === 1 ? "" : "es"}
            </Badge>
          </div>

          <div className="advanced-search-row">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search name, role, email…"
              className="advanced-search-input"
            />
            <Select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              aria-label="Sort employees"
              className="toolbar-select"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            {hasAdvancedFilters && (
              <button type="button" className="text-button" onClick={clearFilters}>
                <FilterX size={14} /> Clear all
              </button>
            )}
          </div>

          <div className="advanced-filter-grid">
            <label>
              <span>Department</span>
              <Select
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                className="toolbar-select"
              >
                <option value="all">All departments</option>
                {departments.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              <span>Designation</span>
              <Select
                value={designation}
                onChange={(event) => setDesignation(event.target.value)}
                className="toolbar-select"
              >
                <option value="all">All designations</option>
                {designations.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              <span>Access role</span>
              <Select
                value={role}
                onChange={(event) => setRole(event.target.value as "all" | Role)}
                className="toolbar-select"
              >
                <option value="all">All roles</option>
                <option value="EMPLOYEE">Employee</option>
                <option value="HR">People Ops</option>
                <option value="ADMIN">Administrator</option>
              </Select>
            </label>
            <label>
              <span>Shift</span>
              <Select
                value={shift}
                onChange={(event) =>
                  setShift(event.target.value as "all" | ShiftName)
                }
                className="toolbar-select"
              >
                <option value="all">Any shift</option>
                {shifts.map((item) => (
                  <option key={item.id} value={item.name}>
                    {shiftLabel(item.name)}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              <span>Status</span>
              <Select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as "all" | EmployeeStatus)
                }
                className="toolbar-select"
              >
                <option value="all">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </Select>
            </label>
            <label>
              <span>Today</span>
              <Select
                value={availability}
                onChange={(event) =>
                  setAvailability(
                    event.target.value as "all" | "leave" | "available",
                  )
                }
                className="toolbar-select"
              >
                <option value="all">Any availability</option>
                <option value="available">Available today</option>
                <option value="leave">On leave today</option>
              </Select>
            </label>
            <label>
              <span>Minimum rating</span>
              <Select
                value={minRating}
                onChange={(event) => setMinRating(event.target.value)}
                className="toolbar-select"
              >
                <option value="all">Any rating</option>
                <option value="4.5">4.5 and up</option>
                <option value="4">4.0 and up</option>
                <option value="3.5">3.5 and up</option>
                <option value="3">3.0 and up</option>
                <option value="2">2.0 and up</option>
              </Select>
            </label>
            <label>
              <span>Minimum attendance</span>
              <Select
                value={minAttendance}
                onChange={(event) => setMinAttendance(event.target.value)}
                className="toolbar-select"
              >
                <option value="all">Any attendance</option>
                <option value="95">95% and up</option>
                <option value="90">90% and up</option>
                <option value="80">80% and up</option>
                <option value="70">70% and up</option>
                <option value="50">50% and up</option>
              </Select>
            </label>
          </div>
        </section>
      ) : (
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
                onChange={(event) =>
                  setStatus(event.target.value as "all" | EmployeeStatus)
                }
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
              {filteredDirectory.length} of {directory.length}
            </span>
          </div>
        </section>
      )}

      <section className="card table-card">
        {canManage && (
          <div className="table-toolbar table-toolbar-wrap">
            <div className="toolbar-left">
              <span className="table-count">
                Showing {total === 0 ? 0 : skip + 1}–
                {Math.min(skip + rows.length, total)} of {total}
              </span>
            </div>
            <div className="pagination">
              <button
                type="button"
                className="table-action"
                aria-label="Previous page"
                onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
                disabled={skip === 0}
              >
                <ChevronLeft size={16} />
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="table-action"
                aria-label="Next page"
                onClick={() => setSkip(skip + PAGE_SIZE)}
                disabled={skip + PAGE_SIZE >= total}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <EmptyState
            icon={UserX}
            title={
              directory.length === 0
                ? "No employees yet"
                : hasAdvancedFilters
                  ? "No matching people"
                  : "No matching people"
            }
            description={
              directory.length === 0
                ? canManage
                  ? "Add your first employee to get the workspace moving."
                  : "People Ops has not added anyone yet."
                : "Try a different search or clear the filters."
            }
            action={
              directory.length === 0 && canManage ? (
                <Button size="sm" onClick={() => setFormOpen(true)}>
                  Add employee
                </Button>
              ) : hasAdvancedFilters ? (
                <Button size="sm" variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table people-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  {canManage ? (
                    <>
                      <th>Role</th>
                      <th>Department</th>
                      <th>Shift</th>
                      <th>Attendance</th>
                      <th>Punctuality</th>
                      <th>Rating</th>
                      <th>Today</th>
                      <th>Status</th>
                    </>
                  ) : (
                    <>
                      <th>Designation</th>
                      <th>Department</th>
                      <th>Joined</th>
                      <th>Status</th>
                    </>
                  )}
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((employee) => {
                  const canOpen =
                    canManage || employee.username === user?.username;
                  const advancedItem = canManage
                    ? (employee as EmployeeSearchItem)
                    : null;
                  return (
                    <tr key={employee.id} className={canOpen ? "row-clickable" : ""}>
                      <td>
                        <div className="person-cell">
                          <Avatar name={employee.full_name} size="sm" />
                          <div>
                            {canOpen ? (
                              <Link
                                to={`/employees/${employee.id}`}
                                className="person-name"
                              >
                                {employee.full_name}
                              </Link>
                            ) : (
                              <span className="person-name">{employee.full_name}</span>
                            )}
                            <span className="person-sub">
                              {employee.email ||
                                employee.username ||
                                "No account linked"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {canManage && advancedItem ? (
                        <>
                          <td>
                            {advancedItem.role ? (
                              <Badge status={advancedItem.role} />
                            ) : (
                              <span className="muted">No login</span>
                            )}
                          </td>
                          <td>
                            <span className="department-chip">
                              {employee.department}
                            </span>
                          </td>
                          <td>
                            {advancedItem.shift_name ? (
                              <span
                                className={`shift-chip shift-${advancedItem.shift_name.toLowerCase()}`}
                              >
                                {shiftLabel(advancedItem.shift_name)}
                              </span>
                            ) : (
                              <span className="muted">Company hours</span>
                            )}
                          </td>
                          <td>
                            <div className="share-cell">
                              <Progress
                                value={advancedItem.attendance_rate}
                                max={100}
                                tone={
                                  advancedItem.attendance_rate >= 85
                                    ? "green"
                                    : advancedItem.attendance_rate >= 70
                                      ? "amber"
                                      : "rose"
                                }
                              />
                              <span>{advancedItem.attendance_rate.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td>
                            {advancedItem.late_count > 0 ? (
                              <span className="late-mark">
                                {advancedItem.late_count} late
                              </span>
                            ) : (
                              <span className="muted">On time</span>
                            )}
                          </td>
                          <td>
                            {advancedItem.review_count > 0 ? (
                              <span className="rating-inline">
                                <Star size={13} fill="currentColor" />
                                {advancedItem.average_rating.toFixed(1)}
                                <small>({advancedItem.review_count})</small>
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td>
                            {advancedItem.on_leave_today ? (
                              <Badge tone="blue">On leave</Badge>
                            ) : advancedItem.today_attendance ? (
                              <Badge
                                status={advancedItem.today_attendance}
                                dot
                              />
                            ) : (
                              <Badge tone="slate">Not in yet</Badge>
                            )}
                          </td>
                          <td>
                            <Badge status={employee.status} dot />
                          </td>
                        </>
                      ) : (
                        <>
                          <td>
                            <span className="cell-strong">{employee.designation}</span>
                          </td>
                          <td>
                            <span className="department-chip">
                              {employee.department}
                            </span>
                          </td>
                          <td>{formatDate(employee.joining_date)}</td>
                          <td>
                            <Badge status={employee.status} dot />
                          </td>
                        </>
                      )}

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
                          <span
                            className="table-action-muted"
                            title="Profile visible to the employee and People Ops"
                          >
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
            Need to change a role or deactivate a login? Administrators can manage
            access from <Link to="/users">User access</Link>. Salary is visible to
            HR and Admins only.
          </span>
        </section>
      )}

      <EmployeeFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        employee={editing}
        departments={departments}
        onSaved={() => refreshAll()}
      />
    </div>
  );
}
