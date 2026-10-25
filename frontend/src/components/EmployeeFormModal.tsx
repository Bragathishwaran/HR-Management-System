import { useEffect, useState, type FormEvent } from "react";
import { useToast } from "../context/ToastContext";
import { endpoints } from "../lib/api";
import { todayISO } from "../lib/format";
import type { Employee, EmployeeStatus } from "../types";
import { Button, Field, Input, Modal, Select } from "./UI";

interface FormState {
  full_name: string;
  designation: string;
  department: string;
  joining_date: string;
  salary: string;
  status: EmployeeStatus;
  account_mode: "new" | "existing";
  user_id: string;
  username: string;
  email: string;
  password: string;
}

const emptyForm = (): FormState => ({
  full_name: "",
  designation: "",
  department: "",
  joining_date: todayISO(),
  salary: "",
  status: "ACTIVE",
  account_mode: "new",
  user_id: "",
  username: "",
  email: "",
  password: "",
});

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 40);
}

export function EmployeeFormModal({
  open,
  onClose,
  employee,
  departments,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  employee?: Employee | null;
  departments?: string[];
  onSaved: (employee: Employee) => void;
}) {
  const toast = useToast();
  const editing = Boolean(employee);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (employee) {
      setForm({
        ...emptyForm(),
        full_name: employee.full_name,
        designation: employee.designation,
        department: employee.department,
        joining_date: employee.joining_date,
        salary: employee.salary !== null ? String(employee.salary) : "",
        status: employee.status,
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, employee]);

  const update = <Key extends keyof FormState>(key: Key, value: FormState[Key]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const suggestAccount = () => {
    if (form.account_mode !== "new") return;
    const slug = slugify(form.full_name);
    if (!slug) return;
    setForm((current) => ({
      ...current,
      username: current.username || slug,
      email: current.email || `${slug}@worksphere.io`,
    }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const basePayload: Record<string, unknown> = {
        full_name: form.full_name.trim(),
        designation: form.designation.trim(),
        department: form.department.trim(),
        joining_date: form.joining_date,
        salary: Number(form.salary),
        status: form.status,
      };

      let saved: Employee;
      if (editing && employee) {
        saved = await endpoints.updateEmployee(employee.id, basePayload);
        toast.success("Employee updated", `${saved.full_name}’s profile has been saved.`);
      } else {
        if (form.account_mode === "existing") {
          basePayload.user_id = Number(form.user_id);
        } else {
          basePayload.user_credentials = {
            username: form.username.trim(),
            email: form.email.trim(),
            password: form.password,
          };
        }
        saved = await endpoints.createEmployee(basePayload);
        toast.success("Employee added", `${saved.full_name} is now in the directory.`);
      }
      onSaved(saved);
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
      title={editing ? "Edit employee" : "Add a new employee"}
      description={
        editing
          ? "Update the role, department, salary or status for this person."
          : "Create the employment profile and a login they can use on day one."
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="employee-form" loading={saving}>
            {editing ? "Save changes" : "Add employee"}
          </Button>
        </>
      }
    >
      <form id="employee-form" className="modal-form" onSubmit={submit}>
        {error && <div className="form-alert">{error}</div>}

        <div className="form-section">
          <div className="form-section-head">
            <strong>Employment details</strong>
            <span>How this person fits into the team.</span>
          </div>
          <div className="form-grid">
            <Field label="Full name" htmlFor="employee-name" required className="field-span-2">
              <Input
                id="employee-name"
                value={form.full_name}
                onChange={(event) => update("full_name", event.target.value)}
                onBlur={suggestAccount}
                placeholder="e.g. Alice Sharma"
                minLength={2}
                required
              />
            </Field>
            <Field label="Designation" htmlFor="employee-designation" required>
              <Input
                id="employee-designation"
                value={form.designation}
                onChange={(event) => update("designation", event.target.value)}
                placeholder="Senior Engineer"
                required
              />
            </Field>
            <Field label="Department" htmlFor="employee-department" required>
              <Input
                id="employee-department"
                value={form.department}
                onChange={(event) => update("department", event.target.value)}
                placeholder="Engineering"
                list="department-options"
                required
              />
              <datalist id="department-options">
                {(departments || []).map((department) => (
                  <option key={department} value={department} />
                ))}
              </datalist>
            </Field>
            <Field label="Joining date" htmlFor="employee-joining" required>
              <Input
                id="employee-joining"
                type="date"
                value={form.joining_date}
                onChange={(event) => update("joining_date", event.target.value)}
                required
              />
            </Field>
            <Field label="Monthly salary" htmlFor="employee-salary" required>
              <Input
                id="employee-salary"
                type="number"
                min={1}
                step="0.01"
                value={form.salary}
                onChange={(event) => update("salary", event.target.value)}
                placeholder="95000"
                required
              />
            </Field>
            <Field label="Status" htmlFor="employee-status">
              <Select
                id="employee-status"
                value={form.status}
                onChange={(event) => update("status", event.target.value as EmployeeStatus)}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </Select>
            </Field>
          </div>
        </div>

        {!editing && (
          <div className="form-section">
            <div className="form-section-head">
              <strong>Login account</strong>
              <span>Every employee needs an account to use self-service.</span>
            </div>
            <div className="segmented-control">
              <button
                type="button"
                className={form.account_mode === "new" ? "is-active" : ""}
                onClick={() => update("account_mode", "new")}
              >
                Create a new account
              </button>
              <button
                type="button"
                className={form.account_mode === "existing" ? "is-active" : ""}
                onClick={() => update("account_mode", "existing")}
              >
                Link an existing user
              </button>
            </div>

            {form.account_mode === "new" ? (
              <div className="form-grid form-grid-spaced">
                <Field label="Username" htmlFor="employee-username" required>
                  <Input
                    id="employee-username"
                    value={form.username}
                    onChange={(event) => update("username", event.target.value)}
                    placeholder="alice.sharma"
                    minLength={3}
                    pattern="[A-Za-z0-9_.-]+"
                    required
                  />
                </Field>
                <Field label="Work email" htmlFor="employee-email" required>
                  <Input
                    id="employee-email"
                    type="email"
                    value={form.email}
                    onChange={(event) => update("email", event.target.value)}
                    placeholder="alice@worksphere.io"
                    required
                  />
                </Field>
                <Field
                  label="Temporary password"
                  htmlFor="employee-password"
                  hint="At least 8 characters. Share this securely."
                  required
                  className="field-span-2"
                >
                  <Input
                    id="employee-password"
                    type="text"
                    value={form.password}
                    onChange={(event) => update("password", event.target.value)}
                    placeholder="Passw0rd!123"
                    minLength={8}
                    required
                  />
                </Field>
              </div>
            ) : (
              <div className="form-grid form-grid-spaced">
                <Field
                  label="Existing user ID"
                  htmlFor="employee-user-id"
                  hint="Find the ID on the User access page (Admin only)."
                  required
                >
                  <Input
                    id="employee-user-id"
                    type="number"
                    min={1}
                    value={form.user_id}
                    onChange={(event) => update("user_id", event.target.value)}
                    placeholder="12"
                    required
                  />
                </Field>
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
