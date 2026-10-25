import { useState, type FormEvent } from "react";
import {
  CalendarDays,
  CircleHelp,
  Edit3,
  RefreshCw,
  ScrollText,
  Sparkles,
  Users,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import { useResource } from "../hooks/useResource";
import { endpoints } from "../lib/api";
import { leaveAccent, statusLabel } from "../lib/format";
import type { LeavePolicy, LeaveType } from "../types";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Progress,
  StatCard,
} from "../components/UI";

const icons: Record<LeaveType, string> = {
  SICK: "S",
  CASUAL: "C",
  PAID: "P",
};

export function LeavePoliciesPage() {
  const toast = useToast();
  const [editing, setEditing] = useState<LeavePolicy | null>(null);
  const [days, setDays] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resource = useResource(async () => {
    const [policies, balances] = await Promise.all([
      endpoints.leavePolicies(),
      endpoints.leaveBalances(),
    ]);
    return { policies, balances };
  }, []);

  if (resource.loading && !resource.data) {
    return <LoadingState label="Loading leave policies…" />;
  }
  if (resource.error || !resource.data) {
    return <ErrorState message={resource.error || "Policies unavailable"} onRetry={resource.refresh} />;
  }

  const { policies, balances } = resource.data;
  const employeeCount = new Set(balances.map((balance) => balance.employee_id)).size;
  const totalAllocated = policies.reduce(
    (sum, policy) => sum + policy.total_days_allowed,
    0,
  );
  const totalRemaining = balances.reduce((sum, balance) => sum + balance.remaining_days, 0);
  const averageRemaining = employeeCount
    ? balances.reduce((sum, balance) => sum + balance.remaining_days, 0) /
      (employeeCount * Math.max(1, policies.length))
    : 0;

  const openEdit = (policy: LeavePolicy) => {
    setEditing(policy);
    setDays(String(policy.total_days_allowed));
    setError(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await endpoints.updateLeavePolicy(editing.leave_type, Number(days));
      toast.success(
        "Policy updated",
        `${statusLabel(editing.leave_type)} allocation is now ${days} days per year.`,
      );
      setEditing(null);
      resource.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="People operations"
        title="Leave policies"
        description="Set the yearly rhythm for time off across the organisation."
        actions={
          <Button
            variant="secondary"
            icon={<RefreshCw size={16} />}
            onClick={resource.refresh}
            loading={resource.loading}
          >
            Refresh
          </Button>
        }
      />

      <section className="policy-hero card">
        <div className="policy-hero-copy">
          <span className="policy-hero-icon">
            <ScrollText size={22} />
          </span>
          <div>
            <span className="eyebrow">Annual allocation</span>
            <h2>Every leave type, one clear policy.</h2>
            <p>
              New employees automatically receive the current allocation for each leave type.
              Updating a policy changes the yearly allocation for future balances — existing
              approved leave remains intact.
            </p>
          </div>
        </div>
        <div className="policy-hero-stats">
          <div>
            <span>Leave types</span>
            <strong>{policies.length}</strong>
          </div>
          <div>
            <span>Days per person</span>
            <strong>{totalAllocated}</strong>
          </div>
          <div>
            <span>Employees covered</span>
            <strong>{employeeCount}</strong>
          </div>
        </div>
      </section>

      <section className="stats-grid stats-grid-3">
        <StatCard
          label="Total allocation"
          value={`${totalAllocated} days`}
          meta="Per employee, per year"
          icon={CalendarDays}
          tone="green"
        />
        <StatCard
          label="Average remaining"
          value={`${averageRemaining.toFixed(1)} days`}
          meta="Across all leave types"
          icon={Sparkles}
          tone="teal"
        />
        <StatCard
          label="Balance records"
          value={balances.length}
          meta={`${employeeCount} employees`}
          icon={Users}
          tone="purple"
        />
      </section>

      {policies.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No leave policies configured"
          description="Default policies are created automatically when the API starts."
        />
      ) : (
        <section className="policy-grid">
          {policies.map((policy) => {
            const tone = leaveAccent(policy.leave_type);
            const typeBalances = balances.filter(
              (balance) => balance.leave_type === policy.leave_type,
            );
            const remaining = typeBalances.reduce(
              (sum, balance) => sum + balance.remaining_days,
              0,
            );
            const allocated = policy.total_days_allowed * Math.max(employeeCount, 1);
            return (
              <article key={policy.id} className={`card policy-card policy-${tone}`}>
                <div className="policy-card-head">
                  <span className={`policy-letter policy-letter-${tone}`}>
                    {icons[policy.leave_type]}
                  </span>
                  <div>
                    <Badge status={policy.leave_type} />
                    <h3>{statusLabel(policy.leave_type)}</h3>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => openEdit(policy)}
                    aria-label={`Edit ${policy.leave_type} policy`}
                  >
                    <Edit3 size={16} />
                  </button>
                </div>
                <div className="policy-days">
                  <strong>{policy.total_days_allowed}</strong>
                  <span>days / employee / year</span>
                </div>
                <div className="policy-utilisation">
                  <div>
                    <span>Team utilisation</span>
                    <strong>
                      {allocated > 0
                        ? `${Math.round(((allocated - remaining) / allocated) * 100)}%`
                        : "0%"}
                    </strong>
                  </div>
                  <Progress
                    value={Math.max(0, allocated - remaining)}
                    max={allocated}
                    tone={tone === "rose" ? "rose" : tone === "amber" ? "amber" : "green"}
                  />
                  <span className="policy-footnote">
                    {remaining} of {allocated} days still available
                  </span>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <section className="policy-note">
        <CircleHelp size={18} />
        <p>
          Leave balance is deducted when a request is approved. Rejected requests never affect
          the balance. Employees see their remaining days on the Leave page.
        </p>
      </section>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${statusLabel(editing.leave_type)} policy` : "Edit policy"}
        description="Set the yearly allocation. This applies to new employee balances."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="policy-form" loading={saving}>
              Save policy
            </Button>
          </>
        }
      >
        <form id="policy-form" className="modal-form" onSubmit={save}>
          {error && <div className="form-alert">{error}</div>}
          <Field
            label="Days allowed per year"
            htmlFor="policy-days"
            hint="Between 0 and 365 days."
            required
          >
            <Input
              id="policy-days"
              type="number"
              min={0}
              max={365}
              value={days}
              onChange={(event) => setDays(event.target.value)}
              required
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
