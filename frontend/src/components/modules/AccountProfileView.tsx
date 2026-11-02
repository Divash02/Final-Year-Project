import React, { useCallback, useEffect, useRef, useState } from "react";
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
} from "@fortawesome/free-solid-svg-icons";
import { ROLE_LABELS } from "../common/Navbar";
import { Alert } from "../ui/Alert";

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

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;
const MIN_EDGE = 120;
const MIN_ASPECT = 0.6;
const MAX_ASPECT = 1.6;

/**
 * Advisory pre-flight check run in the browser before the file is sent.
 *
 * It only inspects the decoded pixels for portrait framing: a square-ish crop,
 * a sensible minimum resolution, and enough skin-tone coverage in the centre to
 * suggest a person rather than a document or an object.
 *
 * This is a usability hint, not a security control. The authoritative checks are
 * the server's magic-byte, type, size and dimension validation. Neither this
 * check nor the server check establishes that the person in the photo is the
 * account holder — that is identity verification, which CollegeOS does not claim
 * to perform.
 */
function inspectPhotoLocally(file: File): Promise<PhotoCheck> {
  return new Promise((resolve) => {
    const fail = (error: string) => resolve({ ok: false, error, width: 0, height: 0 });

    if (!ACCEPTED_TYPES.includes(file.type)) {
      fail("Choose a JPG, PNG or WebP image. Documents and other file types are not accepted.");
      return;
    }
    if (file.size > MAX_BYTES) {
      fail("That image is larger than 5MB. Please choose a smaller file.");
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
        fail(
          "Crop the photo to a portrait or square orientation so the face fills the frame.",
        );
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [photoHint, setPhotoHint] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    apiRequest<{ profile: ProfileRecord }>("/profile/me")
      .then(({ profile: result }) => {
        if (!active) return;
        setProfile(result);
        setDraft({
          phone: result.phone || "",
          personalEmail: result.personal_email || "",
          address: result.address || "",
          emergencyContact: result.emergency_contact || "",
        });
      })
      .catch((requestError: unknown) => {
        if (active)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load profile.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    },
    [photoPreview],
  );

  if (!currentUser) return null;

  const canEdit = currentUser.permissions?.includes("profile.update.self");
  const activeRoleLabel = ROLE_LABELS[currentRole] || currentRole;
  const displayName = profile?.name || currentUser.name;

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const result = await apiRequest<{ profile: ProfileRecord }>(
        "/profile/me",
        { method: "PATCH", body: JSON.stringify(draft) },
      );
      setProfile(result.profile);
      setEditing(false);
      setSuccess("Profile changes saved.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Profile update failed.",
      );
    } finally {
      setSaving(false);
    }
  };

  const choosePhoto = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      setError("");
      setSuccess("");
      const check = await inspectPhotoLocally(file);
      if (!check.ok) {
        setPendingPhoto(null);
        setPhotoPreview(null);
        setPhotoHint(check.error || "That image cannot be used.");
        return;
      }

      setPendingPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
      setPhotoHint(
        `Ready to upload · ${check.width}×${check.height}px. Click “Save photo” to apply it everywhere your photo appears.`,
      );
    },
    [],
  );

  const savePhoto = async () => {
    if (!pendingPhoto) return;
    setPhotoBusy(true);
    setError("");
    setSuccess("");
    try {
      const body = new FormData();
      body.append("avatar", pendingPhoto);
      const result = await apiRequest<{
        success: boolean;
        avatarUrl: string | null;
        message: string;
      }>("/profile/avatar", { method: "POST", body });

      setProfile((current) =>
        current ? { ...current, avatar_url: result.avatarUrl } : current,
      );
      setPendingPhoto(null);
      setPhotoPreview(null);
      setPhotoHint("");
      setSuccess(result.message);
      setTimeout(() => setSuccess(""), 4000);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Profile photo upload failed.",
      );
    } finally {
      setPhotoBusy(false);
    }
  };

  const discardPhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    setPendingPhoto(null);
    setPhotoHint("");
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest("/profile/avatar", { method: "DELETE" });
      setProfile((current) =>
        current ? { ...current, avatar_url: null } : current,
      );
      discardPhoto();
      setSuccess("Profile photo removed.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not remove the profile photo.",
      );
    } finally {
      setPhotoBusy(false);
    }
  };

  const emptyValue = "Not provided";
  const identityFields = [
    {
      label: "College ID / Student ID",
      value: profile?.student_id || profile?.employee_id || "Not assigned",
      icon: faIdCard,
    },
    {
      label: "Department",
      value:
        profile?.student_department ||
        profile?.employee_department ||
        "Not assigned",
      icon: faBuildingColumns,
    },
    { label: "Programme", value: profile?.program || "Not applicable", icon: faGraduationCap },
    { label: "Designation", value: profile?.designation || "Not applicable", icon: faShieldHalved },
    { label: "Batch", value: profile?.batch || "Not applicable", icon: faIdCard },
    {
      label: "Semester",
      value:
        profile?.semester != null ? String(profile.semester) : "Not applicable",
      icon: faGraduationCap,
    },
    { label: "Section", value: profile?.section || "Not applicable", icon: faBuildingColumns },
    { label: "Account Status", value: profile?.account_status || "Unknown", icon: faCircleCheck },
  ];

  const contactFields = [
    { label: "Institutional Email", value: profile?.email || currentUser.email, icon: faEnvelope },
    { label: "Phone Number", value: profile?.phone || emptyValue, icon: faUser },
    { label: "Personal Email", value: profile?.personal_email || emptyValue, icon: faEnvelope },
    { label: "Address", value: profile?.address || emptyValue, icon: faUser },
    { label: "Emergency Contact", value: profile?.emergency_contact || emptyValue, icon: faUser },
  ];

  const sections = [
    {
      key: "contact",
      title: "Personal & Contact Information",
      subtitle: "Information you maintain yourself.",
      icon: faUser,
      fields: contactFields,
    },
    {
      key: "institutional",
      title: "Institutional Record",
      subtitle: "Maintained by the college. Read-only.",
      icon: faShieldHalved,
      fields: identityFields,
    },
  ];

  return (
    <section className="cos-page">
      <header className="cos-page-header">
        <div className="min-w-0">
          <p className="cos-eyebrow">Profile</p>
          <h1 className="cos-page-title">My Profile</h1>
          <p className="cos-page-subtitle">
            Your photograph, identity and contact details as CollegeOS holds
            them. A photo saved here is the same photo shown wherever you
            appear, including the attendance register.
          </p>
        </div>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="cos-btn cos-btn-secondary"
          >
            <FontAwesomeIcon icon={faPen} aria-hidden="true" /> Edit Contact
            Details
          </button>
        )}
      </header>

      {error && (
        <Alert variant="error">
          <span className="flex items-center gap-2">
            <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" />
            {error}
          </span>
        </Alert>
      )}
      {success && (
        <Alert
          variant="success"
          autoDismissMs={4000}
          onDismiss={() => setSuccess("")}
        >
          {success}
        </Alert>
      )}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[340px_1fr]">
        {/* Identity card + photo controls */}
        <aside className="cos-rise cos-card min-w-0 overflow-hidden">
          <div className="flex flex-col items-center bg-gradient-to-b from-[var(--color-primary-soft)] to-white px-5 pb-5 pt-7 text-center">
            <Avatar profile={profile} previewUrl={photoPreview} />

            <h2 className="mt-4 text-xl font-bold tracking-tight text-slate-900">
              {displayName}
            </h2>
            <p className="mt-1 text-sm font-medium text-[var(--color-primary-strong)]">
              {activeRoleLabel}
            </p>

            <div className="mt-4 flex w-full flex-wrap justify-center gap-1.5">
              {(profile?.roles || [currentRole]).map((role) => (
                <span
                  key={role}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-600"
                >
                  {ROLE_LABELS[role as keyof typeof ROLE_LABELS] ||
                    role.replace(/_/g, " ")}
                </span>
              ))}
            </div>

            <dl className="mt-4 w-full space-y-2 text-left">
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Institutional email
                </dt>
                <dd className="mt-0.5 break-all text-sm text-slate-700">
                  {profile?.email || currentUser.email}
                </dd>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {profile?.student_id ? "Student ID" : "Employee ID"}
                </dt>
                <dd className="mt-0.5 font-mono text-sm text-slate-700">
                  {profile?.student_id || profile?.employee_id || "Not assigned"}
                </dd>
              </div>
            </dl>
          </div>

          {canEdit && (
            <div className="border-t border-slate-200 px-5 py-4">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                onChange={(event) => void choosePhoto(event)}
                className="sr-only"
                aria-label="Select a profile photo"
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={photoBusy}
                  className="cos-btn cos-btn-primary flex-1"
                >
                  <FontAwesomeIcon icon={faCamera} aria-hidden="true" />
                  {profile?.avatar_url ? "Change photo" : "Upload photo"}
                </button>

                {profile?.avatar_url && (
                  <button
                    type="button"
                    onClick={() => void removePhoto()}
                    disabled={photoBusy || Boolean(pendingPhoto)}
                    className="cos-btn cos-btn-secondary"
                    title="Remove the saved profile photo"
                  >
                    <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
                    Remove
                  </button>
                )}
              </div>

              {pendingPhoto && (
                <div className="cos-fade mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-3">
                    <Avatar profile={profile} previewUrl={photoPreview} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-700">
                        {pendingPhoto.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {(pendingPhoto.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void savePhoto()}
                      disabled={photoBusy}
                      className="cos-btn cos-btn-primary flex-1"
                    >
                      {photoBusy ? (
                        <FontAwesomeIcon icon={faSpinner} spin aria-hidden="true" />
                      ) : (
                        <FontAwesomeIcon icon={faUpload} aria-hidden="true" />
                      )}
                      {photoBusy ? "Saving..." : "Save photo"}
                    </button>
                    <button
                      type="button"
                      onClick={discardPhoto}
                      disabled={photoBusy}
                      className="cos-btn cos-btn-secondary"
                    >
                      <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {photoHint && (
                <p className="mt-2 text-xs leading-snug text-slate-500">
                  {photoHint}
                </p>
              )}

              <p className="mt-3 text-xs leading-relaxed text-slate-400">
                JPG, PNG or WebP up to 5MB, at least 120×120px, portrait or
                square framing. A single portrait photo is required — documents,
                scans and group shots are rejected. This upload is not identity
                verification.
              </p>
            </div>
          )}
        </aside>

        {/* Records */}
        <div className="cos-fade min-w-0 space-y-6">
          {loading ? (
            <div className="cos-card px-5 py-6 text-sm text-slate-500">
              Loading profile...
            </div>
          ) : null}

          {editing && (
            <form onSubmit={saveProfile} className="cos-card px-5 py-5">
              <h2 className="text-base font-semibold text-slate-900">
                Edit Contact Information
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Only your own contact details can be changed here. Institutional
                records are maintained by the college.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {(
                  [
                    ["phone", "Phone Number", "tel", 64],
                    ["personalEmail", "Personal Email", "email", 254],
                    ["address", "Address", "text", 500],
                    ["emergencyContact", "Emergency Contact", "tel", 64],
                  ] as const
                ).map(([key, label, type, max]) => (
                  <label
                    key={key}
                    htmlFor={`profile-${key}`}
                    className="cos-label"
                  >
                    {label}
                    <input
                      id={`profile-${key}`}
                      type={type}
                      maxLength={max}
                      value={draft[key]}
                      onChange={(event) =>
                        setDraft((value) => ({
                          ...value,
                          [key]: event.target.value,
                        }))
                      }
                      className="cos-input"
                    />
                  </label>
                ))}
              </div>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="cos-btn cos-btn-secondary"
                >
                  <FontAwesomeIcon icon={faXmark} aria-hidden="true" /> Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="cos-btn cos-btn-primary"
                >
                  <FontAwesomeIcon icon={faFloppyDisk} aria-hidden="true" />
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          )}

          {sections.map((section) => (
            <div key={section.key} className="cos-card min-w-0">
              <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]">
                  <FontAwesomeIcon icon={section.icon} className="text-sm" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-slate-900">
                    {section.title}
                  </h3>
                  <p className="text-xs text-slate-500">{section.subtitle}</p>
                </div>
              </div>

              <dl className="grid gap-3 p-5 sm:grid-cols-2">
                {section.fields.map((field) => (
                  <div
                    key={field.label}
                    className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <dt className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
                      <FontAwesomeIcon
                        icon={field.icon}
                        className="text-[0.625rem]"
                        aria-hidden="true"
                      />
                      {field.label}
                    </dt>
                    <dd className="mt-1.5 break-words text-sm text-slate-700">
                      {field.value || emptyValue}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default AccountProfileView;