import { useEffect, useState } from "react";
import { User, Lock, Bell } from "lucide-react";
import { endpoints } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Button, Card, Input } from "../components/UI";
import type { ProfileInfo, NotificationPreferences } from "../types";

export function ProfileSettingsPage() {
  const { user } = useAuth();
  const { pushToast } = useToast();
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [profileForm, setProfileForm] = useState({ full_name: "", designation: "", department: "" });
  const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "" });
  const [prefs, setPrefs] = useState<NotificationPreferences>({ user_id: 0, email_notifications: true, sms_notifications: false, push_notifications: true });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [prof, pref] = await Promise.all([endpoints.profileMe(), endpoints.getPreferences()]);
      setProfile(prof);
      if (prof.employee) {
        setProfileForm({ full_name: prof.employee.full_name, designation: prof.employee.designation, department: prof.employee.department });
      }
      setPrefs(pref);
    } catch (err: any) {
      pushToast(err.message || "Failed to load settings", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await endpoints.updateProfileMe(profileForm);
      pushToast("Profile updated", "success");
      load();
    } catch (err: any) {
      pushToast(err.message, "error");
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await endpoints.changePassword(passwordForm);
      pushToast(res.detail, "success");
      setPasswordForm({ current_password: "", new_password: "" });
    } catch (err: any) {
      pushToast(err.message, "error");
    }
  };

  const updatePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await endpoints.updatePreferences(prefs);
      pushToast("Preferences updated", "success");
      setPrefs(res);
    } catch (err: any) {
      pushToast(err.message, "error");
    }
  };

  return (
    <div className="page-grid settings-grid">
      <Card title="Personal Profile" subtitle="Update your profile details">
        <form onSubmit={updateProfile} className="form-grid">
          <Input label="Full Name" value={profileForm.full_name} onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })} required />
          <Input label="Designation" value={profileForm.designation} onChange={(e) => setProfileForm({ ...profileForm, designation: e.target.value })} required />
          <Input label="Department" value={profileForm.department} onChange={(e) => setProfileForm({ ...profileForm, department: e.target.value })} required />
          <Button type="submit"><User size={16} /> Update Profile</Button>
        </form>
      </Card>

      <Card title="Change Password" subtitle="Update your account password securely">
        <form onSubmit={changePassword} className="form-grid">
          <Input label="Current Password" type="password" value={passwordForm.current_password} onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })} required />
          <Input label="New Password" type="password" value={passwordForm.new_password} onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })} required />
          <Button type="submit"><Lock size={16} /> Change Password</Button>
        </form>
      </Card>

      <Card title="Notification Preferences" subtitle="Manage how you receive notifications">
        <form onSubmit={updatePreferences} className="form-grid">
          <label className="checkbox-field">
            <input type="checkbox" checked={prefs.email_notifications} onChange={(e) => setPrefs({ ...prefs, email_notifications: e.target.checked })} />
            Email Notifications
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={prefs.sms_notifications} onChange={(e) => setPrefs({ ...prefs, sms_notifications: e.target.checked })} />
            SMS Notifications
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={prefs.push_notifications} onChange={(e) => setPrefs({ ...prefs, push_notifications: e.target.checked })} />
            Push Notifications
          </label>
          <Button type="submit"><Bell size={16} /> Save Preferences</Button>
        </form>
      </Card>
    </div>
  );
}
