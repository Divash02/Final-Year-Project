import React, { useCallback, useEffect, useRef, useState } from "react";
import { ForcePasswordChangeModal } from "../auth/ForcePasswordChangeModal";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { apiRequest, resolveAssetUrl } from "../../services/apiClient";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUser,
  faShieldHalved,
  faPen,
  faFloppyDisk,
  faXmark,
  faCamera,
  faUpload,
  faTrash,
  faCircleCheck,
  faIdCard,
  faBuildingColumns,
  faGraduationCap,
  faEnvelope,
  faTriangleExclamation,
  faSpinner,
  faBell,
  faFolder,
  faKey,
  faLaptop,
  faMapMarkerAlt,
  faPhone,
} from "@fortawesome/free-solid-svg-icons";
import { ROLE_LABELS } from "../common/Navbar";
import { Alert } from "../ui/Alert";
import { PageHeader } from "../ui/PageHeader";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface ProfileRecord {
  id: string;
  name: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  personal_email: string | null;
  address: string | null;
  emergency_contact: string | null;
  avatar_url: string | null;
  account_status: string;
  roles: string[];
  student_id: string | null;
  program: string | null;
  student_department: string | null;
  batch: string | null;
  section: string | null;
  semester: number | null;
  employee_id: string | null;
  employee_department: string | null;
  designation: string | null;
}

interface PhotoCheck {
  ok: boolean;
  error?: string;
  width: number;
  height: number;
}

interface NotificationPreferences {
  email: boolean;
  sms: boolean;
  push: boolean;
}

