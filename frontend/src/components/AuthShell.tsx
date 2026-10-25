import type { ReactNode } from "react";
import { ArrowUpRight, CheckCircle2, Sparkles } from "lucide-react";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <section className="auth-visual">
        <div className="auth-visual-glow auth-glow-one" />
        <div className="auth-visual-glow auth-glow-two" />
        <div className="auth-visual-grid" />

        <header className="auth-brand">
          <div className="brand-mark brand-mark-light">
            <span>W</span>
          </div>
          <div>
            <strong>WorkSphere</strong>
            <span>HR management, humanised</span>
          </div>
        </header>

        <div className="auth-visual-content">
          <span className="auth-kicker">
            <Sparkles size={14} /> Your people, in one calm place
          </span>
          <h1>
            The whole employee
            <br />
            journey, <em>connected.</em>
          </h1>
          <p>
            From the first hello to payday. WorkSphere brings people, time and
            payroll into a single view your team can trust.
          </p>

          <div className="auth-feature-list">
            <span>
              <CheckCircle2 size={17} /> Live attendance & working hours
            </span>
            <span>
              <CheckCircle2 size={17} /> Transparent leave balances
            </span>
            <span>
              <CheckCircle2 size={17} /> Clear, timely payroll
            </span>
          </div>
        </div>

        <div className="auth-preview-card">
          <div className="auth-preview-head">
            <span>Today at WorkSphere</span>
            <span className="live-pill">
              <i /> Live
            </span>
          </div>
          <div className="auth-preview-body">
            <div className="auth-mini-avatars">
              <span className="mini-avatar mini-a">AS</span>
              <span className="mini-avatar mini-b">BV</span>
              <span className="mini-avatar mini-c">RK</span>
              <span className="mini-avatar mini-d">+8</span>
            </div>
            <div className="auth-preview-copy">
              <strong>11 people checked in</strong>
              <span>94% on-time this week</span>
            </div>
            <span className="auth-preview-arrow">
              <ArrowUpRight size={16} />
            </span>
          </div>
          <div className="auth-preview-bars">
            <span style={{ height: "46%" }} />
            <span style={{ height: "64%" }} />
            <span style={{ height: "52%" }} />
            <span style={{ height: "83%" }} />
            <span style={{ height: "72%" }} />
            <span style={{ height: "96%" }} />
            <span style={{ height: "88%" }} />
          </div>
        </div>

        <footer className="auth-visual-foot">
          <span>Trusted by people teams who care about the details.</span>
          <span>© {new Date().getFullYear()} WorkSphere</span>
        </footer>
      </section>

      <section className="auth-form-side">
        <div className="auth-form-inner">{children}</div>
        <p className="auth-form-foot">
          Protected by JWT authentication and role-based access control.
        </p>
      </section>
    </div>
  );
}
