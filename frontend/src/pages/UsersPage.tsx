import { useMemo, useState, type FormEvent } from "react";
import {
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserCog,
  UserX,
  Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useResource } from "../hooks/useResource";
import { endpoints } from "../lib/api";
import { formatDate } from "../lib/format";
import type { Role, User } from "../types";
import {
  Avatar,
  Badge,
  Button,
  ConfirmModal,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  StatCard,
} from "../components/UI";

interface UserFormState {
  username: string;
  email: string;
  password: string;
  role: Role;
  is_active: boolean;
}

const emptyUserForm = (): UserFormState => ({
  username: "",
  email: "",
  password: "",
  role: "EMPLOYEE",
  is_active: true,
});

function UserFormModal({
  open,
  onClose,
  user,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  user: User | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const editing = Boolean(user);
  const [form, setForm] = useState<UserFormState>(emptyUserForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form whenever a different account is opened.
  const formKey = `${open}-${user?.id ?? "new"}`;
  const [lastKey, setLastKey] = useState("");
  if (formKey !== lastKey) {
    setLastKey(formKey);
    setForm(
      user
        ? {
            username: user.username,
            email: user.email,
            password: "",
            role: user.role,
            is_active: user.is_active,
          }
        : emptyUserForm(),
    );
    setError(null);
  }

  const update = <Key extends keyof UserFormState>(key: Key, value: UserFormState[Key]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing && user) {
        const payload: Record<string, unknown> = {
          username: form.username,
          email: form.email,
          role: form.role,
          is_active: form.is_active,
        };
        if (form.password) payload.password = form.password;
        await endpoints.updateUser(user.id, payload);
        toast.success("Account updated", `${form.username}’s access has been saved.`);
      } else {
        const payload: Record<string, unknown> = {
          username: form.username,
          email: form.email,
          password: form.password,
          role: form.role,
          is_active: form.is_active,
        };
        await endpoints.createUser(payload);
        toast.success("Account created", `${form.username} can now sign in.`);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit user access" : "Create a user account"}
      description={
        editing
          ? "Change the role, details or activation state for this login."
          : "Accounts let people sign in. Link an employee profile separately."
      }
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={saving}>
            {editing ? "Save account" : "Create account"}
          </Button>
        </>
      }
    >
      <form id="user-form" className="modal-form" onSubmit={submit}>
        {error && <div className="form-alert">{error}</div>}
        <div className="form-grid">
          <Field label="Username" htmlFor="user-username" required>
            <Input
              id="user-username"
              value={form.username}
              onChange={(event) => update("username", event.target.value)}
              placeholder="alex.morgan"
              minLength={3}
              pattern="[A-Za-z0-9_.-]+"
              required
            />
          </Field>
          <Field label="Email" htmlFor="user-email" required>
            <Input
              id="user-email"
              type="email"
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
              placeholder="alex@company.com"
              required
            />
          </Field>
          <Field
            label={editing ? "New password" : "Password"}
            htmlFor="user-password"
            hint={editing ? "Leave blank to keep the current password." : "At least 8 characters."}
            required={!editing}
          >
            <Input
              id="user-password"
              type="password"
              value={form.password}
              onChange={(event) => update("password", event.target.value)}
              placeholder={editing ? "Unchanged" : "Set a temporary password"}
              minLength={8}
              required={!editing}
            />
          </Field>
          <Field label="Role" htmlFor="user-role">
            <Select
              id="user-role"
              value={form.role}
              onChange={(event) => update("role", event.target.value as Role)}
            >
              <option value="EMPLOYEE">Employee</option>
              <option value="HR">HR / People Ops</option>
              <option value="ADMIN">Administrator</option>
            </Select>
          </Field>
        </div>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(event) => update("is_active", event.target.checked)}
          />
          <span>
            <strong>Account active</strong>
            <small>Inactive accounts cannot sign in or use existing tokens.</small>
          </span>
        </label>
      </form>
    </Modal>
  );
}

