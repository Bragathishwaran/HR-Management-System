import { useEffect, useState } from "react";
import { Star, MessageSquare } from "lucide-react";
import { endpoints } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Button, Card, EmptyState, Modal, Textarea } from "../components/UI";
import type { Feedback, FeedbackSummary } from "../types";

export function FeedbackPage() {
  const { user } = useAuth();
  const { pushToast } = useToast();
  const isStaff = user?.role === "HR" || user?.role === "ADMIN";
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ message: "", rating: 5, is_anonymous: false });

  const load = async () => {
    setLoading(true);
    try {
      if (isStaff) {
        const [list, sum] = await Promise.all([endpoints.feedbackList(), endpoints.feedbackSummary()]);
        setFeedback(list);
        setSummary(sum);
      }
    } catch (err: any) {
      pushToast(err.message || "Failed to load feedback", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await endpoints.submitFeedback(form);
      pushToast("Feedback submitted successfully", "success");
      setOpen(false);
      setForm({ message: "", rating: 5, is_anonymous: false });
    } catch (err: any) {
      pushToast(err.message, "error");
    }
  };

  return (
    <div className="page-grid">
      <Card
        title={isStaff ? "Employee Feedback" : "Submit Feedback"}
        subtitle={isStaff ? "View and analyze feedback" : "Share your thoughts anonymously or named"}
        action={
          !isStaff && (
            <Button onClick={() => setOpen(true)}>
              <MessageSquare size={16} /> Give Feedback
            </Button>
          )
        }
      >
        {isStaff && summary && (
          <div className="feedback-summary">
            <div className="summary-card">
              <strong>{summary.average_rating.toFixed(1)}</strong>
              <span>Average Rating</span>
            </div>
            <div className="summary-card">
              <strong>{summary.total}</strong>
              <span>Total Feedback</span>
            </div>
            <div className="rating-bars">
              {[5,4,3,2,1].map((r) => (
                <div key={r} className="rating-bar-row">
                  <span>{r} ★</span>
                  <div className="rating-bar"><div style={{ width: `${summary.total ? (summary.rating_distribution[r.toString()] / summary.total) * 100 : 0}%` }} /></div>
                  <span>{summary.rating_distribution[r.toString()] || 0}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {loading ? (
          <EmptyState title="Loading..." description="" />
        ) : isStaff ? (
          feedback.length === 0 ? (
            <EmptyState title="No feedback yet" description="Feedback will appear here" />
          ) : (
            <div className="feedback-list">
              {feedback.map((fb) => (
                <div key={fb.id} className="feedback-item">
                  <div className="feedback-header">
                    <div className="feedback-author">{fb.is_anonymous ? "Anonymous" : fb.employee_name || "Employee"}</div>
                    <div className="feedback-rating">{Array(fb.rating).fill(0).map((_, i) => <Star key={i} size={14} fill="currentColor" />)}</div>
                    <span className="feedback-date">{new Date(fb.created_at).toLocaleDateString()}</span>
                  </div>
                  <p>{fb.message}</p>
                </div>
              ))}
            </div>
          )
        ) : (
          <EmptyState title="Share your feedback" description="Your feedback helps us improve. You can submit anonymously." />
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Submit Feedback">
        <form onSubmit={submitFeedback} className="form-grid">
          <div className="form-field">
            <label>Rating</label>
            <div className="star-rating">
              {[1,2,3,4,5].map((r) => (
                <button type="button" key={r} onClick={() => setForm({ ...form, rating: r })}>
                  <Star size={24} fill={r <= form.rating ? "currentColor" : "none"} />
                </button>
              ))}
            </div>
          </div>
          <Textarea label="Message" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={5} required />
          <label className="checkbox-field">
            <input type="checkbox" checked={form.is_anonymous} onChange={(e) => setForm({ ...form, is_anonymous: e.target.checked })} />
            Submit anonymously
          </label>
          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Submit</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
