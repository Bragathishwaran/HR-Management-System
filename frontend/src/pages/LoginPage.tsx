import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { AuthShell } from "../components/AuthShell";
import { Button, Field } from "../components/UI";
import { useAuth } from "../context/AuthContext";

const demoAccounts = [
  { username: "admin1@worksphere.io", label: "Admin", tone: "teal" },
  { username: "hr1@worksphere.io", label: "HR", tone: "purple" },
  { username: "alice@worksphere.io", label: "Employee", tone: "blue" },
];

const DEMO_PASSWORD = "Passw0rd!123";

export function LoginPage() {
  const { user, login, initializing } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destination =
    (location.state as { from?: string } | null)?.from &&
    (location.state as { from?: string }).from !== "/login"
      ? (location.state as { from?: string }).from!
      : "/";

  if (!initializing && user) {
    return <Navigate to={destination} replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      // The authenticated re-render above redirects to `destination`.
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const useDemo = (account: string) => {
    setUsername(account);
    setPassword(DEMO_PASSWORD);
    setError(null);
  };

  return (
    <AuthShell>
      <div className="auth-form-header">
        <span className="auth-form-icon">
          <KeyRound size={20} />
        </span>
        <span className="eyebrow">Welcome back</span>
        <h2>Sign in to WorkSphere</h2>
        <p>Use your work username or email to enter your workspace.</p>
      </div>

      <form onSubmit={submit} className="auth-form">
        {error && (
          <div className="form-alert" role="alert">
            <ShieldCheck size={17} />
            <span>{error}</span>
          </div>
        )}

        <Field label="Username or email" htmlFor="username" required>
          <div className="input-icon-wrap">
            <UserRound size={17} />
            <input
              id="username"
              className="input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="e.g. alice or alice@worksphere.io"
              autoComplete="username"
              autoFocus
              required
            />
          </div>
        </Field>

        <Field label="Password" htmlFor="password" required>
          <div className="input-icon-wrap">
            <LockKeyhole size={17} />
            <input
              id="password"
              className="input input-with-action"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
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

        <div className="auth-form-meta">
          <label className="checkbox-label">
            <input type="checkbox" defaultChecked /> Keep me signed in
          </label>
          <span>JWT secured</span>
        </div>

        <Button type="submit" size="lg" loading={loading} className="auth-submit">
          Sign in <ArrowRight size={17} />
        </Button>
      </form>

      <div className="demo-panel">
        <div className="demo-panel-head">
          <div>
            <strong>Explore the demo</strong>
            <span>One click to fill credentials</span>
          </div>
          <span className="demo-password">{DEMO_PASSWORD}</span>
        </div>
        <div className="demo-accounts">
          {demoAccounts.map((account) => (
            <button
              key={account.username}
              type="button"
              onClick={() => useDemo(account.username)}
              className={`demo-account demo-${account.tone}`}
            >
              <span>{account.username.slice(0, 1).toUpperCase()}</span>
              <div>
                <strong>{account.username}</strong>
                <small>{account.label}</small>
              </div>
            </button>
          ))}
        </div>
      </div>

      <p className="auth-switch">
        New to WorkSphere? <Link to="/register">Create an account</Link>
      </p>
    </AuthShell>
  );
}
