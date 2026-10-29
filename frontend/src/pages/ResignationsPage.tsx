import { useEffect, useState } from "react";
import { Check, X, Plus } from "lucide-react";
import { endpoints } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Badge, Button, Card, EmptyState, Input, Modal, Textarea } from "../components/UI";
import type { Resignation } from "../types";

export function ResignationsPage() {
  const { user } = useAuth();
  const { pushToast } = useToast();
  const isStaff = user?.role === "HR" || user?.role === "ADMIN";
  const [resignations, setResignations] = useState<Resignation[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ reason: "", notice_period: "" });

  const load = async () => {
    setLoading(true);
    try {
      const data = await endpoints.resignations();
      setResignations(data);
    } catch (err: any) {
      pushToast(err.message || "Failed to load resignations", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submitResignation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await endpoints.submitResignation(form);
      pushToast("Resignation submitted successfully", "success");
      setOpen(false);
      setForm({ reason: "", notice_period: "" });
      load();
    } catch (err: any) {
      pushToast(err.message, "error");
    }
  };

  const updateStatus = async (id: number, status: "APPROVED" | "REJECTED") => {
    try {
      await endpoints.updateResignationStatus(id, status);
      pushToast(`Resignation ${status.toLowerCase()}`, "success");
      load();
    } catch (err: any) {
      pushToast(err.message, "error");
    }
  };

  return (
    <div className="page-grid">
      <Card
        title="Resignation & Exit Management"
        subtitle={isStaff ? "Review and process resignations" : "Submit and track your resignation"}
        action={
          !isStaff && (
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} /> Submit Resignation
            </Button>
          )
        }
      >
        {loading ? (
          <EmptyState title="Loading..." description="" />
        ) : resignations.length === 0 ? (
          <EmptyState title="No resignations" description={isStaff ? "No pending resignations" : "You haven't submitted any resignation"} />
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  {isStaff && <th>Employee</th>}
                  {isStaff && <th>Department</th>}
                  <th>Reason</th>
                  <th>Notice Period</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  {isStaff && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {resignations.map((res) => (
                  <tr key={res.id}>
                    {isStaff && <td>{res.employee_name}</td>}
                    {isStaff && <td>{res.department}</td>}
                    <td className="wrap-text">{res.reason}</td>
                    <td>{res.notice_period}</td>
                    <td><Badge status={res.status} /></td>
                    <td>{new Date(res.created_at).toLocaleDateString()}</td>
                    {isStaff && res.status === "PENDING" && (
                      <td>
                        <div className="table-actions">
                          <Button size="sm" onClick={() => updateStatus(res.id, "APPROVED")}><Check size={14} /> Approve</Button>
                          <Button size="sm" variant="ghost" onClick={() => updateStatus(res.id, "REJECTED")}><X size={14} /> Reject</Button>
                        </div>
                      </td>
                    )}
                    {isStaff && res.status !== "PENDING" && <td>-</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Submit Resignation">
        <form onSubmit={submitResignation} className="form-grid">
          <Input label="Notice Period" value={form.notice_period} onChange={(e) => setForm({ ...form, notice_period: e.target.value })} placeholder="e.g., 30 days" required />
          <Textarea label="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={4} required />
          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Submit</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
