import {
  forwardRef,
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Inbox,
  Loader2,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { getInitials, statusLabel } from "../lib/format";

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    icon,
    className = "",
    children,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`btn btn-${variant} btn-${size} ${className}`.trim()}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="spin" size={16} /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`.trim()}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className = "",
}: {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`field ${className}`.trim()}>
      {label && (
        <label htmlFor={htmlFor} className="field-label">
          {label}
          {required && <span className="required">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <span className="field-error">{error}</span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return <input ref={ref} className={`input ${className}`.trim()} {...props} />;
  },
);

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className = "", children, ...props }, ref) {
  return (
    <select ref={ref} className={`input select ${className}`.trim()} {...props}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = "", ...props }, ref) {
  return <textarea ref={ref} className={`input textarea ${className}`.trim()} {...props} />;
});

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  onChange: (value: string) => void;
}) {
  return (
    <div className={`search-input ${className}`.trim()}>
      <Search size={17} />
      <input
        {...props}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Clear search">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Display atoms
// ---------------------------------------------------------------------------
type BadgeTone =
  | "green"
  | "amber"
  | "red"
  | "blue"
  | "slate"
  | "purple"
  | "teal"
  | "rose";

const statusToneMap: Record<string, BadgeTone> = {
  ACTIVE: "green",
  INACTIVE: "slate",
  PRESENT: "green",
  HALF_DAY: "amber",
  ABSENT: "red",
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  EMPLOYEE: "blue",
  HR: "purple",
  ADMIN: "teal",
  SICK: "rose",
  CASUAL: "amber",
  PAID: "teal",
};

export function Badge({
  children,
  tone,
  status,
  dot = false,
  className = "",
}: {
  children?: ReactNode;
  tone?: BadgeTone;
  status?: string;
  dot?: boolean;
  className?: string;
}) {
  const resolvedTone = tone || (status ? statusToneMap[status] || "slate" : "slate");
  return (
    <span className={`badge badge-${resolvedTone} ${className}`.trim()}>
      {dot && <span className="badge-dot" />}
      {children ?? (status ? statusLabel(status) : null)}
    </span>
  );
}

const avatarColors = [
  "sage",
  "peach",
  "lilac",
  "sky",
  "gold",
  "mint",
  "rose",
  "sand",
];

export function Avatar({
  name,
  size = "md",
  className = "",
}: {
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const hash = Array.from(name).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const color = avatarColors[hash % avatarColors.length];
  return (
    <span className={`avatar avatar-${size} avatar-${color} ${className}`.trim()}>
      {getInitials(name)}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function StatCard({
  label,
  value,
  meta,
  icon: Icon,
  tone = "green",
  loading = false,
}: {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  icon: LucideIcon;
  tone?: "green" | "amber" | "blue" | "purple" | "rose" | "teal";
  loading?: boolean;
}) {
  return (
    <article className={`stat-card stat-${tone}`}>
      <div className="stat-top">
        <span className="stat-icon">
          <Icon size={19} />
        </span>
        {meta && <span className="stat-meta">{meta}</span>}
      </div>
      <div className="stat-value">{loading ? <span className="skeleton skeleton-value" /> : value}</div>
      <span className="stat-label">{label}</span>
    </article>
  );
}

export function Progress({
  value,
  max = 100,
  tone = "green",
  className = "",
}: {
  value: number;
  max?: number;
  tone?: "green" | "amber" | "rose" | "blue";
  className?: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className={`progress ${className}`.trim()}
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className={`progress-fill progress-${tone}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------
export function LoadingState({ label = "Loading workspace…" }: { label?: string }) {
  return (
    <div className="state-box">
      <Loader2 className="spin" size={22} />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="state-box state-error">
      <AlertTriangle size={22} />
      <div>
        <strong>We couldn’t load this view</strong>
        <p>{message}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty-state ${compact ? "empty-compact" : ""}`.trim()}>
      <span className="empty-icon">
        <Icon size={22} />
      </span>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <section
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <IconButton label="Close dialog" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "danger",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className={`confirm-visual confirm-${tone}`}>
        <AlertTriangle size={24} />
      </div>
    </Modal>
  );
}
