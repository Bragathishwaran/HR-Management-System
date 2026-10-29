import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";
import { endpoints } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Badge, Button, Card, EmptyState, Input, Modal, Select } from "../components/UI";
import type { Employee, OnboardingTask } from "../types";

export function OnboardingPage() {
  const { user } = useAuth();
  const { pushToast } = useToast();
  const isStaff = user?.role === "HR" || user?.role === "ADMIN";
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [progress, setProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: "", task_name: "", due_date: "" });

  const load = async () => {
    setLoading(true);
    try {
      const [taskList, prog] = await Promise.all([
        endpoints.onboardingTasks(),
        !isStaff ? endpoints.onboardingProgress().catch(() => null) : Promise.resolve(null),
      ]);
      setTasks(taskList);
      if (prog) setProgress(prog);
      if (isStaff) {
        const emps = await endpoints.employees();
        setEmployees(emps);
      }
    } catch (err: any) {
      pushToast(err.message || "Failed to load onboarding tasks", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await endpoints.createOnboardingTask({
        employee_id: Number(form.employee_id),
        task_name: form.task_name,
        due_date: form.due_date,
        status: "PENDING",
      });
      pushToast("Onboarding task created", "success");
      setOpen(false);
      setForm({ employee_id: "", task_name: "", due_date: "" });
      load();
    } catch (err: any) {
      pushToast(err.message, "error");
    }
  };

  const toggleStatus = async (task: OnboardingTask) => {
    try {
      const newStatus = task.status === "COMPLETED" ? "PENDING" : "COMPLETED";
      await endpoints.updateOnboardingTask(task.id, { status: newStatus });
      pushToast("Task updated", "success");
      load();
    } catch (err: any) {
      pushToast(err.message, "error");
    }
  };

  const removeTask = async (id: number) => {
    if (!confirm("Delete this onboarding task?")) return;
    try {
      await endpoints.deleteOnboardingTask(id);
      pushToast("Task deleted", "success");
      load();
    } catch (err: any) {
      pushToast(err.message, "error");
    }
  };

  return (
    <div className="page-grid">
      <Card
        title="Employee Onboarding"
        subtitle={isStaff ? "Assign and track onboarding tasks" : "Your onboarding checklist"}
        action={
          isStaff && (
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} /> Add Task
            </Button>
          )
        }
      >
        {!isStaff && progress && (
          <div className="onboarding-progress">
            <div className="progress-header">
              <span>Progress</span>
              <strong>{progress.progress_percent}%</strong>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress.progress_percent}%` }} />
            </div>
            <div className="progress-stats">
              <span>{progress.completed} completed</span> · <span>{progress.pending} pending</span> · <span>{progress.total} total</span>
            </div>
          </div>
        )}
        {loading ? (
          <EmptyState title="Loading..." description="" />
        ) : tasks.length === 0 ? (
          <EmptyState title="No onboarding tasks" description={isStaff ? "Add tasks to get started" : "No tasks assigned yet"} />
        ) : (
          <div className="task-list">
            {tasks.map((task) => (
              <div key={task.id} className="task-item">
                <button onClick={() => toggleStatus(task)} className="task-toggle">
                  {task.status === "COMPLETED" ? <CheckCircle2 size={22} className="text-success" /> : <Circle size={22} />}
                </button>
                <div className="task-info">
                  <strong className={task.status === "COMPLETED" ? "completed" : ""}>{task.task_name}</strong>
                  {isStaff && task.employee_name && <span>Assigned to: {task.employee_name}</span>}
                  <span>Due: {task.due_date}</span>
                </div>
                <Badge status={task.status} />
                {isStaff && (
                  <button onClick={() => removeTask(task.id)} className="icon-btn danger">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Assign Onboarding Task">
        <form onSubmit={createTask} className="form-grid">
          <Select label="Employee" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} required>
            <option value="">Select employee</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.full_name} - {emp.department}</option>
            ))}
          </Select>
          <Input label="Task Name" value={form.task_name} onChange={(e) => setForm({ ...form, task_name: e.target.value })} required />
          <Input label="Due Date" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} required />
          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Create Task</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