export function UsersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"all" | Role>("all");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const resource = useResource(() => endpoints.users({ limit: 200 }), []);
  const users = resource.data || [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((item) => {
      const matchesSearch =
        !term ||
        item.username.toLowerCase().includes(term) ||
        item.email.toLowerCase().includes(term);
      const matchesRole = role === "all" || item.role === role;
      const matchesStatus =
        status === "all" ||
        (status === "active" ? item.is_active : !item.is_active);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, role, status]);

  const active = users.filter((item) => item.is_active).length;
  const admins = users.filter((item) => item.role === "ADMIN").length;
  const hr = users.filter((item) => item.role === "HR").length;

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (item: User) => {
    setEditing(item);
    setFormOpen(true);
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await endpoints.deleteUser(deleting.id);
      toast.success("Account deleted", `${deleting.username} can no longer sign in.`);
      setDeleting(null);
      resource.refresh();
    } catch (error) {
      toast.error("Could not delete account", (error as Error).message);
    } finally {
      setDeleteLoading(false);
    }
  };

  if (resource.loading && !resource.data) {
    return <LoadingState label="Loading accounts…" />;
  }
  if (resource.error) {
    return <ErrorState message={resource.error} onRetry={resource.refresh} />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="System control"
        title="User access"
        description="Manage who can enter WorkSphere — and what they can do once inside."
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
            <Button icon={<Plus size={16} />} onClick={openCreate}>
              New account
            </Button>
          </>
        }
      />

      <section className="stats-grid">
        <StatCard label="Total accounts" value={users.length} meta={`${active} active`} icon={Users} tone="green" />
        <StatCard label="Administrators" value={admins} meta="Full system access" icon={ShieldCheck} tone="purple" />
        <StatCard label="People Ops" value={hr} meta="Employee operations" icon={UserCog} tone="teal" />
        <StatCard
          label="Inactive"
          value={users.length - active}
          meta="Sign-in blocked"
          icon={UserX}
          tone="rose"
        />
      </section>

      <section className="card table-card">
        <div className="table-toolbar table-toolbar-wrap">
          <div className="toolbar-left">
            <SearchInput value={search} onChange={setSearch} placeholder="Search username or email…" />
            <Select
              value={role}
              onChange={(event) => setRole(event.target.value as "all" | Role)}
              aria-label="Filter by role"
              className="toolbar-select"
            >
              <option value="all">All roles</option>
              <option value="EMPLOYEE">Employee</option>
              <option value="HR">HR / People Ops</option>
              <option value="ADMIN">Administrator</option>
            </Select>
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value as "all" | "active" | "inactive")}
              aria-label="Filter by account status"
              className="toolbar-select"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
          <span className="table-count">{filtered.length} accounts</span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={UserX}
            title="No matching accounts"
            description="Adjust the filters or create a new account."
            action={
              <Button size="sm" variant="secondary" onClick={() => {
                setSearch("");
                setRole("all");
                setStatus("all");
              }}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const isSelf = item.id === user?.id;
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="person-cell">
                          <Avatar name={item.username} size="sm" />
                          <div>
                            <span className="person-name">
                              {item.username}
                              {isSelf && <span className="self-tag">You</span>}
                            </span>
                            <span className="person-sub">{item.email}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge status={item.role} />
                      </td>
                      <td>
                        <Badge status={item.is_active ? "ACTIVE" : "INACTIVE"} dot />
                      </td>
                      <td>{formatDate(item.created_at)}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="table-action"
                            onClick={() => openEdit(item)}
                            aria-label={`Edit ${item.username}`}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="table-action table-action-danger"
                            onClick={() => setDeleting(item)}
                            disabled={isSelf}
                            title={isSelf ? "You cannot delete your own account" : "Delete account"}
                            aria-label={`Delete ${item.username}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="access-notes">
        <div>
          <span className="icon-tile icon-tile-teal">
            <UserCheck size={18} />
          </span>
          <p>
            <strong>Role changes take effect immediately.</strong> Existing tokens are
            invalidated on the next request, so people must sign in again.
          </p>
        </div>
        <div>
          <span className="icon-tile icon-tile-purple">
            <KeyRound size={18} />
          </span>
          <p>
            <strong>At least one active admin is required.</strong> You cannot deactivate,
            demote or delete your own admin account.
          </p>
        </div>
      </section>

      <UserFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        user={editing}
        onSaved={resource.refresh}
      />
      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title="Delete this account?"
        description={
          deleting
            ? `${deleting.username} will lose access immediately. If an employee profile and records are linked, they will be removed too.`
            : ""
        }
        confirmLabel="Delete account"
        loading={deleteLoading}
      />
    </div>
  );
}