interface AccountSession {
  id: string;
  deviceType: string;
  deviceName: string;
  browser: string;
  operatingSystem: string;
  ipAddress: string;
  location: string | null;
  createdAt: string;
  lastActiveAt: string;
  isCurrent: boolean;
  status: "Active" | "Expired" | "Revoked";
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;
const MIN_EDGE = 120;
const MIN_ASPECT = 0.6;
const MAX_ASPECT = 1.6;
const NOTIFICATION_OPTIONS = [
  { key: "email", title: "Email Notifications", description: "Receive updates via email" },
  { key: "sms", title: "SMS Notifications", description: "Receive updates via SMS" },
  { key: "push", title: "Push Notifications", description: "Receive in-app notifications" },
] as const;

function formatSessionDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatLastActive(value: string): string {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "Last active: unavailable";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 2) return "Last active: Active now";
  if (minutes < 60) return `Last active: ${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last active: ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `Last active: ${days} ${days === 1 ? "day" : "days"} ago`;
}

function isNotificationPreferences(value: unknown): value is NotificationPreferences {
  if (typeof value !== "object" || value === null) return false;
  const preferences = value as Record<string, unknown>;
  return ["email", "sms", "push"].every((key) => typeof preferences[key] === "boolean");
}

/**
 * Advisory pre-flight check run in the browser before the file is sent.
 */
function inspectPhotoLocally(file: File): Promise<PhotoCheck> {
  return new Promise((resolve) => {
    const fail = (error: string) => resolve({ ok: false, error, width: 0, height: 0 });

    if (!ACCEPTED_TYPES.includes(file.type)) {
      fail("Choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      fail("That image is larger than 5MB.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      URL.revokeObjectURL(objectUrl);

      if (!width || !height) {
        fail("That image could not be read.");
        return;
      }
      const aspect = width / height;
      if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) {
        fail("Crop the photo to a portrait or square orientation.");
        return;
      }
      if (width < MIN_EDGE || height < MIN_EDGE) {
        fail(`Use an image of at least ${MIN_EDGE}x${MIN_EDGE} pixels.`);
        return;
      }

      resolve({ ok: true, width, height });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      fail("That file is not a readable image.");
    };
    image.src = objectUrl;
  });
}

function Avatar({
  profile,
  previewUrl,
  size = "lg",
}: {
  profile: ProfileRecord | null;
  previewUrl: string | null;
  size?: "lg" | "sm";
}) {
  const source = resolveAssetUrl(previewUrl || profile?.avatar_url || null);
  const initials = (profile?.name || "U")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const frame =
    size === "lg"
      ? "h-28 w-28 text-3xl sm:h-32 sm:w-32"
      : "h-10 w-10 text-sm";

  return (
    <div
      className={`cos-avatar-ring relative flex ${frame} shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[var(--color-primary-soft)] font-bold text-[var(--color-primary-strong)] shadow-md`}
    >
      {source ? (
        <img
          src={source}
          alt={profile?.name ? `${profile.name} profile photo` : "Profile photo"}
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initials || "U"}</span>
      )}
    </div>
  );
}

export const AccountProfileView: React.FC = () => {
  const { currentUser, currentRole } = useCollegeOS();
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [draft, setDraft] = useState({
    phone: "",
    personalEmail: "",
    address: "",
    emergencyContact: "",
  });
  const [editing, setEditing] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState<'profile'|'security'|'notifications'|'documents'>('profile');
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences | null>(null);
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifSaving, setNotifSaving] = useState<keyof NotificationPreferences | null>(null);
  const [notifError, setNotifError] = useState("");
  const [notifNotice, setNotifNotice] = useState("");
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [sessionsNotice, setSessionsNotice] = useState("");
  const [sessionActionId, setSessionActionId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);

  useEffect(() => {
    let active = true;
    setNotifLoading(true);
    apiRequest<NotificationPreferences>("/profile/notifications")
      .then((preferences) => {
        if (!isNotificationPreferences(preferences)) {
          throw new Error("The server returned invalid notification preferences.");
        }
        if (active) setNotifPrefs(preferences);
      })
      .catch((err) => {
        if (active) {
          setNotifError(err instanceof Error ? err.message : "Failed to load notification preferences.");
        }
      })
      .finally(() => {
        if (active) setNotifLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const updateNotification = async (key: keyof NotificationPreferences) => {
    if (!notifPrefs || notifSaving) return;
    const previous = notifPrefs;
    const nextValue = !previous[key];
    setNotifPrefs({ ...previous, [key]: nextValue });
    setNotifSaving(key);
    setNotifError("");
    setNotifNotice("Saving notification preferences...");
    try {
      const saved = await apiRequest<NotificationPreferences>("/profile/notifications", {
        method: "PUT",
        body: JSON.stringify({ [key]: nextValue }),
      });
      if (!isNotificationPreferences(saved)) {
        throw new Error("The server returned invalid notification preferences.");
      }
      setNotifPrefs(saved);
      setNotifNotice("Notification preferences saved.");
    } catch (err) {
      setNotifPrefs(previous);
      setNotifNotice("");
      setNotifError(err instanceof Error ? err.message : "Failed to save notification preferences.");
    } finally {
      setNotifSaving(null);
    }
  };

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError("");
    try {
      const response = await apiRequest<{ sessions: AccountSession[] }>("/auth/sessions");
      setSessions(response.sessions);
      return true;
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : "Failed to load signed-in sessions.");
      return false;
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "security") void loadSessions();
  }, [activeTab, loadSessions]);

  const revokeDeviceSession = async (session: AccountSession) => {
    if (
      session.isCurrent ||
      session.status !== "Active" ||
      !window.confirm(`Sign out ${session.deviceName} (${session.browser})?`)
    ) {
      return;
    }
    setSessionActionId(session.id);
    setSessionsError("");
    setSessionsNotice("");
    try {
      await apiRequest(`/auth/sessions/${session.id}`, { method: "DELETE" });
      if (await loadSessions()) setSessionsNotice("That device has been signed out.");
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : "Failed to revoke this session.");
    } finally {
      setSessionActionId(null);
    }
  };

  const revokeOtherSessions = async () => {
    if (!window.confirm("Sign out all other devices? This will end their active sessions.")) return;
    setRevokingOthers(true);
    setSessionsError("");
    setSessionsNotice("");
    try {
      const response = await apiRequest<{ revokedCount: number }>("/auth/sessions/revoke-others", {
        method: "POST",
      });
      if (await loadSessions()) {
        setSessionsNotice(
          response.revokedCount === 0
            ? "There were no other active sessions to sign out."
            : `${response.revokedCount} other device${response.revokedCount === 1 ? "" : "s"} signed out.`,
        );
      }
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : "Failed to sign out other devices.");
    } finally {
      setRevokingOthers(false);
    }
  };

  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [photoHint, setPhotoHint] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<{ profile: ProfileRecord }>("/profile/me");
      setProfile(data.profile);
      setDraft({
        phone: data.profile.phone || "",
        personalEmail: data.profile.personal_email || "",
        address: data.profile.address || "",
        emergencyContact: data.profile.emergency_contact || "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  const startEdit = () => {
    if (!profile) return;
    setDraft({
      phone: profile.phone || "",
      personalEmail: profile.personal_email || "",
      address: profile.address || "",
      emergencyContact: profile.emergency_contact || "",
    });
    setEditing(true);
    setSuccess("");
    setError("");
  };

  const cancelEdit = () => {
    if (!profile) return;
    setDraft({
      phone: profile.phone || "",
      personalEmail: profile.personal_email || "",
      address: profile.address || "",
      emergencyContact: profile.emergency_contact || "",
    });
    setEditing(false);
    setSuccess("");
    setError("");
  };

  const saveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await apiRequest<{ profile: ProfileRecord }>("/profile/me", {
        method: "PUT",
        body: JSON.stringify({
          phone: draft.phone.trim() || null,
          personal_email: draft.personalEmail.trim() || null,
          address: draft.address.trim() || null,
          emergency_contact: draft.emergencyContact.trim() || null,
        }),
      });
      setProfile(updated.profile);
      setEditing(false);
      setSuccess("Profile updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setPhotoHint("");
    setError("");
    setSuccess("");

    const check = await inspectPhotoLocally(file);
    if (!check.ok) {
      setPhotoHint(check.error || "Invalid photo.");
      setPendingPhoto(null);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setPhotoPreview(null);
      return;
    }

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    const previewUrl = URL.createObjectURL(file);
    previewUrlRef.current = previewUrl;
    setPhotoPreview(previewUrl);
    setPendingPhoto(file);
    setPhotoHint(`Ready to upload (${check.width}Ã—${check.height}px).`);
  };

  const uploadPhoto = async () => {
    if (!pendingPhoto) return;
    setPhotoBusy(true);
    setError("");
    setSuccess("");
    setPhotoHint("");
    try {
      const formData = new FormData();
      formData.append("avatar", pendingPhoto);
      await apiRequest<{ avatarUrl: string }>("/profile/avatar", {
        method: "POST",
        body: formData,
      });
      await loadProfile();
      setPendingPhoto(null);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setPhotoPreview(null);
      setSuccess("Profile photo updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload photo");
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    setError("");
    setSuccess("");
    setPhotoHint("");
    try {
      await apiRequest("/profile/avatar", { method: "DELETE" });
      await loadProfile();
      setPendingPhoto(null);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setPhotoPreview(null);
      setSuccess("Profile photo removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove photo");
    } finally {
      setPhotoBusy(false);
    }
  };

  const cancelPhoto = () => {
    setPendingPhoto(null);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPhotoPreview(null);
    setPhotoHint("");
  };

  const roleLabel = currentRole ? ROLE_LABELS[currentRole] || currentRole : "User";
  const displayName = profile?.name || currentUser?.name || "User";
  const email = profile?.email || currentUser?.email || "";

  if (loading) {
    return (
      <div className="cos-page">
        <div className="flex h-64 items-center justify-center">
          <FontAwesomeIcon icon={faSpinner} className="animate-spin text-2xl text-[var(--color-primary)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="cos-page">
      <PageHeader 
        title="Account & Personal Settings" 
        description="Manage your profile, security settings, notifications and documents"
        icon={faUser}
      />

      <div className="mb-6 flex flex-wrap gap-2 border-b">
        <button onClick={()=>setActiveTab('profile')} className={`px-3 py-2 text-sm sm:px-4 ${activeTab==='profile'?'border-b-2 border-primary-600 font-medium':'text-slate-600'}`}><FontAwesomeIcon icon={faUser} className='mr-2'/>Profile</button>
        <button onClick={()=>setActiveTab('security')} className={`px-3 py-2 text-sm sm:px-4 ${activeTab==='security'?'border-b-2 border-primary-600 font-medium':'text-slate-600'}`}><FontAwesomeIcon icon={faShieldHalved} className='mr-2'/>Security & Sessions</button>
        <button onClick={()=>setActiveTab('notifications')} className={`px-3 py-2 text-sm sm:px-4 ${activeTab==='notifications'?'border-b-2 border-primary-600 font-medium':'text-slate-600'}`}><FontAwesomeIcon icon={faBell} className='mr-2'/>Notifications</button>
        <button onClick={()=>setActiveTab('documents')} className={`px-3 py-2 text-sm sm:px-4 ${activeTab==='documents'?'border-b-2 border-primary-600 font-medium':'text-slate-600'}`}><FontAwesomeIcon icon={faFolder} className='mr-2'/>My Documents</button>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <div className="flex flex-col items-center p-6 text-center">
              <div className="relative">
                <Avatar profile={profile} previewUrl={photoPreview} size="lg" />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-2 -right-2 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-lg transition hover:brightness-110"
                  aria-label="Change profile photo"
                >
                  <FontAwesomeIcon icon={faCamera} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_TYPES.join(",")}
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-slate-900">{displayName}</h2>
              <p className="mt-1 text-sm text-slate-600">{roleLabel}</p>
              <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                <FontAwesomeIcon icon={faEnvelope} />
                {email}
              </p>
              {profile?.account_status && (
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  <FontAwesomeIcon icon={faCircleCheck} />
                  {profile.account_status}
                </span>
              )}

              {photoHint && !pendingPhoto && (
                <p className="mt-3 text-xs text-red-600">{photoHint}</p>
              )}

              {pendingPhoto && (
                <div className="mt-4 w-full space-y-2">
                  <p className="text-xs text-slate-600">{photoHint}</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={uploadPhoto} disabled={photoBusy} className="flex-1">
                      <FontAwesomeIcon icon={photoBusy ? faSpinner : faUpload} className={photoBusy ? "mr-2 animate-spin" : "mr-2"} />
                      Upload
                    </Button>
                    <Button size="sm" variant="secondary" onClick={cancelPhoto} disabled={photoBusy} className="flex-1">
                      <FontAwesomeIcon icon={faXmark} className="mr-2" />
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              {profile?.avatar_url && !pendingPhoto && (
                <Button size="sm" variant="ghost" onClick={removePhoto} disabled={photoBusy} className="mt-3">
                  <FontAwesomeIcon icon={faTrash} className="mr-2" />
                  Remove Photo
                </Button>
              )}
            </div>
          </Card>

          <div className="lg:col-span-2 space-y-6">
            <Card title="Personal Information" icon={faIdCard} headerAction={!editing ? <Button size="sm" variant="secondary" onClick={startEdit}><FontAwesomeIcon icon={faPen} className="mr-2"/>Edit</Button> : <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={cancelEdit}><FontAwesomeIcon icon={faXmark} className="mr-2"/>Cancel</Button><Button size="sm" onClick={saveProfile} disabled={saving}><FontAwesomeIcon icon={saving ? faSpinner : faFloppyDisk} className={saving ? "mr-2 animate-spin" : "mr-2"}/>{saving?'Saving...':'Save'}</Button></div>}>
              <div className="p-6">
                {!editing ? (
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Full Name</p><p className="mt-1 text-sm text-slate-900">{displayName}</p></div>
                    <div><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Email</p><p className="mt-1 text-sm text-slate-900">{email}</p></div>
                    <div><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Phone Number</p><p className="mt-1 text-sm text-slate-900">{profile?.phone || '-'}</p></div>
                    <div><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Personal Email</p><p className="mt-1 text-sm text-slate-900">{profile?.personal_email || '-'}</p></div>
                    <div className="md:col-span-2"><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Address</p><p className="mt-1 text-sm text-slate-900">{profile?.address || '-'}</p></div>
                    <div className="md:col-span-2"><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Emergency Contact</p><p className="mt-1 text-sm text-slate-900">{profile?.emergency_contact || '-'}</p></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Input label="Phone Number" value={draft.phone} onChange={(e:any)=>setDraft({...draft,phone:e.target.value})} leftIcon={faPhone} />
                    <Input label="Personal Email" type="email" value={draft.personalEmail} onChange={(e:any)=>setDraft({...draft,personalEmail:e.target.value})} leftIcon={faEnvelope} />
                    <div className="md:col-span-2"><label className="text-sm font-medium">Address</label><textarea className="w-full mt-1 px-3 py-2 border rounded-lg" rows={3} value={draft.address} onChange={(e)=>setDraft({...draft,address:e.target.value})} placeholder="Enter your address" /></div>
                    <div className="md:col-span-2"><label className="text-sm font-medium">Emergency Contact</label><textarea className="w-full mt-1 px-3 py-2 border rounded-lg" rows={2} value={draft.emergencyContact} onChange={(e)=>setDraft({...draft,emergencyContact:e.target.value})} placeholder="Name and phone number" /></div>
                  </div>
                )}
              </div>
            </Card>

            {(profile?.student_id || profile?.employee_id) && (
              <Card title="Institutional Information" icon={faBuildingColumns}>
                <div className="p-6">
                  {profile?.student_id && (
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Student ID</p><p className="mt-1 text-sm text-slate-900">{profile.student_id}</p></div>
                      <div><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Program</p><p className="mt-1 text-sm text-slate-900">{profile.program || '-'}</p></div>
                      <div><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Department</p><p className="mt-1 text-sm text-slate-900">{profile.student_department || '-'}</p></div>
                      <div><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Batch/Section</p><p className="mt-1 text-sm text-slate-900">{profile.batch || '-'} {profile.section ? `/ ${profile.section}` : ''}</p></div>
                      {profile.semester && <div><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Semester</p><p className="mt-1 text-sm text-slate-900">{profile.semester}</p></div>}
                    </div>
                  )}
                  {profile?.employee_id && (
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Employee ID</p><p className="mt-1 text-sm text-slate-900">{profile.employee_id}</p></div>
                      <div><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Department</p><p className="mt-1 text-sm text-slate-900">{profile.employee_department || '-'}</p></div>
                      <div><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Designation</p><p className="mt-1 text-sm text-slate-900">{profile.designation || '-'}</p></div>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {activeTab === 'security' && (
        <Card title="Security & Sessions" icon={faShieldHalved}>
          <div className="p-6 space-y-4">
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-2">Password</h3>
              <p className="text-sm text-slate-600 mb-3">Change your account password</p>
              <Button variant='secondary' onClick={() => setShowChangePassword(true)}>Change Password</Button>
              {showChangePassword && (
                <ForcePasswordChangeModal
                  isOpen={showChangePassword}
                  onClose={() => setShowChangePassword(false)}
                  title="Change Password"
                  subtitle="Update your account password"
                  mandatory={false}
                />
              )}
            </div>
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-2">Active Sessions</h3>
              <p className="mb-4 text-sm text-slate-600">Review devices signed in to your account and end sessions you no longer use.</p>
              {sessionsNotice && (
                <p role="status" className="mb-3 text-sm text-emerald-700">{sessionsNotice}</p>
              )}
              {sessionsError && (
                <p role="alert" className="mb-3 text-sm text-red-700">{sessionsError}</p>
              )}
              {sessionsLoading ? (
                <p className="flex items-center gap-2 py-4 text-sm text-slate-600">
                  <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                  Loading signed-in devices...
                </p>
              ) : (
                <>
                  <div className="space-y-3">
                    {sessions.map((session) => (
                      <div
                        key={session.id}
                        className="flex min-w-0 flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="flex min-w-0 gap-3">
                          <FontAwesomeIcon
                            icon={session.deviceType === "Computer" ? faLaptop : faPhone}
                            className="mt-1 shrink-0 text-slate-500"
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="break-words font-medium text-slate-900">
                                {session.deviceName} · {session.browser}
                              </p>
                              {session.isCurrent && (
                                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                  Current session
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-sm text-slate-600">{session.operatingSystem}</p>
                            <p className="mt-2 flex items-start gap-1.5 break-words text-sm text-slate-600">
                              <FontAwesomeIcon icon={faMapMarkerAlt} className="mt-1 shrink-0 text-slate-400" />
                              {session.location || "Location unavailable"}
                            </p>
                            <p className="mt-1 break-words text-xs text-slate-500">
                              IP address: {session.ipAddress || "Unavailable"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              Signed in: {formatSessionDate(session.createdAt)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {formatLastActive(session.lastActiveAt)}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            session.status === "Active"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}>
                            {session.status.toUpperCase()}
                          </span>
                          {!session.isCurrent && session.status === "Active" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={sessionActionId !== null || revokingOthers}
                              onClick={() => void revokeDeviceSession(session)}
                            >
                              {sessionActionId === session.id ? "Signing out..." : "Sign out"}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {sessions.length === 0 && (
                    <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                      No signed-in sessions are available for this account.
                    </p>
                  )}
                  {sessions.length > 0 && !sessions.some(
                    (session) => !session.isCurrent && session.status === "Active",
                  ) && (
                    <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                      No other active devices are signed in.
                    </p>
                  )}
                  {sessions.some(
                    (session) => !session.isCurrent && session.status === "Active",
                  ) && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-4"
                      disabled={sessionActionId !== null || revokingOthers}
                      onClick={() => void revokeOtherSessions()}
                    >
                      {revokingOthers ? "Signing out devices..." : "Sign out all other devices"}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'notifications' && (
        <Card title="Notification Preferences" icon={faBell}>
          <div className="space-y-3 p-4 sm:p-6">
            {notifNotice && (
              <p role="status" className="text-sm text-emerald-700">{notifNotice}</p>
            )}
            {notifError && (
              <p role="alert" className="text-sm text-red-700">{notifError}</p>
            )}
            {notifLoading ? (
              <p className="flex items-center gap-2 py-4 text-sm text-slate-600">
                <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                Loading saved preferences...
              </p>
            ) : notifPrefs ? NOTIFICATION_OPTIONS.map((option) => {
              const checked = notifPrefs[option.key];
              const saving = notifSaving === option.key;
              return (
                <div
                  key={option.key}
                  className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{option.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{option.description}</p>
                    <p className={`mt-2 text-xs font-bold uppercase tracking-wider ${
                      checked ? "text-[#1F6B45]" : "text-slate-500"
                    }`}>
                      {checked ? "ENABLED" : "DISABLED"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 self-start sm:self-auto">
                    <button
                      type="button"
                      role="switch"
                      aria-label={option.title}
                      aria-checked={checked}
                      aria-busy={saving}
                      disabled={notifSaving !== null}
                      onClick={() => void updateNotification(option.key)}
                      className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F6B45] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 ${
                        checked ? "bg-[#1F6B45]" : "bg-slate-400"
                      }`}
                    >
                      <span
                        className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                          checked ? "translate-x-6" : "translate-x-0"
                        }`}
                      />
                    </button>
                    {saving && (
                      <span className="flex items-center gap-1.5 text-xs text-slate-600">
                        <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                        Saving
                      </span>
                    )}
                  </div>
                </div>
              );
            }) : (
              <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                Saved notification preferences could not be loaded.
              </p>
            )}
          </div>
        </Card>
      )}

      {activeTab === 'documents' && (
        <Card title="My Documents" icon={faFolder}>
          <div className="p-6 text-center text-slate-500">
            <FontAwesomeIcon icon={faFolder} className="text-4xl mb-3 text-slate-400"/>
            <p>No documents uploaded yet</p>
            <Button variant='secondary' className="mt-3">Upload Document</Button>
          </div>
        </Card>
      )}
    </div>
  );
};

export default AccountProfileView;


interface ProfileRecord {
  id: string;
  name: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  personal_email: string | null;
  address: string | null;
  emergency_contact: string | null;
  avatar_url: string | null;
  account_status: string;
  roles: string[];
  student_id: string | null;
  program: string | null;
  student_department: string | null;
  batch: string | null;
  section: string | null;
  semester: number | null;
  employee_id: string | null;
  employee_department: string | null;
  designation: string | null;
}
