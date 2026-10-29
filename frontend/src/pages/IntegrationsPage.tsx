import { useState } from "react";
import { Mail, Calendar, Download, FileText } from "lucide-react";
import { endpoints } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { Button, Card, Input, Select } from "../components/UI";

export function IntegrationsPage() {
  const { pushToast } = useToast();
  const [emailForm, setEmailForm] = useState({ to_email: "", subject: "", message: "" });
  const [calendarForm, setCalendarForm] = useState({ provider: "google", calendar_id: "", sync_enabled: true });
  const [exportForm, setExportForm] = useState({ format: "csv", report_type: "employees" });

  const sendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await endpoints.sendEmail(emailForm);
      pushToast(res.detail, "success");
      setEmailForm({ to_email: "", subject: "", message: "" });
    } catch (err: any) {
      pushToast(err.message, "error");
    }
  };

  const syncCalendar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await endpoints.calendarSync(calendarForm);
      pushToast(res.message, "success");
    } catch (err: any) {
      pushToast(err.message, "error");
    }
  };

  const exportReport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // For CSV/PDF download, use direct fetch approach
      const token = localStorage.getItem("worksphere.auth");
      let authToken = null;
      if (token) {
        try {
          const parsed = JSON.parse(token);
          authToken = parsed.token;
        } catch {}
      }
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/integrations/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(exportForm),
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report_${exportForm.report_type}.${exportForm.format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      pushToast("Report exported successfully", "success");
    } catch (err: any) {
      pushToast(err.message, "error");
    }
  };

  return (
    <div className="page-grid integrations-grid">
      <Card title="Email Notifications" subtitle="Send email notifications">
        <form onSubmit={sendEmail} className="form-grid">
          <Input label="To Email" type="email" value={emailForm.to_email} onChange={(e) => setEmailForm({ ...emailForm, to_email: e.target.value })} required />
          <Input label="Subject" value={emailForm.subject} onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })} required />
          <Input label="Message" value={emailForm.message} onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })} required />
          <Button type="submit"><Mail size={16} /> Send Email</Button>
        </form>
      </Card>

      <Card title="Calendar Integration" subtitle="Sync with external calendars">
        <form onSubmit={syncCalendar} className="form-grid">
          <Select label="Provider" value={calendarForm.provider} onChange={(e) => setCalendarForm({ ...calendarForm, provider: e.target.value })}>
            <option value="google">Google Calendar</option>
            <option value="outlook">Microsoft Outlook</option>
            <option value="ical">iCal</option>
          </Select>
          <Input label="Calendar ID (optional)" value={calendarForm.calendar_id} onChange={(e) => setCalendarForm({ ...calendarForm, calendar_id: e.target.value })} />
          <Button type="submit"><Calendar size={16} /> Configure Sync</Button>
        </form>
      </Card>

      <Card title="Report Exports" subtitle="Export data in CSV or PDF format">
        <form onSubmit={exportReport} className="form-grid">
          <Select label="Format" value={exportForm.format} onChange={(e) => setExportForm({ ...exportForm, format: e.target.value })}>
            <option value="csv">CSV</option>
            <option value="pdf">PDF</option>
          </Select>
          <Select label="Report Type" value={exportForm.report_type} onChange={(e) => setExportForm({ ...exportForm, report_type: e.target.value })}>
            <option value="employees">Employees</option>
            <option value="payroll">Payroll</option>
          </Select>
          <Button type="submit"><Download size={16} /> Export Report</Button>
        </form>
      </Card>
    </div>
  );
}
