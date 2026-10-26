import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Palmtree,
  RefreshCw,
  Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useResource } from "../hooks/useResource";
import { endpoints } from "../lib/api";
import {
  formatDate,
  formatDateLong,
  leaveAccent,
  todayISO,
} from "../lib/format";
import type { LeaveCalendarEntry } from "../types";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Select,
  StatCard,
} from "../components/UI";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthInput(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(value: string, delta: number): string {
  const [year, month] = value.split("-").map(Number);
  const next = new Date(year, month - 1 + delta, 1);
  return monthInput(next);
}

function monthLabel(value: string): string {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isWithin(entry: LeaveCalendarEntry, day: string): boolean {
  return entry.start_date <= day && entry.end_date >= day;
}

export function LeaveCalendarPage() {
  const { hasRole } = useAuth();
  const canSeeAll = hasRole("HR", "ADMIN");
  const [month, setMonth] = useState(monthInput());
  const [department, setDepartment] = useState("all");
  const [selectedDay, setSelectedDay] = useState(todayISO());

  const resource = useResource(async () => {
    const [calendar, team] = await Promise.all([
      endpoints.leaveCalendar({
        month,
        department: department === "all" ? undefined : department,
      }),
      endpoints.teamAvailability({
        date: selectedDay,
        department: department === "all" ? undefined : department,
      }),
    ]);
    return { calendar, team };
  }, [month, department, selectedDay]);

  const calendar = resource.data?.calendar || [];
  const team = resource.data?.team;

  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const firstWeekday = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;

  const departments = useMemo(
    () => Array.from(new Set(calendar.map((entry) => entry.department))).sort(),
    [calendar],
  );

  const stats = useMemo(() => {
    const approved = calendar.filter((entry) => entry.status === "APPROVED");
    const pending = calendar.filter((entry) => entry.status === "PENDING");
    const totalDays = calendar.reduce((sum, entry) => sum + entry.days, 0);
    let peak = 0;
    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = dateKey(year, monthNumber, day);
      const concurrent = approved.filter((entry) => isWithin(entry, key)).length;
      peak = Math.max(peak, concurrent);
    }
    return { approved: approved.length, pending: pending.length, totalDays, peak };
  }, [calendar, daysInMonth, year, monthNumber]);

  const leavesForDay = (day: string) =>
    calendar.filter((entry) => isWithin(entry, day));

  const goToToday = () => {
    const today = new Date();
    setMonth(monthInput(today));
    setSelectedDay(todayISO());
  };

  if (resource.loading && !resource.data) {
    return <LoadingState label="Opening the leave calendar…" />;
  }
  if (resource.error) {
    return <ErrorState message={resource.error} onRetry={resource.refresh} />;
  }

  const selectedEntries = leavesForDay(selectedDay);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Team planning"
        title="Leave calendar"
        description="See who is away, who is available and where coverage overlaps."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={resource.refresh} loading={resource.loading}>
              Refresh
            </Button>
            <Button variant="secondary" icon={<CalendarDays size={16} />} onClick={goToToday}>
              Today
            </Button>
          </>
        }
      />

      <section className="stats-grid">
        <StatCard
          label="Approved leave"
          value={stats.approved}
          meta={monthLabel(month)}
          icon={CalendarCheck2}
          tone="green"
        />
        <StatCard
          label="Awaiting approval"
          value={stats.pending}
          meta="Requests this month"
          icon={CalendarClock}
          tone="amber"
        />
        <StatCard
          label="Days reserved"
          value={stats.totalDays}
          meta="Across visible requests"
          icon={Palmtree}
          tone="teal"
        />
        <StatCard
          label="Peak overlap"
          value={stats.peak}
          meta={stats.peak > 1 ? "People away on the busiest day" : "No overlapping leave"}
          icon={Users}
          tone="purple"
        />
      </section>

      <section className="calendar-layout">
        <section className="card calendar-card">
          <div className="calendar-toolbar">
            <div className="calendar-nav">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setMonth(shiftMonth(month, -1))}
              >
                <ChevronLeft size={18} />
              </button>
              <strong>{monthLabel(month)}</strong>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setMonth(shiftMonth(month, 1))}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="toolbar-left">
              {canSeeAll && (
                <Select
                  value={department}
                  onChange={(event) => setDepartment(event.target.value)}
                  aria-label="Filter calendar by department"
                  className="toolbar-select"
                >
                  <option value="all">All departments</option>
                  {departments.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              )}
              <span className="table-count">{calendar.length} requests</span>
            </div>
          </div>

          <div className="calendar-grid">
            {WEEKDAYS.map((day) => (
              <div key={day} className="calendar-weekday">
                {day}
              </div>
            ))}
            {Array.from({ length: firstWeekday }).map((_, index) => (
              <div key={`blank-${index}`} className="calendar-cell is-blank" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, index) => {
              const dayNumber = index + 1;
              const key = dateKey(year, monthNumber, dayNumber);
              const dayLeaves = leavesForDay(key);
              const approved = dayLeaves.filter((entry) => entry.status === "APPROVED");
              const isToday = key === todayISO();
              const isSelected = key === selectedDay;
              return (
                <button
                  key={key}
                  type="button"
                  className={`calendar-cell ${isToday ? "is-today" : ""} ${
                    isSelected ? "is-selected" : ""
                  }`}
                  onClick={() => setSelectedDay(key)}
                  aria-label={`${formatDateLong(key)}, ${dayLeaves.length} leave requests`}
                >
                  <span className="calendar-day">{dayNumber}</span>
                  <span className="calendar-events">
                    {dayLeaves.slice(0, 3).map((entry) => (
                      <span
                        key={entry.id}
                        className={`calendar-event leave-${leaveAccent(entry.leave_type)} ${
                          entry.status === "PENDING" ? "is-pending" : ""
                        } ${entry.is_own ? "is-own" : ""}`}
                        title={`${entry.employee_name} · ${entry.leave_type} · ${entry.status}`}
                      >
                        {entry.employee_name.split(" ")[0]}
                      </span>
                    ))}
                    {dayLeaves.length > 3 && (
                      <span className="calendar-more">+{dayLeaves.length - 3}</span>
                    )}
                  </span>
                  {approved.length > 0 && (
                    <span className="calendar-dot" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="calendar-legend">
            <span>
              <i className="legend-swatch leave-sick" /> Sick
            </span>
            <span>
              <i className="legend-swatch leave-casual" /> Casual
            </span>
            <span>
              <i className="legend-swatch leave-paid" /> Paid
            </span>
            <span>
              <i className="legend-swatch legend-pending" /> Pending
            </span>
            <span>
              <i className="legend-swatch legend-own" /> You
            </span>
          </div>
        </section>

        <aside className="calendar-side">
          <section className="card">
            <div className="card-heading">
              <div>
                <h2>{formatDate(selectedDay)}</h2>
                <p>{formatDateLong(selectedDay)}</p>
              </div>
              <Badge tone={selectedEntries.length ? "amber" : "green"}>
                {selectedEntries.length} away
              </Badge>
            </div>
            {selectedEntries.length === 0 ? (
              <EmptyState
                compact
                icon={CalendarCheck2}
                title="Full coverage"
                description="Nobody is on approved or pending leave on this day."
              />
            ) : (
              <div className="calendar-leave-list">
                {selectedEntries.map((entry) => (
                  <div key={entry.id} className="calendar-leave-item">
                    <Avatar name={entry.employee_name} size="sm" />
                    <div>
                      <strong>
                        {entry.employee_name}
                        {entry.is_own && <Badge tone="blue">You</Badge>}
                      </strong>
                      <span>
                        {entry.department} · {formatDate(entry.start_date, false)} –{" "}
                        {formatDate(entry.end_date, false)}
                      </span>
                    </div>
                    <div className="calendar-leave-tags">
                      <Badge status={entry.leave_type} />
                      <Badge status={entry.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-heading">
              <div>
                <h2>Team availability</h2>
                <p>
                  {team?.department || "All departments"} ·{" "}
                  {team ? `${team.available.length}/${team.total_employees}` : "—"} available
                </p>
              </div>
              <span className="icon-tile icon-tile-teal">
                <Users size={18} />
              </span>
            </div>
            {!team || team.available.length === 0 ? (
              <EmptyState
                compact
                icon={Users}
                title="No one available"
                description="Everyone in scope is on leave for this date."
              />
            ) : (
              <div className="availability-list">
                {team.available.map((member) => (
                  <div key={member.employee_id} className="availability-item">
                    <Avatar name={member.full_name} size="xs" />
                    <div>
                      <strong>{member.full_name}</strong>
                      <span>{member.designation}</span>
                    </div>
                    {member.today_attendance ? (
                      <Badge status={member.today_attendance} dot />
                    ) : (
                      <Badge tone="slate">Not in yet</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <button
            type="button"
            className="calendar-back"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            <ArrowLeft size={14} /> {monthLabel(shiftMonth(month, -1))}
          </button>
          <button
            type="button"
            className="calendar-back"
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            {monthLabel(shiftMonth(month, 1))} <ArrowRight size={14} />
          </button>
        </aside>
      </section>
    </div>
  );
}
