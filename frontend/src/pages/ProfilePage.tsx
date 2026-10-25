import {
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  KeyRound,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
  WalletCards,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useResource } from "../hooks/useResource";
import { endpoints } from "../lib/api";
import {
  formatCurrency,
  formatDate,
  leaveAccent,
  roleLabel,
  statusLabel,
} from "../lib/format";
import {
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Progress,
} from "../components/UI";

export function ProfilePage() {
  const { user } = useAuth();
  const resource = useResource(async () => {
    const profile = await endpoints.myProfile();
    const balances = await endpoints.myBalances();
    return { profile, balances };
  }, []);

  const unlinked =
    resource.error?.toLowerCase().includes("no employee profile") ?? false;

  if (resource.loading && !resource.data) {
    return <LoadingState label="Opening your profile…" />;
  }

  if (resource.error && !unlinked) {
    return <ErrorState message={resource.error} onRetry={resource.refresh} />;
  }

  const profile = resource.data?.profile;
  const balances = resource.data?.balances || [];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Your account"
        title="My profile"
        description="Your personal details and how WorkSphere knows you."
      />

      <section className="profile-hero card">
        <div className="profile-hero-main">
          <Avatar name={profile?.full_name || user?.username || "User"} size="xl" />
          <div className="profile-hero-copy">
            <div className="profile-role-line">
              <Badge status={user?.role} />
              {profile && <Badge status={profile.status} dot />}
            </div>
            <h1>{profile?.full_name || user?.username}</h1>
            <p>
              {profile
                ? `${profile.designation} · ${profile.department}`
                : `${roleLabel[user?.role || "EMPLOYEE"]} account`}
            </p>
            <div className="profile-contact">
              <span>
                <Mail size={14} /> {user?.email}
              </span>
              <span>
                <UserRound size={14} /> @{user?.username}
              </span>
            </div>
          </div>
        </div>
        <div className="profile-hero-stats">
          <div>
            <span>Account status</span>
            <strong>{user?.is_active ? "Active" : "Inactive"}</strong>
          </div>
          <div>
            <span>Member since</span>
            <strong>{formatDate(user?.created_at)}</strong>
          </div>
          <div>
            <span>Access level</span>
            <strong>{roleLabel[user?.role || "EMPLOYEE"]}</strong>
          </div>
          <div>
            <span>Workspace</span>
            <strong>WorkSphere HQ</strong>
          </div>
        </div>
      </section>

      <div className="profile-grid">
        <section className="card detail-info-card">
          <div className="card-heading">
            <div>
              <h2>Account details</h2>
              <p>Managed by your workspace administrator</p>
            </div>
            <span className="icon-tile icon-tile-purple">
              <ShieldCheck size={18} />
            </span>
          </div>
          <div className="info-grid">
            <div>
              <span>
                <UserRound size={14} /> Username
              </span>
              <strong>@{user?.username}</strong>
            </div>
            <div>
              <span>
                <Mail size={14} /> Email
              </span>
              <strong>{user?.email}</strong>
            </div>
            <div>
              <span>
                <ShieldCheck size={14} /> Role
              </span>
              <strong>{roleLabel[user?.role || "EMPLOYEE"]}</strong>
            </div>
            <div>
              <span>
                <BadgeCheck size={14} /> Status
              </span>
              <strong>{user?.is_active ? "Active" : "Inactive"}</strong>
            </div>
            <div>
              <span>
                <CalendarDays size={14} /> Account created
              </span>
              <strong>{formatDate(user?.created_at)}</strong>
            </div>
            <div>
              <span>
                <KeyRound size={14} /> Authentication
              </span>
              <strong>JWT · password secured</strong>
            </div>
          </div>
        </section>

        {profile ? (
          <section className="card detail-info-card">
            <div className="card-heading">
              <div>
                <h2>Employment details</h2>
                <p>Your role at WorkSphere</p>
              </div>
              <span className="icon-tile icon-tile-green">
                <BriefcaseBusiness size={18} />
              </span>
            </div>
            <div className="info-grid">
              <div>
                <span>
                  <Building2 size={14} /> Department
                </span>
                <strong>{profile.department}</strong>
              </div>
              <div>
                <span>
                  <BriefcaseBusiness size={14} /> Designation
                </span>
                <strong>{profile.designation}</strong>
              </div>
              <div>
                <span>
                  <CalendarDays size={14} /> Joined
                </span>
                <strong>{formatDate(profile.joining_date)}</strong>
              </div>
              <div>
                <span>
                  <WalletCards size={14} /> Monthly salary
                </span>
                <strong>{formatCurrency(profile.salary)}</strong>
              </div>
              <div>
                <span>
                  <BadgeCheck size={14} /> Employment status
                </span>
                <strong>{statusLabel(profile.status)}</strong>
              </div>
              <div>
                <span>
                  <UserRound size={14} /> Employee ID
                </span>
                <strong>WS-{String(profile.id).padStart(4, "0")}</strong>
              </div>
            </div>
          </section>
        ) : (
          <section className="card unlinked-card compact-unlinked">
            <span className="unlinked-icon">
              <Sparkles size={22} />
            </span>
            <h2>No employee profile linked</h2>
            <p>
              Your login works, but there isn’t an employment profile attached yet. Ask People
              Ops to link your account to unlock attendance, leave and payslips.
            </p>
            <Link to="/" className="button-link">
              Back to dashboard
            </Link>
          </section>
        )}
      </div>

      {profile && (
        <section className="card">
          <div className="card-heading card-heading-inset">
            <div>
              <h2>Your leave balances</h2>
              <p>Remaining allocation this year</p>
            </div>
            <Link to="/leaves" className="text-link">
              Apply for leave
            </Link>
          </div>
          {balances.length === 0 ? (
            <EmptyState
              compact
              icon={CalendarDays}
              title="No leave balance yet"
              description="Ask People Ops to initialise your leave policy."
            />
          ) : (
            <div className="profile-balance-grid">
              {balances.map((balance) => {
                const total = balance.total_days_allowed || 1;
                const tone = leaveAccent(balance.leave_type);
                return (
                  <div key={balance.leave_type} className={`profile-balance balance-${tone}`}>
                    <div>
                      <span>{statusLabel(balance.leave_type)}</span>
                      <strong>
                        {balance.remaining_days} <small>of {total} days left</small>
                      </strong>
                    </div>
                    <Progress
                      value={balance.remaining_days}
                      max={total}
                      tone={tone === "rose" ? "rose" : tone === "amber" ? "amber" : "green"}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
