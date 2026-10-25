import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserPlus,
  UserRound,
} from "lucide-react";
import { AuthShell } from "../components/AuthShell";
import { Button, Field } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { registerRequest } from "../lib/api";

export function RegisterPage() {
  const { user, login, initializing } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!initializing && user) {
    return <Navigate to="/" replace />;
  }

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (form.password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    setLoading(true);
    try {
      await registerRequest({
        username: form.username,
        email: form.email,
        password: form.password,
      });
      await login(form.username, form.password);
      navigate("/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="auth-form-header">
        <span className="auth-form-icon">
          <UserPlus size={20} />
        </span>
        <span className="eyebrow">Join the workspace</span>
        <h2>Create your account</h2>
        <p>Self-registration creates an employee account. People Ops will link your profile.</p>
      </div>

      <form onSubmit={submit} className="auth-form">
        {error && (
          <div className="form-alert" role="alert">
            <ShieldCheck size={17} />
            <span>{error}</span>
          </div>
        )}

        <div className="form-row">
          <Field label="Username" htmlFor="reg-username" required>
            <div className="input-icon-wrap">
              <UserRound size={17} />
              <input
                id="reg-username"
                className="input"
                value={form.username}
                onChange={(event) => update("username", event.target.value)}
                placeholder="alex.morgan"
                minLength={3}
                maxLength={50}
                pattern="[A-Za-z0-9_.-]+"
                autoComplete="username"
                required
              />
            </div>
          </Field>

          <Field label="Work email" htmlFor="reg-email" required>
            <div className="input-icon-wrap">
              <Mail size={17} />
              <input
                id="reg-email"
                className="input"
                type="email"
                value={form.email}
                onChange={(event) => update("email", event.target.value)}
                placeholder="alex@company.com"
                autoComplete="email"
                required
              />
            </div>
          </Field>
        </div>

        <Field label="Password" htmlFor="reg-password" hint="At least 8 characters." required>
          <div className="input-icon-wrap">
            <LockKeyhole size={17} />
            <input
              id="reg-password"
              className="input input-with-action"
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(event) => update("password", event.target.value)}
              placeholder="Create a strong password"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <button
              type="button"
              className="input-action"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>

        <Field label="Confirm password" htmlFor="reg-confirm" required>
          <div className="input-icon-wrap">
            <LockKeyhole size={17} />
            <input
              id="reg-confirm"
              className="input"
              type={showPassword ? "text" : "password"}
              value={form.confirm}
              onChange={(event) => update("confirm", event.target.value)}
              placeholder="Repeat your password"
              autoComplete="new-password"
              required
            />
          </div>
        </Field>

        <Button type="submit" size="lg" loading={loading} className="auth-submit">
          Create account <ArrowRight size={17} />
        </Button>
      </form>

      <p className="auth-switch">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthShell>
  );
}
