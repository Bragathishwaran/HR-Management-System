import { useEffect, useState } from "react";
import { Plus, Megaphone, Trash2 } from "lucide-react";
import { endpoints } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Button, Card, EmptyState, Input, Modal, Textarea } from "../components/UI";
import type { Announcement } from "../types";

export function AnnouncementsPage() {
  const { user } = useAuth();
  const { pushToast } = useToast();
  const isStaff = user?.role === "HR" || user?.role === "ADMIN";
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", message: "" });
  const [selected, setSelected] = useState<Announcement | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await endpoints.announcements();
      setAnnouncements(data);
    } catch (err: any) {
      pushToast(err.message || "Failed to load announcements", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await endpoints.createAnnouncement(form);
      pushToast("Announcement posted", "success");
      setOpen(false);
      setForm({ title: "", message: "" });
      load();
    } catch (err: any) {
      pushToast(err.message, "error");
    }
  };

  const deleteAnnouncement = async (id: number) => {
    if (!confirm("Delete this announcement?")) return;
    try {
      await endpoints.deleteAnnouncement(id);
      pushToast("Announcement deleted", "success");
      load();
    } catch (err: any) {
      pushToast(err.message, "error");
    }
  };

  return (
    <div className="page-grid">
      <Card
        title="Announcements"
        subtitle="Company-wide updates and notices"
        action={
          isStaff && (
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} /> Post Announcement
            </Button>
          )
        }
      >
        {loading ? (
          <EmptyState title="Loading..." description="" />
        ) : announcements.length === 0 ? (
          <EmptyState title="No announcements" description="Check back later for updates" />
        ) : (
          <div className="announcement-feed">
            {announcements.map((ann) => (
              <div key={ann.id} className="announcement-card" onClick={() => setSelected(ann)}>
                <div className="announcement-header">
                  <div className="announcement-icon"><Megaphone size={18} /></div>
                  <div>
                    <strong>{ann.title}</strong>
                    <span>Posted by {ann.created_by || "Admin"} · {new Date(ann.created_at).toLocaleString()}</span>
                  </div>
                  {isStaff && (
                    <button onClick={(e) => { e.stopPropagation(); deleteAnnouncement(ann.id); }} className="icon-btn danger">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <p className="announcement-preview">{ann.message.length > 150 ? ann.message.substring(0, 150) + "..." : ann.message}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Post Announcement">
        <form onSubmit={createAnnouncement} className="form-grid">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <Textarea label="Message" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={6} required />
          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Post</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.title || ""}>
        {selected && (
          <div className="announcement-detail">
            <div className="announcement-meta">Posted by {selected.created_by || "Admin"} · {new Date(selected.created_at).toLocaleString()}</div>
            <p>{selected.message}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
