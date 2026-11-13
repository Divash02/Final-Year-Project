import React, { useState, useEffect, useCallback } from "react";
import { useToast } from "../../../components/ui/ToastContainer";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { postMultipart } from "../../../services/incidentApi";
import {
  faShieldAlt,
  faExclamationTriangle,
  faBuilding,
  faMapMarkerAlt,
  faClock,
  faUser,
  faUsers,
  faTag,
  faLock,
  faLockOpen,
  faInfoCircle,
  faChevronDown,
  faChevronUp,
  faPlus,
  faTrash,
  faCheck,
  faXmark,
  faArrowLeft,
  faPaperPlane,
  faSpinner,
  faExclamationCircle,
  faBell,
  faFileAlt,
  faCamera,
  faVideo,
  faImage,
  faMicrophone,
  faFile,
  faSearch,
  faFilter,
  faChevronRight,
  faTimes,
  faFire,
  faUserShield,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { LucideIcon } from "lucide-react";
import {
  Shield,
  Building,
  MapPin,
  Clock,
  User,
  Users,
  Tag,
  Lock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Check,
  X,
  ArrowLeft,
  Send,
  Loader2,
  AlertCircle,
  Bell,
  FileText,
  Camera,
  Video,
  Image,
  Mic,
  File,
  Search,
  Filter,
  HelpCircle,
  Zap,
  Heart,
  Stethoscope,
  Hammer,
  Flame,
  Skull,
  Eye,
  UserCheck,
  ShieldAlert,
  Wrench,
  Radio,
} from "lucide-react";

interface Witness {
  id: string;
  name: string;
  contact: string;
  statement: string;
}

interface FormErrors {
  incidentType?: string;
  severity?: string;
  title?: string;
  description?: string;
  location?: { building?: string; floor?: string; room?: string; description?: string };
  occurredAt?: string;
  incidentTime?: string;
  peopleInvolved?: string;
  witnesses?: string;
  tags?: string;
  [key: string]: string | { building?: string; floor?: string; room?: string; description?: string } | undefined;
}

const INCIDENT_TYPES = [
  { value: "THEFT", label: "Theft", icon: User, description: "Unauthorized taking of property" },
  { value: "ASSAULT", label: "Assault", icon: AlertTriangle, description: "Physical attack or threat" },
  { value: "HARASSMENT", label: "Harassment", icon: User, description: "Unwanted behavior causing distress" },
  { value: "VANDALISM", label: "Vandalism", icon: Hammer, description: "Deliberate property damage" },
  { value: "FIRE_HAZARD", label: "Fire Hazard", icon: Flame, description: "Fire risk or safety violation" },
  { value: "MEDICAL_EMERGENCY", label: "Medical Emergency", icon: Heart, description: "Health crisis requiring immediate attention" },
  { value: "UNSAFE_CONDITION", label: "Unsafe Condition", icon: Wrench, description: "Hazardous environment or equipment" },
  { value: "SECURITY_BREACH", label: "Security Breach", icon: ShieldAlert, description: "Unauthorized access or data breach" },
  { value: "SUSPICIOUS_ACTIVITY", label: "Suspicious Activity", icon: Eye, description: "Unusual or concerning behavior" },
  { value: "OTHER", label: "Other", icon: Radio, description: "Any other incident type" },
] as const;

const SEVERITY_LEVELS = [
  { value: "LOW", label: "Low", description: "Minor issue requiring routine attention", color: "var(--color-success)", bg: "var(--color-success-soft)", icon: Shield },
  { value: "MODERATE", label: "Moderate", description: "An incident requiring timely investigation", color: "var(--color-warning)", bg: "var(--color-warning-soft)", icon: AlertTriangle },
  { value: "HIGH", label: "High", description: "A serious incident requiring urgent attention", color: "var(--color-accent)", bg: "var(--color-accent-soft)", icon: Zap },
  { value: "CRITICAL", label: "Critical", description: "An immediate threat to safety requiring emergency response", color: "var(--color-danger)", bg: "var(--color-danger-soft)", icon: Skull },
] as const;

const INCIDENT_TYPE_ICONS: Record<string, LucideIcon> = {
  THEFT: User,
  ASSAULT: AlertTriangle,
  HARASSMENT: User,
  VANDALISM: Hammer,
  FIRE_HAZARD: Flame,
  MEDICAL_EMERGENCY: Heart,
  UNSAFE_CONDITION: Wrench,
  SECURITY_BREACH: ShieldAlert,
  SUSPICIOUS_ACTIVITY: Eye,
  OTHER: Radio,
};

const SEVERITY_ICONS: Record<string, LucideIcon> = {
  LOW: Shield,
  MODERATE: AlertTriangle,
  HIGH: Zap,
  CRITICAL: Skull,
};

export const ReportIncidentView: React.FC = () => {
  const { currentUser } = useCollegeOS();
  const { toast } = useToast();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherIncidentType, setOtherIncidentType] = useState("");
  const [witnesses, setWitnesses] = useState<Witness[]>([{ id: "1", name: "", contact: "", statement: "" }]);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("overview");

  const [formData, setFormData] = useState({
    incidentType: "OTHER" as string,
    severity: "MODERATE" as string,
    title: "",
    description: "",
    location: {
      building: "",
      floor: "",
      room: "",
      description: "",
    },
    occurredAt: new Date().toISOString().slice(0, 16),
    incidentTime: "",
    peopleInvolved: "",
    isConfidential: true,
    anonymous: false,
    accessLevel: "SECURITY_STAFF" as string,
  });

  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);

  const validateField = useCallback((name: string, value: any): string | undefined => {
    switch (name) {
      case "incidentType":
        if (!value || value === "OTHER" && !otherIncidentType.trim()) return "Please select an incident type";
        break;
      case "severity":
        if (!value) return "Please select a severity level";
        break;
      case "title":
        if (!value.trim()) return "Title is required";
        if (value.trim().length < 5) return "Title must be at least 5 characters";
        if (value.trim().length > 200) return "Title must not exceed 200 characters";
        break;
      case "description":
        if (!value.trim()) return "Description is required";
        if (value.trim().length < 20) return "Description must be at least 20 characters";
        break;
      case "occurredAt":
        if (!value) return "Date and time of incident is required";
        const incidentDate = new Date(value);
        const now = new Date();
        if (incidentDate > now) return "Incident date cannot be in the future";
        break;
      case "incidentTime":
        if (!value) return "Time of incident is required";
        break;
      case "peopleInvolved":
        if (!value.trim()) return "People involved is required";
        if (value.trim().length > 500) return "People involved must not exceed 500 characters";
        break;
      case "location.building":
        if (!value.trim()) return "Building is required";
        break;
    }
    return undefined;
  }, [otherIncidentType]);

  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    const incidentTypeError = validateField("incidentType", formData.incidentType);
    if (incidentTypeError) newErrors.incidentType = incidentTypeError;

    const severityError = validateField("severity", formData.severity);
    if (severityError) newErrors.severity = severityError;

    const titleError = validateField("title", formData.title);
    if (titleError) newErrors.title = titleError;

    const descriptionError = validateField("description", formData.description);
    if (descriptionError) newErrors.description = descriptionError;

    const occurredAtError = validateField("occurredAt", formData.occurredAt);
    if (occurredAtError) newErrors.occurredAt = occurredAtError;

    const incidentTimeError = validateField("incidentTime", formData.incidentTime);
    if (incidentTimeError) newErrors.incidentTime = incidentTimeError;

    const peopleInvolvedError = validateField("peopleInvolved", formData.peopleInvolved);
    if (peopleInvolvedError) newErrors.peopleInvolved = peopleInvolvedError;

    const buildingError = validateField("location.building", formData.location.building);
    if (buildingError) {
      newErrors.location = { ...newErrors.location, building: buildingError };
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, validateField, otherIncidentType]);

  const handleChange = useCallback((field: string, value: any) => {
    setFormData(prev => {
      const keys = field.split(".");
      if (keys.length === 1) {
        return { ...prev, [field]: value };
      }
      const parentKey = keys[0];
      const childKey = keys[1];
      return {
        ...prev,
        [parentKey]: { ...(prev[parentKey as keyof typeof prev] as object), [childKey]: value }
      };
    });

    const error = validateField(field, value);
    setErrors(prev => {
      const newErrors = { ...prev } as FormErrors;
      if (error) {
        if (field.includes(".")) {
          const [parent, child] = field.split(".");
          newErrors[parent] = { ...(newErrors[parent] as any), [child]: error };
        } else {
          newErrors[field] = error;
        }
      } else {
        if (field.includes(".")) {
          const [parent, child] = field.split(".");
          const parentErrors = newErrors[parent] as any;
          if (parentErrors) {
            const { [child]: _, ...rest } = parentErrors;
            newErrors[parent] = Object.keys(rest).length ? rest : undefined;
          }
        } else {
          delete newErrors[field];
        }
      }
      return newErrors;
    });
  }, [validateField]);

  const handleAddWitness = useCallback(() => {
    setWitnesses(prev => [...prev, { id: Date.now().toString(), name: "", contact: "", statement: "" }]);
  }, []);

  const handleRemoveWitness = useCallback((id: string) => {
    if (witnesses.length <= 1) return;
    setWitnesses(prev => prev.filter(w => w.id !== id));
  }, [witnesses.length]);

  const handleWitnessChange = useCallback((id: string, field: keyof Witness, value: string) => {
    setWitnesses(prev => prev.map(w => w.id === id ? { ...w, [field]: value } : w));
  }, []);

  const handleAddTag = useCallback(() => {
    const tag = newTag.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags(prev => [...prev, tag]);
      setNewTag("");
    }
  }, [newTag, tags]);

  const handleRemoveTag = useCallback((tag: string) => {
    setTags(prev => prev.filter(t => t !== tag));
  }, []);

  const handleKeyDownTag = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddTag();
    }
  }, [handleAddTag]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fix the errors above before submitting");
      return;
    }

    const validWitnesses = witnesses.filter(w => w.name.trim() || w.contact.trim() || w.statement.trim());

    setIsSubmitting(true);
    try {
      const fields: Record<string, string> = {
        incidentType: formData.incidentType === "OTHER" ? otherIncidentType.trim().toUpperCase() : formData.incidentType,
        severity: formData.severity,
        title: formData.title.trim(),
        description: formData.description.trim(),
        location: JSON.stringify(formData.location),
        occurredAt: formData.occurredAt,
        incidentTime: formData.incidentTime,
        peopleInvolved: formData.peopleInvolved,
        anonymous: String(!!formData.anonymous),
        witnesses: JSON.stringify(validWitnesses),
        tags: JSON.stringify(tags),
        isConfidential: String(formData.isConfidential),
        accessLevel: formData.accessLevel,
      };

      await postMultipart("/campus-safety/incidents", evidenceFiles, fields);

      toast.success("Incident reported successfully");

      setFormData({
        incidentType: "OTHER",
        severity: "MODERATE",
        title: "",
        description: "",
        location: { building: "", floor: "", room: "", description: "" },
        occurredAt: new Date().toISOString().slice(0, 16),
        incidentTime: "",
        peopleInvolved: "",
        isConfidential: true,
        anonymous: false,
        accessLevel: "SECURITY_STAFF",
      });
      setWitnesses([{ id: "1", name: "", contact: "", statement: "" }]);
      setTags([]);
      setOtherIncidentType("");
      setShowOtherInput(false);
      setEvidenceFiles([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to report incident");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSeverityConfig = (value: string) => {
    return SEVERITY_LEVELS.find(s => s.value === value) || SEVERITY_LEVELS[1];
  };

  const currentSeverity = getSeverityConfig(formData.severity);

  return (
    <div className="w-full max-w-none px-6 py-6 lg:px-8 lg:py-8">
      {/* Header */}
      <header className="cos-page-header mb-6">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <span>Safety & Security</span>
          <FontAwesomeIcon icon={faChevronRight} size="xs" />
          <span>Incident Management</span>
          <FontAwesomeIcon icon={faChevronRight} size="xs" />
          <span className="text-[var(--color-text-primary)] font-medium">New Incident</span>
        </nav>
        <div>
          <h1 className="cos-page-title">Report New Incident</h1>
          <p className="cos-page-subtitle">
            Submit an incident report to help maintain a safe and secure campus environment.
            Provide accurate details so the appropriate team can review and respond.
          </p>
          <div className="flex items-center gap-2 mt-3 text-sm text-[var(--color-primary)]">
            <FontAwesomeIcon icon={faShieldAlt} size="sm" />
            <span>Your report will be submitted securely to the authorized incident management team.</span>
          </div>
        </div>
      </header>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 lg:gap-8">
        {/* Left Column - Main Form */}
        <div className="space-y-6 min-w-0">
          {/* Incident Type Selection */}
          <section className="cos-card cos-rise">
            <div className="cos-card-body">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[var(--color-primary-soft)] flex items-center justify-center text-[var(--color-primary)]">
                  <FontAwesomeIcon icon={faExclamationTriangle} size="lg" />
                </div>
                <div>
                  <h2 className="cos-section-title">Incident Type</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">Select the category that best describes the incident</p>
                </div>
              </div>

              {errors.incidentType && (
                <div className="cos-alert cos-alert-error mb-4" role="alert">
                  <FontAwesomeIcon icon={faExclamationCircle} className="mt-0.5" />
                  <span>{errors.incidentType}</span>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3" role="radiogroup" aria-label="Incident type">
                {INCIDENT_TYPES.map((type) => {
                  const isSelected = formData.incidentType === type.value;
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.value}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => {
                        handleChange("incidentType", type.value);
                        setShowOtherInput(type.value === "OTHER");
                      }}
                      className={`
                        relative p-4 rounded-lg border-2 transition-all duration-200
                        ${isSelected
                          ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,_var(--color-primary)_8%,_transparent)]"
                          : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
                        }
                        ${type.value === "OTHER" && !isSelected ? "opacity-70" : ""}
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`
                          w-10 h-10 rounded-lg flex items-center justify-center
                          ${isSelected ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-surface-muted)] text-[var(--color-text-secondary)]"}
                        `}>
                          <Icon size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`
                            font-medium text-sm
                            ${isSelected ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]"}
                          `}>
                            {type.label}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)] truncate">{type.description}</p>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[var(--color-primary)] flex items-center justify-center">
                          <FontAwesomeIcon icon={faCheck} size="xs" className="text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {showOtherInput && (
                <div className="mt-4 cos-rise">
                  <label className="cos-label">Specify Incident Type</label>
                  <input
                    type="text"
                    value={otherIncidentType}
                    onChange={(e) => setOtherIncidentType(e.target.value)}
                    className={`cos-input ${errors.incidentType ? "aria-invalid" : ""}`}
                    placeholder="Enter custom incident type..."
                    aria-invalid={!!errors.incidentType}
                    aria-describedby={errors.incidentType ? "incident-type-error" : undefined}
                  />
                  {errors.incidentType && (
                    <p id="incident-type-error" className="cos-error">{errors.incidentType}</p>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Severity Selection */}
          <section className="cos-card cos-rise" style={{ animationDelay: "50ms" }}>
            <div className="cos-card-body">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[var(--color-warning-soft)] flex items-center justify-center text-[var(--color-warning)]">
                  <FontAwesomeIcon icon={faExclamationCircle} size="lg" />
                </div>
                <div>
                  <h2 className="cos-section-title">Severity Level</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">Indicate the urgency and impact of this incident</p>
                </div>
              </div>

              {errors.severity && (
                <div className="cos-alert cos-alert-error mb-4" role="alert">
                  <FontAwesomeIcon icon={faExclamationCircle} className="mt-0.5" />
                  <span>{errors.severity}</span>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3" role="radiogroup" aria-label="Severity level">
                {SEVERITY_LEVELS.map((level) => {
                  const isSelected = formData.severity === level.value;
                  const Icon = level.icon;
                  return (
                    <button
                      key={level.value}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => handleChange("severity", level.value)}
                      className={`
                        relative p-4 rounded-lg border-2 transition-all duration-200 text-left
                        ${isSelected
                          ? `border-[${level.color}] bg-[${level.bg}]`
                          : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
                        }
                      `}
                      style={{ borderColor: isSelected ? level.color : undefined }}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`
                          w-10 h-10 rounded-lg flex items-center justify-center
                          ${isSelected ? `bg-[${level.color}] text-white` : `bg-[${level.bg}] text-[${level.color}]`}
                        `}>
                          <Icon size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`
                            font-medium text-sm
                            ${isSelected ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]"}
                          `}>
                            {level.label}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">{level.description}</p>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                             style={{ backgroundColor: level.color }}>
                          <FontAwesomeIcon icon={faCheck} size="xs" className="text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {(formData.severity === "HIGH" || formData.severity === "CRITICAL") && (
                <div className="mt-4 p-4 rounded-lg cos-rise"
                     style={{
                       backgroundColor: formData.severity === "CRITICAL" ? "var(--color-danger-soft)" : "var(--color-accent-soft)",
                       border: `1px solid ${formData.severity === "CRITICAL" ? "var(--color-danger)" : "var(--color-accent)"}`
                     }}
                     role="alert">
                    <div className="flex items-start gap-3">
                      <FontAwesomeIcon
                        icon={formData.severity === "CRITICAL" ? faExclamationTriangle : faBell}
                        size="lg"
                        className="mt-0.5 flex-shrink-0"
                        style={{ color: formData.severity === "CRITICAL" ? "var(--color-danger)" : "var(--color-accent)" }}
                      />
                      <div>
                        <p className="font-medium text-sm"
                           style={{ color: formData.severity === "CRITICAL" ? "var(--color-danger)" : "var(--color-accent)" }}>
                          {formData.severity === "CRITICAL" ? "Emergency Guidance" : "Urgent Attention Required"}
                        </p>
                        <p className="text-sm mt-1 text-[var(--color-text-secondary)]">
                          {formData.severity === "CRITICAL"
                            ? "If anyone is in immediate danger, contact campus security or emergency services immediately. Submitting this form does not replace emergency assistance."
                            : "This incident requires urgent attention. Ensure all details are accurate and complete."}
                        </p>
                      </div>
                    </div>
                  </div>
              )}
            </div>
          </section>

          {/* Incident Overview */}
          <section className="cos-card cos-rise" style={{ animationDelay: "100ms" }}>
            <div className="cos-card-body">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[var(--color-info-soft)] flex items-center justify-center text-[var(--color-info)]">
                  <FontAwesomeIcon icon={faFileAlt} size="lg" />
                </div>
                <div>
                  <h2 className="cos-section-title">Incident Overview</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">Provide a clear summary of what happened</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="title" className="cos-label">Title <span className="text-[var(--color-danger)]">*</span></label>
                  <input
                    id="title"
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleChange("title", e.target.value)}
                    className={`cos-input ${errors.title ? "aria-invalid" : ""}`}
                    placeholder="Briefly describe what happened..."
                    maxLength={200}
                    aria-invalid={!!errors.title}
                    aria-describedby={errors.title ? "title-error" : "title-hint"}
                  />
                  <div className="flex justify-between mt-1">
                    {errors.title ? (
                      <p id="title-error" className="cos-error">{errors.title}</p>
                    ) : (
                      <p id="title-hint" className="cos-helper">{formData.title.length}/200 characters</p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="description" className="cos-label">Description <span className="text-[var(--color-danger)]">*</span></label>
                  <textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => handleChange("description", e.target.value)}
                    className={`cos-input ${errors.description ? "aria-invalid" : ""}`}
                    placeholder="Provide a detailed description of the incident, including what happened and any relevant circumstances..."
                    rows={6}
                    style={{ minHeight: "140px", resize: "vertical" }}
                    aria-invalid={!!errors.description}
                    aria-describedby={errors.description ? "description-error" : "description-hint"}
                  />
                  <div className="flex justify-between mt-1">
                    {errors.description ? (
                      <p id="description-error" className="cos-error">{errors.description}</p>
                    ) : (
                      <p id="description-hint" className="cos-helper">{formData.description.length} characters (minimum 20)</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Incident Location */}
          <section className="cos-card cos-rise" style={{ animationDelay: "150ms" }}>
            <div className="cos-card-body">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[var(--color-success-soft)] flex items-center justify-center text-[var(--color-success)]">
                  <FontAwesomeIcon icon={faMapMarkerAlt} size="lg" />
                </div>
                <div>
                  <h2 className="cos-section-title">Incident Location</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">Where did the incident occur?</p>
                </div>
              </div>

              {errors.location?.building && (
                <div className="cos-alert cos-alert-error mb-4" role="alert">
                  <FontAwesomeIcon icon={faExclamationCircle} className="mt-0.5" />
                  <span>{errors.location.building}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="building" className="cos-label">Building <span className="text-[var(--color-danger)]">*</span></label>
                  <input
                    id="building"
                    type="text"
                    value={formData.location.building}
                    onChange={(e) => handleChange("location.building", e.target.value)}
                    className={`cos-input ${errors.location?.building ? "aria-invalid" : ""}`}
                    placeholder="e.g., Main Academic Block, Library, Hostel A"
                    aria-invalid={!!errors.location?.building}
                  />
                </div>
                <div>
                  <label htmlFor="floor" className="cos-label">Floor</label>
                  <input
                    id="floor"
                    type="text"
                    value={formData.location.floor}
                    onChange={(e) => handleChange("location.floor", e.target.value)}
                    className="cos-input"
                    placeholder="e.g., Ground, 1st, 2nd, Basement"
                  />
                </div>
                <div>
                  <label htmlFor="room" className="cos-label">Room</label>
                  <input
                    id="room"
                    type="text"
                    value={formData.location.room}
                    onChange={(e) => handleChange("location.room", e.target.value)}
                    className="cos-input"
                    placeholder="e.g., 101, Auditorium, Lab 3"
                  />
                </div>
                <div>
                  <label htmlFor="locationDescription" className="cos-label">Location Description</label>
                  <input
                    id="locationDescription"
                    type="text"
                    value={formData.location.description}
                    onChange={(e) => handleChange("location.description", e.target.value)}
                    className="cos-input"
                    placeholder="Additional details, landmarks, or directions..."
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Date & Time */}
          <section className="cos-card cos-rise" style={{ animationDelay: "200ms" }}>
            <div className="cos-card-body">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[var(--color-warning-soft)] flex items-center justify-center text-[var(--color-warning)]">
                  <FontAwesomeIcon icon={faClock} size="lg" />
                </div>
                <div>
                  <h2 className="cos-section-title">Date & Time of Incident</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">When did the incident occur?</p>
                </div>
              </div>

              {errors.occurredAt && (
                <div className="cos-alert cos-alert-error mb-4" role="alert">
                  <FontAwesomeIcon icon={faExclamationCircle} className="mt-0.5" />
                  <span>{errors.occurredAt}</span>
                </div>
              )}

              <div className="max-w-md">
                <label htmlFor="occurredAt" className="cos-label">Date & Time <span className="text-[var(--color-danger)]">*</span></label>
                <input
                  id="occurredAt"
                  type="datetime-local"
                  value={formData.occurredAt}
                  onChange={(e) => handleChange("occurredAt", e.target.value)}
                  className={`cos-input ${errors.occurredAt ? "aria-invalid" : ""}`}
                  max={new Date().toISOString().slice(0, 16)}
                  aria-invalid={!!errors.occurredAt}
                />
                <p className="cos-helper mt-1">Select the exact date and time. Future dates are not allowed.</p>
              </div>
            </div>
          </section>

          {/* Incident Time */}
          <section className="cos-card cos-rise" style={{ animationDelay: "220ms" }}>
            <div className="cos-card-body">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[var(--color-warning-soft)] flex items-center justify-center text-[var(--color-warning)]">
                  <FontAwesomeIcon icon={faClock} size="lg" />
                </div>
                <div>
                  <h2 className="cos-section-title">Time of Incident</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">Approximate time the incident occurred</p>
                </div>
              </div>

              {errors.incidentTime && (
                <div className="cos-alert cos-alert-error mb-4" role="alert">
                  <FontAwesomeIcon icon={faExclamationCircle} className="mt-0.5" />
                  <span>{errors.incidentTime}</span>
                </div>
              )}

              <div className="max-w-md">
                <label htmlFor="incidentTime" className="cos-label">Time <span className="text-[var(--color-danger)]">*</span></label>
                <input
                  id="incidentTime"
                  type="time"
                  value={formData.incidentTime}
                  onChange={(e) => handleChange("incidentTime", e.target.value)}
                  className={`cos-input ${errors.incidentTime ? "aria-invalid" : ""}`}
                  aria-invalid={!!errors.incidentTime}
                />
                <p className="cos-helper mt-1">Enter the approximate time of the incident.</p>
              </div>
            </div>
          </section>

          {/* People Involved */}
          <section className="cos-card cos-rise" style={{ animationDelay: "240ms" }}>
            <div className="cos-card-body">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[var(--color-primary-soft)] flex items-center justify-center text-[var(--color-primary)]">
                  <FontAwesomeIcon icon={faUsers} size="lg" />
                </div>
                <div>
                  <h2 className="cos-section-title">People Involved</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">Who was involved in or affected by this incident?</p>
                </div>
              </div>

              {errors.peopleInvolved && (
                <div className="cos-alert cos-alert-error mb-4" role="alert">
                  <FontAwesomeIcon icon={faExclamationCircle} className="mt-0.5" />
                  <span>{errors.peopleInvolved}</span>
                </div>
              )}

              <label htmlFor="peopleInvolved" className="cos-label">People Involved <span className="text-[var(--color-danger)]">*</span></label>
              <textarea
                id="peopleInvolved"
                value={formData.peopleInvolved}
                onChange={(e) => handleChange("peopleInvolved", e.target.value)}
                className={`cos-input ${errors.peopleInvolved ? "aria-invalid" : ""}`}
                placeholder="Names and roles of people involved (e.g., student names, staff, visitors)..."
                rows={3}
                style={{ minHeight: "100px", resize: "vertical" }}
                aria-invalid={!!errors.peopleInvolved}
              />
              <p className="cos-helper mt-1">Describe the individuals involved and their relationship to the incident. Maximum 500 characters.</p>
            </div>
          </section>

          {/* Witnesses */}
          <section className="cos-card cos-rise" style={{ animationDelay: "250ms" }}>
            <div className="cos-card-body">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[var(--color-primary-soft)] flex items-center justify-center text-[var(--color-primary)]">
                    <FontAwesomeIcon icon={faUsers} size="lg" />
                  </div>
                  <div>
                    <h2 className="cos-section-title">Witness Information</h2>
                    <p className="text-sm text-[var(--color-text-muted)]">Add witnesses who can provide additional details</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAddWitness}
                  className="cos-btn cos-btn-secondary cos-btn-sm"
                  style={{ minHeight: "var(--height-control-sm)", paddingInline: "0.75rem" }}
                >
                  <FontAwesomeIcon icon={faPlus} size="sm" />
                  <span>Add Witness</span>
                </button>
              </div>

              <div className="space-y-4" role="group" aria-label="Witnesses">
                {witnesses.map((witness, index) => (
                  <div key={witness.id} className="cos-card cos-card-body space-y-3" style={{ padding: "1rem" }}>
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm text-[var(--color-text-primary)]">
                        Witness {index + 1}
                      </h4>
                      {witnesses.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveWitness(witness.id)}
                          className="cos-icon-btn text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                          aria-label={`Remove witness ${index + 1}`}
                        >
                          <FontAwesomeIcon icon={faTrash} size="sm" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label htmlFor={`witness-name-${witness.id}`} className="cos-label">Full Name</label>
                        <input
                          id={`witness-name-${witness.id}`}
                          type="text"
                          value={witness.name}
                          onChange={(e) => handleWitnessChange(witness.id, "name", e.target.value)}
                          className="cos-input"
                          placeholder="Witness full name"
                        />
                      </div>
                      <div>
                        <label htmlFor={`witness-contact-${witness.id}`} className="cos-label">Contact Information</label>
                        <input
                          id={`witness-contact-${witness.id}`}
                          type="text"
                          value={witness.contact}
                          onChange={(e) => handleWitnessChange(witness.id, "contact", e.target.value)}
                          className="cos-input"
                          placeholder="Phone, email, or room number"
                        />
                      </div>
                      <div className="md:col-span-3">
                        <label htmlFor={`witness-statement-${witness.id}`} className="cos-label">Statement</label>
                        <textarea
                          id={`witness-statement-${witness.id}`}
                          value={witness.statement}
                          onChange={(e) => handleWitnessChange(witness.id, "statement", e.target.value)}
                          className="cos-input"
                          placeholder="What did the witness see or hear?"
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {witnesses.length === 0 && (
                <p className="text-center text-[var(--color-text-muted)] py-4">No witnesses added yet.</p>
              )}
            </div>
          </section>

          {/* Tags */}
          <section className="cos-card cos-rise" style={{ animationDelay: "300ms" }}>
            <div className="cos-card-body">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[var(--color-accent-soft)] flex items-center justify-center text-[var(--color-accent)]">
                  <FontAwesomeIcon icon={faTag} size="lg" />
                </div>
                <div>
                  <h2 className="cos-section-title">Tags</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">Add relevant tags for categorization and search</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                {tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:bg-[var(--color-primary)] hover:text-white transition-colors"
                      aria-label={`Remove tag ${tag}`}
                    >
                      <FontAwesomeIcon icon={faTimes} size="xs" />
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={handleKeyDownTag}
                  className="cos-input flex-1"
                  placeholder="Add a tag (press Enter or comma)"
                  aria-label="Add tag"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="cos-btn cos-btn-secondary"
                  disabled={!newTag.trim() || tags.includes(newTag.trim().toLowerCase())}
                >
                  Add
                </button>
              </div>
              <p className="cos-helper mt-1">Example tags: campus, night, security, laboratory, equipment, parking</p>
            </div>
          </section>

          {/* Evidence Upload */}
          <section className="cos-card cos-rise" style={{ animationDelay: "320ms" }}>
            <div className="cos-card-body">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[color-mix(in_srgb,_var(--color-primary)_10%,_transparent)] flex items-center justify-center text-[var(--color-primary)]">
                  <FontAwesomeIcon icon={faPaperclip} size="lg" />
                </div>
                <div>
                  <h2 className="cos-section-title">Supporting Evidence</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">Upload photos, documents, audio, or video related to this incident (optional)</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                {evidenceFiles.map((file, index) => (
                  <span key={index} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-[color-mix(in_srgb,_var(--color-primary)_10%,_transparent)] text-[var(--color-primary)]">
                    {file.name}
                    <button
                      type="button"
                      onClick={() => setEvidenceFiles(evidenceFiles.filter((_, i) => i !== index))}
                      className="hover:text-[var(--color-primary)]"
                    >
                      <FontAwesomeIcon icon={faTimes} size="xs" />
                    </button>
                  </span>
                ))}
                {evidenceFiles.length === 0 && (
                  <span className="text-xs text-[var(--color-text-muted)] italic">No files selected</span>
                )}
              </div>

              <input
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.mp3,.mp4,.zip,.txt"
                onChange={(e) => {
                  if (e.target.files) setEvidenceFiles(Array.from(e.target.files));
                }}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[var(--color-primary)] file:text-white hover:file:bg-[var(--color-primary-strong)]"
              />
              <p className="cos-helper mt-1">Supported formats: JPG, PNG, PDF, DOC, MP3, MP4, ZIP, TXT. Maximum 25 MB total.</p>
            </div>
          </section>

          {/* Confidentiality */}
          <section className="cos-card cos-rise" style={{ animationDelay: "350ms" }}>
            <div className="cos-card-body">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-[color-mix(in_srgb,_var(--color-primary)_10%,_transparent)] flex items-center justify-center text-[var(--color-primary)] flex-shrink-0 mt-1">
                  {formData.isConfidential ? (
                    <FontAwesomeIcon icon={faLock} size="lg" />
                  ) : (
                    <FontAwesomeIcon icon={faLockOpen} size="lg" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h2 className="cos-section-title">Confidential Report</h2>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isConfidential}
                        onChange={(e) => handleChange("isConfidential", e.target.checked)}
                        className="sr-only peer"
                        aria-label="Confidential report"
                      />
                      <div className={`
                        w-11 h-6 rounded-full transition-colors duration-200
                        ${formData.isConfidential ? "bg-[var(--color-primary)]" : "bg-[var(--color-border-strong)]"}
                      `}>
                        <div className={`
                          w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
                          ${formData.isConfidential ? "translate-x-5" : "translate-x-0"}
                        `} />
                      </div>
                    </label>
                  </div>
                  <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                    {formData.isConfidential
                      ? "Restrict access to this report to authorized personnel according to CollegeOS incident-management permissions."
                      : "Standard report visibility based on user roles and permissions."}
                  </p>
                </div>
              </div>

              {/* Anonymous toggle */}
              <div className="mt-5 pt-4 border-t border-[var(--color-border)]">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[color-mix(in_srgb,_var(--color-accent)_10%,_transparent)] flex items-center justify-center text-[var(--color-accent)] flex-shrink-0 mt-1">
                    <FontAwesomeIcon icon={faUserShield} size="lg" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium text-[var(--color-text-primary)]">Anonymous Report</h3>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.anonymous}
                          onChange={(e) => handleChange("anonymous", e.target.checked)}
                          className="sr-only peer"
                          aria-label="Anonymous report"
                        />
                        <div className={`
                          w-11 h-6 rounded-full transition-colors duration-200
                          ${formData.anonymous ? "bg-[var(--color-accent)]" : "bg-[var(--color-border-strong)]"}
                        `}>
                          <div className={`
                            w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
                            ${formData.anonymous ? "translate-x-5" : "translate-x-0"}
                          `} />
                        </div>
                      </label>
                    </div>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                      {formData.anonymous
                        ? "Your identity will be withheld from staff viewing this report. You will still receive updates via your account."
                        : "Your name will be associated with this report so staff can follow up with you directly."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Action Bar */}
          <footer className="cos-card cos-card-body flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="cos-btn cos-btn-secondary"
            >
              <FontAwesomeIcon icon={faArrowLeft} size="sm" />
              <span>Cancel</span>
            </button>
            <button
              type="submit"
              form="report-incident-form"
              disabled={isSubmitting}
              className="cos-btn cos-btn-primary ml-auto"
            >
              {isSubmitting ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} className="animate-spin" size="sm" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faPaperPlane} size="sm" />
                  <span>Submit Report</span>
                </>
              )}
            </button>
          </footer>
        </div>

        {/* Right Column - Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start" aria-label="Reporting guidance">
          {/* Reporting Guidance */}
          <section className="cos-card cos-rise">
            <div className="cos-card-body">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[var(--color-info-soft)] flex items-center justify-center text-[var(--color-info)]">
                  <FontAwesomeIcon icon={faInfoCircle} size="sm" />
                </div>
                <h3 className="font-semibold text-[var(--color-text-primary)]">Before You Submit</h3>
              </div>
              <ul className="space-y-3 text-sm text-[var(--color-text-secondary)]">
                <li className="flex items-start gap-2">
                  <FontAwesomeIcon icon={faCheck} size="xs" className="text-[var(--color-success)] mt-0.5 flex-shrink-0" />
                  Provide accurate incident details — avoid speculation
                </li>
                <li className="flex items-start gap-2">
                  <FontAwesomeIcon icon={faCheck} size="xs" className="text-[var(--color-success)] mt-0.5 flex-shrink-0" />
                  Include the correct location with building, floor, and room
                </li>
                <li className="flex items-start gap-2">
                  <FontAwesomeIcon icon={faCheck} size="xs" className="text-[var(--color-success)] mt-0.5 flex-shrink-0" />
                  Add witness information where available
                </li>
                <li className="flex items-start gap-2">
                  <FontAwesomeIcon icon={faCheck} size="xs" className="text-[var(--color-success)] mt-0.5 flex-shrink-0" />
                  Select the appropriate severity level
                </li>
                <li className="flex items-start gap-2">
                  <FontAwesomeIcon icon={faCheck} size="xs" className="text-[var(--color-success)] mt-0.5 flex-shrink-0" />
                  Avoid unnecessary personal information
                </li>
              </ul>
            </div>
          </section>

          {/* Severity Guide */}
          <section className="cos-card cos-rise">
            <div className="cos-card-body">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[var(--color-warning-soft)] flex items-center justify-center text-[var(--color-warning)]">
                  <FontAwesomeIcon icon={faExclamationCircle} size="sm" />
                </div>
                <h3 className="font-semibold text-[var(--color-text-primary)]">Severity Guide</h3>
              </div>
              <div className="space-y-2">
                {SEVERITY_LEVELS.map((level) => {
                  const isSelected = formData.severity === level.value;
                  const Icon = level.icon;
                  return (
                    <div
                      key={level.value}
                      className={`
                        p-3 rounded-lg border transition-all duration-200
                        ${isSelected
                          ? `border-[${level.color}] bg-[${level.bg}]`
                          : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
                        }
                      `}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`
                          w-7 h-7 rounded flex items-center justify-center flex-shrink-0
                          ${isSelected ? `bg-[${level.color}] text-white` : `bg-[${level.bg}] text-[${level.color}]`}
                        `}>
                          <Icon size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`
                            font-medium text-sm
                            ${isSelected ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]"}
                          `}>
                            {level.label}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">{level.description}</p>
                        </div>
                        {isSelected && (
                          <FontAwesomeIcon icon={faCheck} size="xs" style={{ color: level.color }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Confidentiality Info */}
          <section className="cos-card cos-rise">
            <div className="cos-card-body">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,_var(--color-primary)_10%,_transparent)] flex items-center justify-center text-[var(--color-primary)]">
                  <FontAwesomeIcon icon={faLock} size="sm" />
                </div>
                <h3 className="font-semibold text-[var(--color-text-primary)]">Confidentiality</h3>
              </div>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Confidential reports are subject to restricted access based on authorized CollegeOS permissions.
                Only security staff, campus administrators, and authorized management can view confidential reports.
              </p>
              <p className="text-sm text-[var(--color-text-secondary)] mt-2">
                Current setting: <span className="font-medium">{formData.isConfidential ? "Confidential" : "Standard"}</span>
              </p>
            </div>
          </section>

          {/* Submission Summary */}
          <section className="cos-card cos-rise">
            <div className="cos-card-body">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[var(--color-success-soft)] flex items-center justify-center text-[var(--color-success)]">
                  <FontAwesomeIcon icon={faFileAlt} size="sm" />
                </div>
                <h3 className="font-semibold text-[var(--color-text-primary)]">Submission Summary</h3>
              </div>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-text-muted)]">Incident Type</dt>
                  <dd className="font-medium text-right truncate max-w-[140px]">
                    {formData.incidentType === "OTHER" && otherIncidentType
                      ? otherIncidentType
                      : INCIDENT_TYPES.find(t => t.value === formData.incidentType)?.label || "Not selected"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-text-muted)]">Severity</dt>
                  <dd className="font-medium text-right">
                    <span className={`
                      px-2 py-0.5 rounded text-xs font-medium
                      ${formData.severity === "LOW" && "bg-[var(--color-success-soft)] text-[var(--color-success)]"}
                      ${formData.severity === "MODERATE" && "bg-[var(--color-warning-soft)] text-[var(--color-warning)]"}
                      ${formData.severity === "HIGH" && "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"}
                      ${formData.severity === "CRITICAL" && "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"}
                    `}>
                      {formData.severity}
                    </span>
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-text-muted)]">Title</dt>
                  <dd className="font-medium text-right truncate max-w-[140px] text-[var(--color-text-secondary)]">
                    {formData.title || "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-text-muted)]">Location</dt>
                  <dd className="font-medium text-right truncate max-w-[140px] text-[var(--color-text-secondary)]">
                    {formData.location.building || "—"}
                    {formData.location.floor && `, Floor ${formData.location.floor}`}
                    {formData.location.room && `, Room ${formData.location.room}`}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-text-muted)]">Date & Time</dt>
                  <dd className="font-medium text-right text-[var(--color-text-secondary)]">
                    {formData.occurredAt ? new Date(formData.occurredAt).toLocaleDateString() : "—"}
                    {formData.incidentTime ? ` • ${formData.incidentTime}` : ""}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-text-muted)]">People Involved</dt>
                  <dd className="font-medium text-right truncate max-w-[140px] text-[var(--color-text-secondary)]">
                    {formData.peopleInvolved || "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-text-muted)]">Anonymous</dt>
                  <dd className="font-medium text-right">
                    <span className={`
                      px-2 py-0.5 rounded text-xs
                      ${formData.anonymous ? "bg-[color-mix(in_srgb,_var(--color-accent)_10%,_transparent)] text-[var(--color-accent)]" : "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]"}
                    `}>
                      {formData.anonymous ? "Yes" : "No"}
                    </span>
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-text-muted)]">Evidence</dt>
                  <dd className="font-medium text-right text-[var(--color-text-secondary)]">
                    {evidenceFiles.length}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-text-muted)]">Witnesses</dt>
                  <dd className="font-medium text-right text-[var(--color-text-secondary)]">
                    {witnesses.filter(w => w.name.trim() || w.contact.trim() || w.statement.trim()).length}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-text-muted)]">Tags</dt>
                  <dd className="font-medium text-right text-[var(--color-text-secondary)]">
                    {tags.length}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 pt-2 border-t border-[var(--color-border)]">
                  <dt className="text-[var(--color-text-muted)]">Confidential</dt>
                  <dd className="font-medium text-right">
                    <span className={`
                      px-2 py-0.5 rounded text-xs
                      ${formData.isConfidential ? "bg-[color-mix(in_srgb,_var(--color-primary)_10%,_transparent)] text-[var(--color-primary)]" : "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]"}
                    `}>
                      {formData.isConfidential ? "Yes" : "No"}
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          {/* Emergency Contacts Quick Reference */}
          <section className="cos-card cos-rise">
            <div className="cos-card-body">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[var(--color-danger-soft)] flex items-center justify-center text-[var(--color-danger)]">
                  <FontAwesomeIcon icon={faBell} size="sm" />
                </div>
                <h3 className="font-semibold text-[var(--color-text-primary)]">Emergency Contacts</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 p-2 rounded bg-[var(--color-surface-muted)]">
                  <div className="w-7 h-7 rounded-full bg-[var(--color-info-soft)] flex items-center justify-center text-[var(--color-info)] flex-shrink-0">
                    <FontAwesomeIcon icon={faShieldAlt} size="xs" />
                  </div>
                  <div>
                    <p className="font-medium text-[var(--color-text-primary)]">Campus Security</p>
                    <p className="text-xs text-[var(--color-text-muted)]">24/7 • +977-1-XXXXXXX</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-[var(--color-surface-muted)]">
                  <div className="w-7 h-7 rounded-full bg-[var(--color-danger-soft)] flex items-center justify-center text-[var(--color-danger)] flex-shrink-0">
                    <FontAwesomeIcon icon={faUser} size="xs" />
                  </div>
                  <div>
                    <p className="font-medium text-[var(--color-text-primary)]">Medical Emergency</p>
                    <p className="text-xs text-[var(--color-text-muted)]">24/7 • 102</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-[var(--color-surface-muted)]">
                  <div className="w-7 h-7 rounded-full bg-[var(--color-accent-soft)] flex items-center justify-center text-[var(--color-accent)] flex-shrink-0">
                    <FontAwesomeIcon icon={faFire} size="xs" />
                  </div>
                  <div>
                    <p className="font-medium text-[var(--color-text-primary)]">Fire Department</p>
                    <p className="text-xs text-[var(--color-text-muted)]">24/7 • 101</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-[var(--color-surface-muted)]">
                  <div className="w-7 h-7 rounded-full bg-[var(--color-warning-soft)] flex items-center justify-center text-[var(--color-warning)] flex-shrink-0">
                    <FontAwesomeIcon icon={faUserShield} size="xs" />
                  </div>
                  <div>
                    <p className="font-medium text-[var(--color-text-primary)]">Police</p>
                    <p className="text-xs text-[var(--color-text-muted)]">24/7 • 100</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <form id="report-incident-form" onSubmit={handleSubmit} style={{ display: "none" }} />
    </div>
  );
};

export default ReportIncidentView;