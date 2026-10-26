import { useMemo, useState } from "react";
import {
  Award,
  BarChart3,
  Building2,
  CalendarRange,
  MessageSquareQuote,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useResource } from "../hooks/useResource";
import { endpoints } from "../lib/api";
import { formatDate } from "../lib/format";
import type {
  Employee,
  EmployeePerformanceSummary,
  PerformanceReview,
  TeamPerformanceInsights,
} from "../types";
import {
  Avatar,
  Badge,
  Button,
  ConfirmModal,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Progress,
  Select,
  StatCard,
  Textarea,
} from "../components/UI";

function currentPeriod(): string {
  const now = new Date();
  return `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
}

function ratingLabel(rating: number): string {
  if (rating >= 4.5) return "Exceptional";
  if (rating >= 3.5) return "Strong";
  if (rating >= 2.5) return "On track";
  if (rating >= 1.5) return "Needs support";
  return "Improvement plan";
}

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="rating-stars" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          size={size}
          className={index < Math.round(rating) ? "is-filled" : "is-empty"}
          fill={index < Math.round(rating) ? "currentColor" : "none"}
        />
      ))}
    </span>
  );
}

export function PerformancePage() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const canManage = hasRole("HR", "ADMIN");

  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PerformanceReview | null>(null);
  const [deleting, setDeleting] = useState<PerformanceReview | null>(null);
  const [formEmployee, setFormEmployee] = useState("");
  const [formPeriod, setFormPeriod] = useState(currentPeriod());
  const [formRating, setFormRating] = useState(4);
  const [formFeedback, setFormFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const resource = useResource(async () => {
    const reviews = await endpoints.performanceReviews({
      employee_id:
        canManage && employeeFilter !== "all"
          ? Number(employeeFilter)
          : undefined,
      review_period: periodFilter.trim() || undefined,
      min_rating:
        canManage && ratingFilter !== "all"
          ? Number(ratingFilter)
          : undefined,
      limit: 200,
    });

    let employees: Employee[] = [];
    let summary: TeamPerformanceInsights | null = null;
    let ownSummary: EmployeePerformanceSummary | null = null;

    if (canManage) {
      [employees, summary] = await Promise.all([
        endpoints.employees({ limit: 100 }),
        endpoints.teamPerformance(),
      ]);
    } else {
      const profile = await endpoints.myProfile();
      ownSummary = await endpoints.performanceSummary(profile.id);
    }

    return { reviews, employees, summary, ownSummary };
  }, [canManage, employeeFilter, periodFilter, ratingFilter]);

  const reviews = resource.data?.reviews || [];
  const employees = resource.data?.employees || [];
  const summary = resource.data?.summary;
  const ownSummary = resource.data?.ownSummary;

  const distribution = useMemo(() => {
    const source = canManage
      ? summary?.rating_distribution
      : ownSummary?.rating_distribution;
    return Array.from({ length: 5 }, (_, index) => {
      const rating = 5 - index;
      return { rating, count: source?.[String(rating)] || 0 };
    });
  }, [canManage, summary, ownSummary]);

  const distributionTotal = distribution.reduce(
    (sum, item) => sum + item.count,
    0,
  );

  const topDepartment = summary?.departments[0];
  const averageRating = canManage
    ? summary?.average_rating || 0
    : ownSummary?.average_rating || 0;
  const totalReviews = canManage
    ? summary?.total_reviews || 0
    : ownSummary?.reviews || 0;

  const openCreate = () => {
    setEditing(null);
    setFormEmployee(employeeFilter === "all" ? "" : employeeFilter);
    setFormPeriod(periodFilter.trim() || currentPeriod());
    setFormRating(4);
    setFormFeedback("");
    setFormOpen(true);
  };

  const openEdit = (review: PerformanceReview) => {
    setEditing(review);
    setFormEmployee(String(review.employee_id));
    setFormPeriod(review.review_period);
    setFormRating(review.rating);
    setFormFeedback(review.feedback);
    setFormOpen(true);
  };

  const submitReview = async () => {
    if (!editing && !formEmployee) {
      toast.error("Choose an employee", "Select who this review belongs to.");
      return;
    }
    if (formPeriod.trim().length < 2) {
      toast.error("Add a review period", "For example “Q3 2026” or “2026 Annual”.");
      return;
    }
    if (formFeedback.trim().length < 3) {
      toast.error("Add feedback", "Write a short summary of the review.");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await endpoints.updatePerformanceReview(editing.id, {
          review_period: formPeriod.trim(),
          rating: formRating,
          feedback: formFeedback.trim(),
        });
        toast.success("Review updated", "The employee can see the latest feedback.");
      } else {
        await endpoints.createPerformanceReview({
          employee_id: Number(formEmployee),
          review_period: formPeriod.trim(),
          rating: formRating,
          feedback: formFeedback.trim(),
        });
        toast.success("Review published", "The employee was notified about the new review.");
      }
      setFormOpen(false);
      resource.refresh();
      window.dispatchEvent(new Event("worksphere:notifications"));
    } catch (error) {
      toast.error("Could not save review", (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const removeReview = async () => {
    if (!deleting) return;
    setRemoving(true);
    try {
      await endpoints.deletePerformanceReview(deleting.id);
      toast.success("Review deleted", "The performance record was removed.");
      setDeleting(null);
      resource.refresh();
    } catch (error) {
      toast.error("Could not delete review", (error as Error).message);
    } finally {
      setRemoving(false);
    }
  };

  const clearFilters = () => {
    setEmployeeFilter("all");
    setPeriodFilter("");
    setRatingFilter("all");
  };

  const hasFilters =
    employeeFilter !== "all" || periodFilter.trim() !== "" || ratingFilter !== "all";

  if (resource.loading && !resource.data) {
    return <LoadingState label="Gathering performance reviews…" />;
  }
  if (resource.error) {
    return <ErrorState message={resource.error} onRetry={resource.refresh} />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Growth & feedback"
        title="Performance"
        description={
          canManage
            ? "Publish structured reviews and track how teams are developing."
            : "Your review history, ratings and feedback from People Ops."
        }
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RefreshCw size={16} />}
              onClick={resource.refresh}
              loading={resource.loading}
            >
              Refresh
            </Button>
            {canManage && (
              <Button icon={<Plus size={16} />} onClick={openCreate}>
                New review
              </Button>
            )}
          </>
        }
      />

      <section className="stats-grid">
        <StatCard
          label={canManage ? "Average rating" : "Your average"}
          value={averageRating ? averageRating.toFixed(1) : "—"}
          meta={averageRating ? ratingLabel(averageRating) : "No reviews yet"}
          icon={Star}
          tone="amber"
        />
        <StatCard
          label="Reviews recorded"
          value={totalReviews}
          meta={canManage ? "Across the organisation" : "Personal review history"}
          icon={MessageSquareQuote}
          tone="green"
        />
        <StatCard
          label={canManage ? "Top team" : "Latest rating"}
          value={
            canManage
              ? topDepartment?.department || "—"
              : ownSummary?.latest_rating
                ? `${ownSummary.latest_rating}/5`
                : "—"
          }
          meta={
            canManage
              ? topDepartment
                ? `${topDepartment.average_rating.toFixed(1)} average`
                : "No ratings recorded"
              : ownSummary?.latest_rating
                ? ratingLabel(ownSummary.latest_rating)
                : "Waiting for your first review"
          }
          icon={canManage ? Building2 : TrendingUp}
          tone="purple"
        />
        <StatCard
          label={canManage ? "People reviewed" : "Five-star reviews"}
          value={
            canManage
              ? summary?.departments.reduce(
                  (sum, item) => sum + item.reviews,
                  0,
                ) || 0
              : distribution[0]?.count || 0
          }
          meta={canManage ? "Department contributions" : "Outstanding feedback"}
          icon={canManage ? Users : Award}
          tone="teal"
        />
      </section>

      <section className="performance-layout">
        <section className="card performance-distribution">
          <div className="card-heading">
            <div>
              <h2>Rating distribution</h2>
              <p>
                {canManage
                  ? "How reviews are spread across the 1–5 scale"
                  : "Your reviews by rating"}
              </p>
            </div>
            <Stars rating={averageRating} size={16} />
          </div>
          {distributionTotal === 0 ? (
            <EmptyState
              compact
              icon={BarChart3}
              title="No ratings yet"
              description={
                canManage
                  ? "Publish a review to start building the distribution."
                  : "Your first review will appear here."
              }
            />
          ) : (
            <div className="rating-bars">
              {distribution.map((item) => (
                <div key={item.rating} className="rating-row">
                  <span className="rating-row-label">
                    {item.rating} <Star size={12} fill="currentColor" />
                  </span>
                  <Progress
                    value={item.count}
                    max={distributionTotal}
                    tone={
                      item.rating >= 4
                        ? "green"
                        : item.rating === 3
                          ? "amber"
                          : "rose"
                    }
                  />
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          )}
          <div className="rating-scale-note">
            <Star size={14} fill="currentColor" />
            <span>
              {canManage
                ? `${summary?.average_rating.toFixed(2) || "0.00"} average across ${summary?.total_reviews || 0} reviews`
                : `${ownSummary?.average_rating.toFixed(2) || "0.00"} average across ${ownSummary?.reviews || 0} reviews`}
            </span>
          </div>
        </section>

        <section className="card performance-departments">
          <div className="card-heading">
            <div>
              <h2>{canManage ? "Department pulse" : "Your feedback journey"}</h2>
              <p>
                {canManage
                  ? "Average rating and review volume by team"
                  : "A quick read on how your ratings are trending"}
              </p>
            </div>
            <span className="icon-tile icon-tile-purple">
              <BarChart3 size={18} />
            </span>
          </div>

          {canManage ? (
            summary?.departments.length ? (
              <div className="performance-department-list">
                {summary.departments.map((department, index) => (
                  <div key={department.department} className="department-rating-row">
                    <span className="department-rank">{index + 1}</span>
                    <div className="department-rating-copy">
                      <strong>{department.department}</strong>
                      <span>{department.reviews} reviews</span>
                    </div>
                    <Progress
                      value={department.average_rating}
                      max={5}
                      tone={department.average_rating >= 3.5 ? "green" : "amber"}
                    />
                    <strong className="department-rating-value">
                      {department.average_rating.toFixed(1)}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                icon={Building2}
                title="No department data"
                description="Reviews will roll up by team once they are published."
              />
            )
          ) : (
            <div className="performance-journey">
              <div>
                <span>Latest</span>
                <strong>
                  {ownSummary?.latest_rating
                    ? `${ownSummary.latest_rating}/5`
                    : "—"}
                </strong>
                <small>
                  {ownSummary?.latest_rating
                    ? ratingLabel(ownSummary.latest_rating)
                    : "No review yet"}
                </small>
              </div>
              <div>
                <span>Average</span>
                <strong>
                  {ownSummary?.average_rating
                    ? ownSummary.average_rating.toFixed(1)
                    : "—"}
                </strong>
                <small>Across all periods</small>
              </div>
              <div>
                <span>Total</span>
                <strong>{ownSummary?.reviews || 0}</strong>
                <small>Formal reviews</small>
              </div>
            </div>
          )}
        </section>
      </section>

      {canManage && (
        <section className="card table-toolbar-card">
          <div className="table-toolbar table-toolbar-wrap">
            <div className="toolbar-left">
              <Select
                value={employeeFilter}
                onChange={(event) => setEmployeeFilter(event.target.value)}
                aria-label="Filter by employee"
                className="toolbar-select"
              >
                <option value="all">All employees</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name}
                  </option>
                ))}
              </Select>
              <Input
                value={periodFilter}
                onChange={(event) => setPeriodFilter(event.target.value)}
                placeholder="Filter by period…"
                aria-label="Filter by review period"
                className="toolbar-input"
              />
              <Select
                value={ratingFilter}
                onChange={(event) => setRatingFilter(event.target.value)}
                aria-label="Filter by minimum rating"
                className="toolbar-select"
              >
                <option value="all">Any rating</option>
                <option value="5">5 stars only</option>
                <option value="4">4 stars and up</option>
                <option value="3">3 stars and up</option>
                <option value="2">2 stars and up</option>
                <option value="1">1 star and up</option>
              </Select>
              {hasFilters && (
                <button type="button" className="text-button" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
            <span className="table-count">{reviews.length} reviews</span>
          </div>
        </section>
      )}

      {reviews.length === 0 ? (
        <section className="card">
          <EmptyState
            icon={MessageSquareQuote}
            title={hasFilters ? "No matching reviews" : "No performance reviews yet"}
            description={
              hasFilters
                ? "Try a different period, rating or employee."
                : canManage
                  ? "Publish the first review to give someone meaningful feedback."
                  : "People Ops has not published a review for you yet."
            }
            action={
              hasFilters ? (
                <Button size="sm" variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : canManage ? (
                <Button size="sm" icon={<Plus size={15} />} onClick={openCreate}>
                  New review
                </Button>
              ) : undefined
            }
          />
        </section>
      ) : (
        <section className="performance-grid">
          {reviews.map((review) => (
            <article key={review.id} className="card performance-card">
              <header className="performance-card-head">
                <div className="person-cell">
                  <Avatar
                    name={review.employee_name || `Employee ${review.employee_id}`}
                    size="sm"
                  />
                  <div>
                    <span className="person-name">
                      {review.employee_name || `Employee #${review.employee_id}`}
                    </span>
                    <span className="person-sub">
                      {review.department || "No department"} ·{" "}
                      {formatDate(review.created_at)}
                    </span>
                  </div>
                </div>
                <div className="performance-card-actions">
                  <Badge tone="blue">{review.review_period}</Badge>
                  {canManage && (
                    <>
                      <IconButton
                        label={`Edit review for ${review.employee_name || review.employee_id}`}
                        onClick={() => openEdit(review)}
                      >
                        <Pencil size={15} />
                      </IconButton>
                      <IconButton
                        label={`Delete review for ${review.employee_name || review.employee_id}`}
                        onClick={() => setDeleting(review)}
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </>
                  )}
                </div>
              </header>

              <div className="performance-rating-line">
                <Stars rating={review.rating} />
                <strong>{review.rating}/5</strong>
                <span>{ratingLabel(review.rating)}</span>
              </div>

              <blockquote className="performance-feedback">
                “{review.feedback}”
              </blockquote>

              <footer className="performance-card-foot">
                <span>
                  <CalendarRange size={14} />
                  {review.reviewed_by
                    ? `Reviewed by ${review.reviewed_by}`
                    : "Reviewer unavailable"}
                </span>
                <span>{review.review_period}</span>
              </footer>
            </article>
          ))}
        </section>
      )}

      {canManage && (
        <section className="insight-strip">
          <span className="icon-tile icon-tile-amber">
            <Star size={18} />
          </span>
          <p>
            <strong>Reviews are visible to the employee immediately.</strong> Each
            employee can only read their own feedback, while HR/Admin can compare
            ratings across departments from this page.
          </p>
        </section>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit performance review" : "Publish a performance review"}
        description={
          editing
            ? "Update the rating or feedback. The employee will see the latest version."
            : "Choose an employee, set the review period and share constructive feedback."
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setFormOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={submitReview} loading={saving}>
              {editing ? "Save changes" : "Publish review"}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          {!editing && (
            <Field label="Employee" htmlFor="review-employee" required>
              <Select
                id="review-employee"
                value={formEmployee}
                onChange={(event) => setFormEmployee(event.target.value)}
              >
                <option value="">Select an employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name} · {employee.department}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field
            label="Review period"
            htmlFor="review-period"
            hint="For example “Q3 2026” or “2026 Annual”."
            required
          >
            <Input
              id="review-period"
              value={formPeriod}
              maxLength={40}
              onChange={(event) => setFormPeriod(event.target.value)}
            />
          </Field>
          <Field label="Rating" htmlFor="review-rating" required>
            <div className="rating-picker" id="review-rating" role="group" aria-label="Rating">
              {Array.from({ length: 5 }, (_, index) => index + 1).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={value <= formRating ? "is-active" : ""}
                  onClick={() => setFormRating(value)}
                  aria-label={`${value} out of 5 stars`}
                  aria-pressed={value === formRating}
                >
                  <Star size={22} fill={value <= formRating ? "currentColor" : "none"} />
                </button>
              ))}
              <strong>{ratingLabel(formRating)}</strong>
            </div>
          </Field>
          <Field
            label="Feedback"
            htmlFor="review-feedback"
            hint={`${formFeedback.length}/2000 characters`}
            required
          >
            <Textarea
              id="review-feedback"
              rows={6}
              maxLength={2000}
              value={formFeedback}
              onChange={(event) => setFormFeedback(event.target.value)}
              placeholder="Highlight strengths, progress and a clear next step…"
            />
          </Field>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={removeReview}
        title="Delete this review?"
        description={
          deleting
            ? `The ${deleting.review_period} review for ${deleting.employee_name || `employee #${deleting.employee_id}`} will be permanently removed.`
            : ""
        }
        confirmLabel="Delete review"
        loading={removing}
      />
    </div>
  );
}
