import { useEffect, useState } from "react";
import { Plus, CheckCircle2, Circle } from "lucide-react";
import { endpoints } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Badge, Button, Card, EmptyState, Input, Modal, Select, Textarea } from "../components/UI";
import type { Employee, InternalTask } from "../types";

export function InternalTasksPage() {
  const { user } = useAuth();
  const { pushToast } = useToast();
  const isStaff = user?.role === "HR" || user?.role === "ADMIN";
  const [tasks, setTasks] = useState<InternalTask[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ assigned_to_id: "", title: "", description: "", due_date: "" });

  const load = async () => {
    setLoading(true);
    try {
      const [taskList] = await Promise.all([endpoints.internalTasks()]);
      setTasks(taskList);
      if (isStaff) {
        const emps = await endpoints.employees();
        setEmployees(emps);
      }
    } catch (err: any) {
      pushToast(err.message || "Failed to load tasks", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const assignTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await endpoints.assignTask({
        assigned_to_id: Number(form.assigned_to_id),
        title: form.title,
        description: form.description,
        due_date: form.due_date,
      });
      pushToast("Task assigned", "success");
      setOpen(false);
      setForm({ assigned_to_id: "", title: "", description: "", due_date: "" });
      load();
    } catch (err: any) {
      pushToast(err.message, "error");
    }
  };

  const toggleStatus = async (task: InternalTask) => {
    try {
      const newStatus = task.status === "COMPLETED" ? "PENDING" : "COMPLETED";
      await endpoints.updateTaskStatus(task.id, newStatus);
      pushToast("Task updated", "success");
      load();
    } catch (err: any) {
      pushToast(err.message, "error");
    }
  };

  return (
    <div className="page-grid">
      <Card
        title="Task Assignment & Tracking"
        subtitle={isStaff ? "Assign tasks to team members" : "Your assigned tasks"}
        action={
          isStaff && (
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} /> Assign Task
            </Button>
          )
        }
      >
        {loading ? (
          <EmptyState title="Loading..." description="" />
        ) : tasks.length === 0 ? (
          <EmptyState title="No tasks" description={isStaff ? "Assign tasks to get started" : "No tasks assigned to you"} />
        ) : (
          <div className="task-list">
            {tasks.map((task) => (
              <div key={task.id} className="task-card">
                <div className="task-card-header">
                  <button onClick={() => toggleStatus(task)} className="task-toggle">
                    {task.status === "COMPLETED" ? <CheckCircle2 size={22} className="text-success" /> : <Circle size={22} />}
                  </button>
                  <div className="task-info">
                    <strong className={task.status === "COMPLETED" ? "completed" : ""}>{task.title}</strong>
                    {isStaff && task.assigned_to_name && <span>Assigned to: {task.assigned_to_name}</span>}
                    {!isStaff && task.assigned_by_name && <span>Assigned by: {task.assigned_by_name}</span>}
                  </div>
                  <Badge status={task.status} />
                </div>
                <p className="task-desc">{task.description}</p>
                <div className="task-meta">Due: {task.due_date}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Assign Task">
        <form onSubmit={assignTask} className="form-grid">
          <Select label="Assign To" value={form.assigned_to_id} onChange={(e) => setForm({ ...form, assigned_to_id: e.target.value })} required>
            <option value="">Select employee</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.full_name} - {emp.department}</option>
            ))}
          </Select>
          <Input label="Task Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} required />
          <Input label="Due Date" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} required />
          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Assign</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
