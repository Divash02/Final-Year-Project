import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  faArchive,
  faCheckCircle,
  faClock,
  faDownload,
  faEye,
  faFile,
  faFilePdf,
  faFilter,
  faFolder,
  faFolderOpen,
  faHistory,
  faImage,
  faLock,
  faList,
  faMagnifyingGlass,
  faPlus,
  faRotateLeft,
  faShareAlt,
  faTableCellsLarge,
  faTag,
  faUpload,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { apiFetch, apiRequest, apiUpload } from "../../services/apiClient";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { useToast } from "../ui/ToastContainer";
import type { AuthUser } from "../../types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Modal } from "../ui/Modal";
import { PageHeader } from "../ui/PageHeader";

type DocumentStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "revision_requested";
type AccessLevel = "public" | "department" | "restricted" | "confidential";
type Person = {
  _id?: string;
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};
type PersonReference = string | Person | null;
type DocumentVersion = {
  version: number;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  uploadedBy: PersonReference;
  uploadedAt: string;
  changeNote: string;
  restoredFrom?: number | null;
};
type DocumentRecord = {
  _id: string;
  sourceType?: "invoice" | "receipt" | "enrollment" | "examResult" | "academic";
  title: string;
  description?: string;
  user: PersonReference;
  student?: string | null;
  category: string;
  documentType?: string;
  folder?: string | null;
  department?: string;
  academicYear?: string;
  tags?: string[];
  accessLevel: AccessLevel;
  approvalStatus: DocumentStatus;
  archived: boolean;
  version: number;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
  sharedWith?: Array<{
    user: PersonReference;
    permission: "view" | "download";
    grantedAt?: string;
  }>;
  versions?: DocumentVersion[];
};
type FolderRecord = {
  _id: string;
  name: string;
  parent?: string | null;
  owner?: string;
  archived?: boolean;
};
type NavigationItem =
  | "all"
  | "mine"
  | "shared"
  | "recent"
  | "pending"
  | "folders"
  | "archived";
type UploadMetadata = {
  title: string;
  description: string;
  category: string;
  department: string;
  academicYear: string;
  tags: string;
  accessLevel: AccessLevel;
  folder: string;
};

const DOCUMENT_CATEGORIES = [
  "GENERAL",
  "ACADEMIC",
  "ADMISSION_FORM",
  "CHARACTER_CERTIFICATE",
  "EXAMINATION",
  "FEE_RECEIPT",
  "FINANCE",
  "HR",
  "ID_CARD",
  "POLICY",
  "TRANSCRIPT",
] as const;
const ACCESS_LEVELS: Array<{ value: AccessLevel; label: string }> = [
  { value: "department", label: "Department" },
  { value: "public", label: "Institution-wide" },
  { value: "restricted", label: "Restricted" },
  { value: "confidential", label: "Confidential" },
];
const ACCEPTED_EXTENSIONS = new Set(["pdf", "doc", "docx", "png", "jpg", "jpeg"]);
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const FIELD_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100";
const LABEL_CLASS = "block text-sm font-medium text-slate-700";

const NAVIGATION: Array<{
  id: NavigationItem;
  label: string;
  icon: typeof faFile;
}> = [
  { id: "all", label: "All Documents", icon: faFile },
  { id: "mine", label: "My Documents", icon: faUsers },
  { id: "shared", label: "Shared With Me", icon: faShareAlt },
  { id: "recent", label: "Recent Documents", icon: faClock },
  { id: "pending", label: "Pending Approvals", icon: faCheckCircle },
  { id: "folders", label: "Folders & Categories", icon: faFolder },
  { id: "archived", label: "Archived", icon: faArchive },
];

const EMPTY_UPLOAD: UploadMetadata = {
  title: "",
  description: "",
  category: "GENERAL",
  department: "",
  academicYear: "",
  tags: "",
  accessLevel: "department",
  folder: "",
};

function referenceId(reference: PersonReference | FolderRecord["parent"]): string {
  if (!reference) return "";
  if (typeof reference === "string") return reference;
  if ("_id" in reference && reference._id) return reference._id;
  if ("id" in reference && reference.id) return reference.id;
  return "";
}

function personName(reference: PersonReference): string {
  if (!reference || typeof reference === "string") return "";
  return [reference.firstName, reference.lastName].filter(Boolean).join(" ");
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function documentIcon(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return faFilePdf;
  if (["png", "jpg", "jpeg"].includes(extension || "")) return faImage;
  return faFile;
}

function statusClasses(status: string): string {
  if (status === "approved") return "bg-emerald-50 text-emerald-800";
  if (status === "pending") return "bg-amber-50 text-amber-800";
  if (status === "rejected") return "bg-rose-50 text-rose-800";
  if (status === "revision_requested") return "bg-orange-50 text-orange-800";
  return "bg-slate-100 text-slate-700";
}

function accessLabel(accessLevel: string): string {
  return ACCESS_LEVELS.find((option) => option.value === accessLevel)?.label || accessLevel;
}

async function loadFolderTree(parent: string | null, depth = 0): Promise<FolderRecord[]> {
  if (depth > 8) return [];
  const query = parent ? `?parent=${encodeURIComponent(parent)}` : "";
  const result = await apiRequest<{ folders: FolderRecord[] }>(`/folders${query}`);
  const folders = result.folders || [];
  const nested = await Promise.all(
    folders.map((folder) => loadFolderTree(folder._id, depth + 1)),
  );
  return folders.flatMap((folder, index) => [folder, ...nested[index]]);
}

export const SmartDocumentCentreView: React.FC = () => {
  const { currentUser } = useCollegeOS();
  const toast = useToast();
  const user = currentUser as AuthUser | null;
  const userId = user?.id || "";
  const canManage =
    Boolean(user?.permissions?.includes("documents.manage")) ||
    (user?.roles || [user?.role]).some((role) =>
      ["super_admin", "registrar", "dean", "college_admin"].includes(role || ""),
    );

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [folderDocuments, setFolderDocuments] = useState<DocumentRecord[] | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [activeNavigation, setActiveNavigation] = useState<NavigationItem>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [accessFilter, setAccessFilter] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [layout, setLayout] = useState<"list" | "grid">("list");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadMetadata, setUploadMetadata] = useState<UploadMetadata>(EMPTY_UPLOAD);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);

  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState("");
  const [folderSaving, setFolderSaving] = useState(false);
  const [folderParent, setFolderParent] = useState("");

  const [detailDocument, setDetailDocument] = useState<DocumentRecord | null>(null);
  const [editDocument, setEditDocument] = useState<DocumentRecord | null>(null);
  const [editMetadata, setEditMetadata] = useState({
    title: "",
    description: "",
    category: "GENERAL",
    department: "",
    academicYear: "",
    tags: "",
  });
  const [editError, setEditError] = useState("");
  const [shareDocument, setShareDocument] = useState<DocumentRecord | null>(null);
  const [shareQuery, setShareQuery] = useState("");
  const [shareUsers, setShareUsers] = useState<Person[]>([]);
  const [sharePermission, setSharePermission] = useState<"view" | "download">("view");
  const [shareError, setShareError] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [versionsDocument, setVersionsDocument] = useState<DocumentRecord | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionNote, setVersionNote] = useState("");
  const [versionError, setVersionError] = useState("");
  const [versionBusy, setVersionBusy] = useState(false);
  const [versionProgress, setVersionProgress] = useState(0);
  const versionInput = useRef<HTMLInputElement>(null);
  const [moveDocument, setMoveDocument] = useState<DocumentRecord | null>(null);
  const [moveFolder, setMoveFolder] = useState("");
  const [accessDocument, setAccessDocument] = useState<DocumentRecord | null>(null);
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("department");
  const [accessDepartment, setAccessDepartment] = useState("");
  const [archiveDocument, setArchiveDocument] = useState<DocumentRecord | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [preview, setPreview] = useState<{
    title: string;
    url: string;
    contentType: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [activeResult, archivedResult, folderResult] = await Promise.all([
        apiRequest<{ documents: DocumentRecord[] }>("/documents"),
        apiRequest<{ documents: DocumentRecord[] }>("/documents?archived=true"),
        loadFolderTree(null),
      ]);
      setDocuments([
        ...(activeResult.documents || []),
        ...(archivedResult.documents || []),
      ]);
      setFolders(folderResult);
    } catch (requestError) {
      toast.toast({ message: errorMessage(requestError, "Could not load institutional documents."), variant: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () => () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  const ownerId = (document: DocumentRecord) => referenceId(document.user);
  const isOwner = (document: DocumentRecord) => ownerId(document) === userId;
  const canManageDocument = (document: DocumentRecord) => canManage || isOwner(document);
  const sharedToCurrentUser = (document: DocumentRecord) =>
    (document.sharedWith || []).some(
      (share) => referenceId(share.user) === userId,
    );

  const activeDocuments = useMemo(
    () => documents.filter((document) => !document.archived),
    [documents],
  );
  const archivedDocuments = useMemo(
    () => documents.filter((document) => document.archived),
    [documents],
  );
  const departmentOptions = useMemo(
    () =>
      [...new Set(documents.map((document) => document.department).filter(Boolean))]
        .sort((a, b) => String(a).localeCompare(String(b))) as string[],
    [documents],
  );
  const yearOptions = useMemo(
    () =>
      [...new Set(documents.map((document) => document.academicYear).filter(Boolean))]
        .sort((a, b) => String(b).localeCompare(String(a))) as string[],
    [documents],
  );

  const filteredDocuments = useMemo(() => {
    let result =
      activeNavigation === "archived"
        ? archivedDocuments
        : activeNavigation === "folders"
          ? folderDocuments ||
            activeDocuments.filter((document) => !document.folder)
          : activeDocuments;

    if (activeNavigation === "mine") {
      result = result.filter((document) => isOwner(document));
    } else if (activeNavigation === "shared") {
      result = result.filter(
        (document) => sharedToCurrentUser(document) && !isOwner(document),
      );
    } else if (activeNavigation === "recent") {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      result = result.filter((document) => new Date(document.updatedAt).getTime() >= cutoff);
    } else if (activeNavigation === "pending") {
      result = result.filter((document) => document.approvalStatus === "pending");
    }

    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery) {
      result = result.filter((document) =>
        [
          document.title,
          document.fileName,
          document.description,
          ...(document.tags || []),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
      );
    }
    if (categoryFilter) result = result.filter((document) => document.category === categoryFilter);
    if (departmentFilter) result = result.filter((document) => document.department === departmentFilter);
    if (yearFilter) result = result.filter((document) => document.academicYear === yearFilter);
    if (statusFilter) result = result.filter((document) => document.approvalStatus === statusFilter);
    if (accessFilter) result = result.filter((document) => document.accessLevel === accessFilter);

    return [...result].sort((a, b) => {
      if (sortOrder === "oldest") return +new Date(a.createdAt) - +new Date(b.createdAt);
      if (sortOrder === "name") return a.title.localeCompare(b.title);
      if (sortOrder === "size") return b.fileSize - a.fileSize;
      return +new Date(b.createdAt) - +new Date(a.createdAt);
    });
  }, [
    activeDocuments,
    activeNavigation,
    accessFilter,
    archivedDocuments,
    categoryFilter,
    departmentFilter,
    folderDocuments,
    isOwner,
    query,
    sharedToCurrentUser,
    sortOrder,
    statusFilter,
    yearFilter,
  ]);

  const counts = useMemo(
    () => ({
      total: activeDocuments.length,
      mine: activeDocuments.filter(isOwner).length,
      shared: activeDocuments.filter(
        (document) => sharedToCurrentUser(document) && !isOwner(document),
      ).length,
      pending: activeDocuments.filter((document) => document.approvalStatus === "pending")
        .length,
      approved: activeDocuments.filter((document) => document.approvalStatus === "approved")
        .length,
      archived: archivedDocuments.length,
    }),
    [activeDocuments, archivedDocuments, isOwner, sharedToCurrentUser],
  );

  const chooseNavigation = (item: NavigationItem) => {
    setActiveNavigation(item);
    setCurrentFolderId(null);
    setFolderDocuments(null);
    setError("");
  };

  const openFolder = async (folder: FolderRecord) => {
    setError("");
    setCurrentFolderId(folder._id);
    try {
      const result = await apiRequest<{ documents: DocumentRecord[] }>(
        `/folders/${encodeURIComponent(folder._id)}/documents`,
      );
      setFolderDocuments(result.documents || []);
    } catch (requestError) {
      toast.toast({ message: errorMessage(requestError, "Could not open this folder."), variant: "error" });
    }
  };

  const folderLabel = (folderId?: string | null) =>
    folders.find((folder) => folder._id === folderId)?.name || "Root";

  const acceptFile = (candidate?: File) => {
    if (!candidate) return;
    const extension = candidate.name.split(".").pop()?.toLowerCase() || "";
    if (!ACCEPTED_EXTENSIONS.has(extension)) {
      setUploadFile(null);
      setUploadError("Choose a PDF, DOC, DOCX, PNG, JPG or JPEG file.");
      return;
    }
    if (candidate.size > MAX_FILE_BYTES) {
      setUploadFile(null);
      setUploadError("Files must be 12 MB or smaller.");
      return;
    }
    setUploadFile(candidate);
    setUploadError("");
  };

  const clearUploadFile = () => {
    setUploadFile(null);
    setUploadError("");
    if (uploadInput.current) uploadInput.current.value = "";
  };

  const openUpload = () => {
    setUploadMetadata({
      ...EMPTY_UPLOAD,
      folder: activeNavigation === "folders" ? currentFolderId || "" : "",
    });
    clearUploadFile();
    setUploadOpen(true);
  };

  const uploadDocument = async (event: React.FormEvent) => {
    event.preventDefault();
    if (uploading) return;
    if (!uploadFile) {
      setUploadError("Select a file to upload.");
      return;
    }
    if (!uploadMetadata.title.trim()) {
      setUploadError("Enter a document title.");
      return;
    }
    setUploading(true);
    setUploadError("");
    const body = new FormData();
    body.append("file", uploadFile);
    body.append("title", uploadMetadata.title.trim());
    body.append("description", uploadMetadata.description.trim());
    body.append("category", uploadMetadata.category);
    body.append("documentType", uploadMetadata.category);
    body.append("department", uploadMetadata.department.trim());
    body.append("academicYear", uploadMetadata.academicYear.trim());
    body.append("tags", uploadMetadata.tags);
    body.append("accessLevel", uploadMetadata.accessLevel);
    if (uploadMetadata.folder) body.append("folder", uploadMetadata.folder);
    try {
      setUploadProgress(0);
      await apiUpload("/documents", body, setUploadProgress);
      setUploadProgress(100);
      setUploadOpen(false);
      clearUploadFile();
      toast.toast({ message: "Document uploaded.", variant: "success" });
      await load();
    } catch (requestError) {
      setUploadError(errorMessage(requestError, "Document upload failed."));
    } finally {
      setUploading(false);
    }
  };

  const createFolder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!folderName.trim()) {
      setFolderError("Enter a folder name.");
      return;
    }
    setFolderSaving(true);
    setFolderError("");
    try {
      await apiRequest("/folders", {
        method: "POST",
        body: JSON.stringify({
          name: folderName.trim(),
          parent: folderParent || null,
        }),
      });
      setFolderOpen(false);
      setFolderName("");
      toast.toast({ message: "Folder created.", variant: "success" });
      await load();
    } catch (requestError) {
      setFolderError(errorMessage(requestError, "Folder could not be created."));
    } finally {
      setFolderSaving(false);
    }
  };

  const loadDocumentDetails = async (document: DocumentRecord) => {
    setActionBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ document: DocumentRecord }>(
        `/documents/${document._id}`,
      );
      setDetailDocument(result.document);
    } catch (requestError) {
      toast.toast({ message: errorMessage(requestError, "Document details could not be loaded."), variant: "error" });
    } finally {
      setActionBusy(false);
    }
  };

  const beginEditMetadata = (document: DocumentRecord) => {
    setEditDocument(document);
    setEditError("");
    setEditMetadata({
      title: document.title,
      description: document.description || "",
      category: document.category,
      department: document.department || "",
      academicYear: document.academicYear || "",
      tags: (document.tags || []).join(", "),
    });
  };

  const saveMetadata = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editDocument) return;
    if (!editMetadata.title.trim()) {
      setEditError("Enter a document title.");
      return;
    }
    setActionBusy(true);
    setEditError("");
    try {
      const result = await apiRequest<{ document: DocumentRecord }>(
        `/documents/${editDocument._id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...editMetadata,
            title: editMetadata.title.trim(),
            tags: editMetadata.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
            documentType: editMetadata.category,
          }),
        },
      );
      setEditDocument(null);
      setDetailDocument(result.document);
      toast.toast({ message: "Document details updated.", variant: "success" });
      await load();
    } catch (requestError) {
      setEditError(errorMessage(requestError, "Document details could not be updated."));
    } finally {
      setActionBusy(false);
    }
  };

  const openFile = async (document: DocumentRecord, download = false) => {
    setActionBusy(true);
    setError("");
    try {
      const fileUrl = new URL(document.fileUrl, window.location.origin);
      if (download) fileUrl.searchParams.set("download", "true");
      const route = `${fileUrl.pathname.replace(/^\/api(?=\/)/, "")}${fileUrl.search}`;
      const response = await apiFetch(
        route,
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "The file could not be opened.");
      }
      const contentType = response.headers.get("content-type") || "";
      const objectUrl = URL.createObjectURL(await response.blob());
      if (download) {
        const link = window.document.createElement("a");
        link.href = objectUrl;
        link.download = document.fileName;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } else {
        setPreview((current) => {
          if (current?.url) URL.revokeObjectURL(current.url);
          return {
            title: document.title,
            url: objectUrl,
            contentType,
          };
        });
      }
    } catch (requestError) {
      toast.toast({ message: errorMessage(requestError, "The file could not be opened."), variant: "error" });
    } finally {
      setActionBusy(false);
    }
  };

  const openVersions = async (document: DocumentRecord) => {
    setVersionsDocument(document);
    setVersionError("");
    setActionBusy(true);
    try {
      const result = await apiRequest<{
        versions: DocumentVersion[];
        current: number;
      }>(`/documents/${document._id}/versions`);
      setVersions(result.versions || []);
    } catch (requestError) {
      setVersionError(errorMessage(requestError, "Version history could not be loaded."));
    } finally {
      setActionBusy(false);
    }
  };

  const searchUsers = async (value: string) => {
    setShareQuery(value);
    setShareError("");
    if (!value.trim()) {
      setShareUsers([]);
      return;
    }
    try {
      const result = await apiRequest<{ users: Person[] }>(
        `/documents/users/search?q=${encodeURIComponent(value.trim())}`,
      );
      setShareUsers(result.users || []);
    } catch (requestError) {
      setShareError(errorMessage(requestError, "User search failed."));
    }
  };

  const refreshSharedDocument = async (id: string) => {
    const result = await apiRequest<{ document: DocumentRecord }>(`/documents/${id}`);
    setShareDocument(result.document);
    await load();
  };

  const shareWith = async (target: Person) => {
    if (!shareDocument || !referenceId(target)) return;
    setShareBusy(true);
    setShareError("");
    try {
      await apiRequest(`/documents/${shareDocument._id}/share`, {
        method: "POST",
        body: JSON.stringify({
          userId: referenceId(target),
          permission: sharePermission,
        }),
      });
      await refreshSharedDocument(shareDocument._id);
      setShareUsers((current) =>
        current.filter((person) => referenceId(person) !== referenceId(target)),
      );
      toast.toast({ message: "Document access updated.", variant: "success" });
    } catch (requestError) {
      setShareError(errorMessage(requestError, "Document could not be shared."));
    } finally {
      setShareBusy(false);
    }
  };

  const changeSharedPermission = async (targetId: string, permission: "view" | "download") => {
    if (!shareDocument) return;
    setShareBusy(true);
    setShareError("");
    try {
      await apiRequest(`/documents/${shareDocument._id}/share`, {
        method: "POST",
        body: JSON.stringify({ userId: targetId, permission }),
      });
      await refreshSharedDocument(shareDocument._id);
    } catch (requestError) {
      setShareError(errorMessage(requestError, "Permission could not be updated."));
    } finally {
      setShareBusy(false);
    }
  };

  const revokeShare = async (targetId: string) => {
    if (!shareDocument) return;
    setShareBusy(true);
    setShareError("");
    try {
      await apiRequest(`/documents/${shareDocument._id}/share/${targetId}`, {
        method: "DELETE",
      });
      await refreshSharedDocument(shareDocument._id);
      toast.toast({ message: "Document access revoked.", variant: "success" });
    } catch (requestError) {
      setShareError(errorMessage(requestError, "Access could not be revoked."));
    } finally {
      setShareBusy(false);
    }
  };

  const uploadVersion = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!versionsDocument || !versionFile) {
      setVersionError("Select a file for the new version.");
      return;
    }
    const extension = versionFile.name.split(".").pop()?.toLowerCase() || "";
    if (!ACCEPTED_EXTENSIONS.has(extension) || versionFile.size > MAX_FILE_BYTES) {
      setVersionError("Choose a supported file of 12 MB or smaller.");
      return;
    }
    setVersionBusy(true);
    setVersionError("");
    const body = new FormData();
    body.append("file", versionFile);
    body.append("changeNote", versionNote);
    try {
      setVersionProgress(0);
      const uploadResult = await apiUpload<{ document: DocumentRecord }>(
        `/documents/${versionsDocument._id}/versions`,
        body,
        setVersionProgress,
      );
      setVersionProgress(100);
      setVersionsDocument(uploadResult.document);
      setVersionFile(null);
      setVersionNote("");
      if (versionInput.current) versionInput.current.value = "";
      const result = await apiRequest<{ versions: DocumentVersion[] }>(
        `/documents/${versionsDocument._id}/versions`,
      );
      setVersions(result.versions || []);
      toast.toast({ message: "New document version uploaded.", variant: "success" });
      await load();
    } catch (requestError) {
      setVersionError(errorMessage(requestError, "New version upload failed."));
    } finally {
      setVersionBusy(false);
    }
  };

  const restoreVersion = async (version: number) => {
    if (!versionsDocument) return;
    setVersionBusy(true);
    setVersionError("");
    try {
      const restoreResult = await apiRequest<{ document: DocumentRecord }>(
        `/documents/${versionsDocument._id}/restore/${version}`,
        {
        method: "POST",
        },
      );
      setVersionsDocument(restoreResult.document);
      const result = await apiRequest<{ versions: DocumentVersion[] }>(
        `/documents/${versionsDocument._id}/versions`,
      );
      setVersions(result.versions || []);
      toast.toast({ message: `Restored as a new version from v${version}.`, variant: "success" });
      await load();
    } catch (requestError) {
      setVersionError(errorMessage(requestError, "This version could not be restored."));
    } finally {
      setVersionBusy(false);
    }
  };

  const saveMove = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!moveDocument) return;
    setActionBusy(true);
    setError("");
    try {
      await apiRequest(`/documents/${moveDocument._id}/folder`, {
        method: "PATCH",
        body: JSON.stringify({ folderId: moveFolder || null }),
      });
      setMoveDocument(null);
      toast.toast({ message: "Document moved.", variant: "success" });
      await load();
      if (currentFolderId) {
        const result = await apiRequest<{ documents: DocumentRecord[] }>(
          `/folders/${encodeURIComponent(currentFolderId)}/documents`,
        );
        setFolderDocuments(result.documents || []);
      }
    } catch (requestError) {
      toast.toast({ message: errorMessage(requestError, "Document could not be moved."), variant: "error" });
    } finally {
      setActionBusy(false);
    }
  };

  const saveAccess = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessDocument) return;
    setActionBusy(true);
    setError("");
    try {
      await apiRequest(`/documents/${accessDocument._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          accessLevel,
          department: accessLevel === "department" ? accessDepartment : "",
        }),
      });
      setAccessDocument(null);
      toast.toast({ message: "Document access settings updated.", variant: "success" });
      await load();
    } catch (requestError) {
      toast.toast({ message: errorMessage(requestError, "Access settings could not be updated."), variant: "error" });
    } finally {
      setActionBusy(false);
    }
  };

  const archive = async () => {
    if (!archiveDocument) return;
    setActionBusy(true);
    setError("");
    try {
      await apiRequest(`/documents/${archiveDocument._id}`, { method: "DELETE" });
      setArchiveDocument(null);
      toast.toast({ message: "Document archived.", variant: "success" });
      await load();
    } catch (requestError) {
      toast.toast({ message: errorMessage(requestError, "Document could not be archived."), variant: "error" });
    } finally {
      setActionBusy(false);
    }
  };

  const restoreDocument = async (document: DocumentRecord) => {
    setActionBusy(true);
    setError("");
    try {
      await apiRequest(`/documents/${document._id}`, {
        method: "PATCH",
        body: JSON.stringify({ archived: false }),
      });
      toast.toast({ message: "Document restored.", variant: "success" });
      await load();
    } catch (requestError) {
      toast.toast({ message: errorMessage(requestError, "Document could not be restored."), variant: "error" });
    } finally {
      setActionBusy(false);
    }
  };

  const clearFilters = () => {
    setQuery("");
    setCategoryFilter("");
    setDepartmentFilter("");
    setYearFilter("");
    setStatusFilter("");
    setAccessFilter("");
    setSortOrder("newest");
  };

  const renderFolderTree = (parent: string | null, depth = 0): React.ReactNode =>
    folders
      .filter((folder) => referenceId(folder.parent || null) === (parent || ""))
      .map((folder) => (
        <React.Fragment key={folder._id}>
          <button
            type="button"
            onClick={() => void openFolder(folder)}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
              currentFolderId === folder._id
                ? "bg-emerald-50 font-semibold text-emerald-800"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            style={{ paddingLeft: `${12 + depth * 14}px` }}
          >
            <FontAwesomeIcon icon={faFolder} className="text-amber-500" />
            <span className="truncate">{folder.name}</span>
          </button>
          {renderFolderTree(folder._id, depth + 1)}
        </React.Fragment>
      ));

  const renderDocumentActions = (document: DocumentRecord) => (
    <div className="flex flex-wrap gap-1">
      <Button
        size="xs"
        variant="ghost"
        title="View document details"
        onClick={() => void loadDocumentDetails(document)}
      >
        Details
      </Button>
      <Button
        size="xs"
        variant="ghost"
        icon={faEye}
        title="Preview document"
        onClick={() => void openFile(document)}
      >
        Preview
      </Button>
      <Button
        size="xs"
        variant="ghost"
        icon={faDownload}
        title="Download document"
        onClick={() => void openFile(document, true)}
      >
        Download
      </Button>
      <Button
        size="xs"
        variant="ghost"
        icon={faHistory}
        title="View version history"
        onClick={() => void openVersions(document)}
      >
        Versions
      </Button>
      {!document.sourceType && canManageDocument(document) && !document.archived && (
        <>
          <Button
            size="xs"
            variant="ghost"
            icon={faUpload}
            title="Upload a new version"
            onClick={() => void openVersions(document)}
          >
            New version
          </Button>
          <Button
            size="xs"
            variant="ghost"
            icon={faShareAlt}
            title="Manage sharing"
            onClick={() => {
              setShareDocument(document);
              setShareQuery("");
              setShareUsers([]);
              setShareError("");
            }}
          >
            Share
          </Button>
          <Button
            size="xs"
            variant="ghost"
            icon={faLock}
            title="Manage access"
            onClick={() => {
              setAccessDocument(document);
              setAccessLevel(document.accessLevel);
              setAccessDepartment(document.department || "");
            }}
          >
            Access
          </Button>
          <Button
            size="xs"
            variant="ghost"
            title="Edit document metadata"
            onClick={() => beginEditMetadata(document)}
          >
            Edit details
          </Button>
          <Button
            size="xs"
            variant="ghost"
            icon={faFolderOpen}
            title="Move to folder"
            onClick={() => {
              setMoveDocument(document);
              setMoveFolder(document.folder || "");
            }}
          >
            Move
          </Button>
          <Button
            size="xs"
            variant="ghost"
            icon={faArchive}
            title="Archive document"
            onClick={() => setArchiveDocument(document)}
          >
            Archive
          </Button>
        </>
      )}
      {!document.sourceType && document.archived && canManageDocument(document) && (
        <Button
          size="xs"
          variant="ghost"
          icon={faRotateLeft}
          title="Restore document"
          onClick={() => void restoreDocument(document)}
        >
          Restore
        </Button>
      )}
    </div>
  );

  const renderDocumentCard = (document: DocumentRecord) => (
    <Card key={document._id} padding className="h-full">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg text-[var(--color-primary)]">
          <FontAwesomeIcon icon={documentIcon(document.fileName)} />
        </div>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => void loadDocumentDetails(document)}
            className="block max-w-full truncate text-left font-semibold text-slate-900 hover:text-emerald-800"
          >
            {document.title}
          </button>
          <p className="mt-1 truncate text-xs text-slate-500">{document.fileName}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs ${statusClasses(document.approvalStatus)}`}>
          {document.approvalStatus.replaceAll("_", " ")}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
          {accessLabel(document.accessLevel)}
        </span>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {document.category.replaceAll("_", " ")} · v{document.version} · {formatBytes(document.fileSize)}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {document.department || "No department"} · Updated {formatDate(document.updatedAt)}
      </p>
      <div className="mt-4 border-t border-slate-100 pt-3">{renderDocumentActions(document)}</div>
    </Card>
  );

  return (
    <div className="cos-page space-y-5">
      <PageHeader
        eyebrow="Institutional workspace"
        title="Smart Document Centre"
        description="Securely organize, discover, review and share institutional documents."
        icon={faFolderOpen}
        actions={
          <>
            <Button variant="outline" disabled={loading} onClick={() => void load()}>
              Refresh
            </Button>
            <Button
              variant="outline"
              icon={faPlus}
              onClick={() => {
                setFolderName("");
                setFolderParent(currentFolderId || "");
                setFolderError("");
                setFolderOpen(true);
              }}
            >
              Create folder
            </Button>
            <Button icon={faUpload} onClick={openUpload}>Upload document</Button>
          </>
        }
      />

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
          <button type="button" className="ml-3 font-semibold underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {success && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>{success}</span>
          <button type="button" className="ml-3 font-semibold underline" onClick={() => setSuccess("")}>
            Dismiss
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Total documents", value: counts.total, icon: faFile },
          { label: "My documents", value: counts.mine, icon: faUsers },
          { label: "Pending review", value: counts.pending, icon: faClock },
          { label: "Approved", value: counts.approved, icon: faCheckCircle },
          { label: "Archived", value: counts.archived, icon: faArchive },
        ].map((metric) => (
          <Card key={metric.label} padding className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
              <FontAwesomeIcon icon={metric.icon} />
            </span>
            <span>
              <span className="block text-2xl font-semibold text-slate-900">
                {loading ? "—" : metric.value}
              </span>
              <span className="block text-xs text-slate-500">{metric.label}</span>
            </span>
          </Card>
        ))}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
        <Card padding className="lg:sticky lg:top-4">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Browse
          </p>
          <nav aria-label="Document views" className="space-y-1">
            {NAVIGATION.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => chooseNavigation(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                  activeNavigation === item.id
                    ? "bg-emerald-50 font-semibold text-emerald-900"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <FontAwesomeIcon icon={item.icon} className="w-4 text-center" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.id === "all" && <span className="text-xs text-slate-400">{counts.total}</span>}
                {item.id === "mine" && <span className="text-xs text-slate-400">{counts.mine}</span>}
                {item.id === "shared" && <span className="text-xs text-slate-400">{counts.shared}</span>}
                {item.id === "pending" && <span className="text-xs text-slate-400">{counts.pending}</span>}
                {item.id === "archived" && <span className="text-xs text-slate-400">{counts.archived}</span>}
              </button>
            ))}
          </nav>
          {activeNavigation === "folders" && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => {
                  setCurrentFolderId(null);
                  setFolderDocuments(null);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                  currentFolderId === null
                    ? "bg-emerald-50 font-semibold text-emerald-900"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <FontAwesomeIcon icon={faFolderOpen} />
                Root folder
              </button>
              {renderFolderTree(null)}
              {folders.length === 0 && (
                <p className="px-3 py-2 text-xs text-slate-500">No folders created yet.</p>
              )}
            </div>
          )}
        </Card>

        <section className="min-w-0 space-y-4">
          <Card padding>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Search documents</span>
                  <FontAwesomeIcon
                    icon={faMagnifyingGlass}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    className={`${FIELD_CLASS} mt-0 pl-9`}
                    placeholder="Search title, filename, description or tags"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-500">
                  <FontAwesomeIcon icon={faFilter} />
                  <span className="sr-only">Sort documents</span>
                  <select
                    className={`${FIELD_CLASS} mt-0 min-w-40`}
                    value={sortOrder}
                    onChange={(event) => setSortOrder(event.target.value)}
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="name">Name A–Z</option>
                    <option value="size">Largest file</option>
                  </select>
                </label>
                <div className="flex shrink-0 items-center rounded-lg border border-slate-200 p-1">
                  <button
                    type="button"
                    aria-label="List view"
                    aria-pressed={layout === "list"}
                    onClick={() => setLayout("list")}
                    className={`rounded px-3 py-2 ${layout === "list" ? "bg-emerald-50 text-emerald-800" : "text-slate-500"}`}
                  >
                    <FontAwesomeIcon icon={faList} />
                  </button>
                  <button
                    type="button"
                    aria-label="Grid view"
                    aria-pressed={layout === "grid"}
                    onClick={() => setLayout("grid")}
                    className={`rounded px-3 py-2 ${layout === "grid" ? "bg-emerald-50 text-emerald-800" : "text-slate-500"}`}
                  >
                    <FontAwesomeIcon icon={faTableCellsLarge} />
                  </button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <select aria-label="Filter by category" className={`${FIELD_CLASS} mt-0`} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="">All categories</option>
                  {DOCUMENT_CATEGORIES.map((category) => <option key={category} value={category}>{category.replaceAll("_", " ")}</option>)}
                </select>
                <select aria-label="Filter by department" className={`${FIELD_CLASS} mt-0`} value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
                  <option value="">All departments</option>
                  {departmentOptions.map((department) => <option key={department}>{department}</option>)}
                </select>
                <select aria-label="Filter by academic year" className={`${FIELD_CLASS} mt-0`} value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
                  <option value="">All academic years</option>
                  {yearOptions.map((year) => <option key={year}>{year}</option>)}
                </select>
                <select aria-label="Filter by status" className={`${FIELD_CLASS} mt-0`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">All statuses</option>
                  {["draft", "pending", "approved", "rejected", "revision_requested"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
                </select>
                <div className="flex gap-2">
                  <select aria-label="Filter by access level" className={`${FIELD_CLASS} mt-0 min-w-0`} value={accessFilter} onChange={(event) => setAccessFilter(event.target.value)}>
                    <option value="">All access levels</option>
                    {ACCESS_LEVELS.map((access) => <option key={access.value} value={access.value}>{access.label}</option>)}
                  </select>
                  <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>
                </div>
              </div>
            </div>
          </Card>

          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {NAVIGATION.find((item) => item.id === activeNavigation)?.label}
              </h2>
              {activeNavigation === "folders" && (
                <p className="mt-1 text-sm text-slate-500">
                  {currentFolderId ? `Folder: ${folderLabel(currentFolderId)}` : "Root folder"}
                </p>
              )}
            </div>
            <p className="text-sm text-slate-500">
              {filteredDocuments.length} {filteredDocuments.length === 1 ? "document" : "documents"}
            </p>
          </div>

          {loading ? (
            <div role="status" className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              Loading documents…
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
              <FontAwesomeIcon icon={faFolderOpen} className="text-3xl text-slate-300" />
              <h3 className="mt-4 font-semibold text-slate-800">
                {query || categoryFilter || departmentFilter || yearFilter || statusFilter || accessFilter
                  ? "No documents match these filters"
                  : "No documents here yet"}
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                {activeNavigation === "shared"
                  ? "Documents shared with your account will appear in this view."
                  : activeNavigation === "pending"
                    ? "There are no documents awaiting review in the records you can access."
                    : activeNavigation === "archived"
                      ? "Archived documents remain available here for authorized restoration."
                      : "Upload an institutional document or clear filters to see available records."}
              </p>
              <div className="mt-5 flex justify-center gap-2">
                {(query || categoryFilter || departmentFilter || yearFilter || statusFilter || accessFilter) && (
                  <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
                )}
                {activeNavigation !== "archived" && activeNavigation !== "shared" && (
                  <Button icon={faUpload} onClick={openUpload}>Upload document</Button>
                )}
              </div>
            </div>
          ) : layout === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {filteredDocuments.map(renderDocumentCard)}
            </div>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Document</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Department</th>
                      <th className="px-4 py-3">Owner</th>
                      <th className="px-4 py-3">File size</th>
                      <th className="px-4 py-3">Updated</th>
                      <th className="px-4 py-3">Access</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDocuments.map((document) => (
                      <tr key={document._id} className="align-top hover:bg-slate-50/70">
                        <td className="px-4 py-4">
                          <div className="flex min-w-56 items-start gap-3">
                            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[var(--color-primary)]">
                              <FontAwesomeIcon icon={documentIcon(document.fileName)} />
                            </span>
                            <div className="min-w-0">
                              <button type="button" className="block max-w-64 truncate text-left font-semibold text-slate-900 hover:text-emerald-800" onClick={() => void loadDocumentDetails(document)}>
                                {document.title}
                              </button>
                              <p className="mt-1 max-w-64 truncate text-xs text-slate-500">{document.fileName}</p>
                              <p className="mt-1 text-xs text-slate-400">v{document.version} · {folderLabel(document.folder)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-slate-600">{document.category.replaceAll("_", " ")}</td>
                        <td className="px-4 py-4 text-slate-600">{document.department || "—"}</td>
                        <td className="px-4 py-4 text-slate-600">
                          {personName(document.user) || (isOwner(document) ? user?.name : "Institutional user")}
                        </td>
                        <td className="px-4 py-4 text-slate-600">{formatBytes(document.fileSize)}</td>
                        <td className="px-4 py-4 text-slate-600">{formatDate(document.updatedAt)}</td>
                        <td className="px-4 py-4 text-slate-600">{accessLabel(document.accessLevel)}</td>
                        <td className="px-4 py-4">
                          <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${statusClasses(document.approvalStatus)}`}>
                            {document.approvalStatus.replaceAll("_", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-4">{renderDocumentActions(document)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </section>
      </div>

      <Modal
        isOpen={uploadOpen}
        onClose={() => {
          if (!uploading) setUploadOpen(false);
        }}
        title="Upload document"
        subtitle="Add a file to the secure institutional repository."
        icon={faUpload}
        maxWidth="3xl"
        footer={
          <>
            <Button variant="outline" disabled={uploading} onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button type="submit" form="document-upload-form" icon={faUpload} isLoading={uploading} loadingLabel="Uploading…">Upload document</Button>
          </>
        }
      >
        <form id="document-upload-form" onSubmit={(event) => void uploadDocument(event)} className="space-y-5">
          <label
            className={`flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-7 text-center transition ${
              dragOver
                ? "border-emerald-500 bg-emerald-50"
                : "border-slate-300 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/50"
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              acceptFile(event.dataTransfer.files?.[0]);
            }}
          >
            <FontAwesomeIcon icon={faUpload} className="text-2xl text-emerald-700" />
            <span className="mt-3 font-semibold text-slate-800">
              {uploadFile ? uploadFile.name : "Drag and drop your file here"}
            </span>
            <span className="mt-1 text-sm text-slate-500">
              {uploadFile
                ? `${formatBytes(uploadFile.size)} · ${uploadFile.name.split(".").pop()?.toUpperCase()}`
                : "or browse files · PDF, DOC, DOCX, PNG, JPG, JPEG · up to 12 MB"}
            </span>
            <input
              ref={uploadInput}
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              className="sr-only"
              onChange={(event) => acceptFile(event.target.files?.[0])}
            />
            <span className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
              Browse files
            </span>
          </label>
          {uploadFile && (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
              <span className="flex min-w-0 items-center gap-3 text-sm">
                <FontAwesomeIcon icon={documentIcon(uploadFile.name)} className="text-emerald-700" />
                <span className="truncate">{uploadFile.name}</span>
                <span className="shrink-0 text-slate-500">{formatBytes(uploadFile.size)}</span>
              </span>
              <button type="button" className="ml-3 text-sm font-medium text-rose-700 hover:underline" onClick={clearUploadFile}>
                Remove file
              </button>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <label className={`${LABEL_CLASS} md:col-span-2`}>
              Document title
              <input className={FIELD_CLASS} required maxLength={200} value={uploadMetadata.title} onChange={(event) => setUploadMetadata({ ...uploadMetadata, title: event.target.value })} />
            </label>
            <label className={`${LABEL_CLASS} md:col-span-2`}>
              Description
              <textarea className={FIELD_CLASS} rows={3} maxLength={2000} value={uploadMetadata.description} onChange={(event) => setUploadMetadata({ ...uploadMetadata, description: event.target.value })} />
            </label>
            <label className={LABEL_CLASS}>
              Category
              <select className={FIELD_CLASS} value={uploadMetadata.category} onChange={(event) => setUploadMetadata({ ...uploadMetadata, category: event.target.value })}>
                {DOCUMENT_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
              </select>
            </label>
            <label className={LABEL_CLASS}>
              Department
              <input className={FIELD_CLASS} maxLength={120} list="document-department-options" value={uploadMetadata.department} onChange={(event) => setUploadMetadata({ ...uploadMetadata, department: event.target.value })} />
              <datalist id="document-department-options">{departmentOptions.map((department) => <option key={department} value={department} />)}</datalist>
            </label>
            <label className={LABEL_CLASS}>
              Academic year
              <input className={FIELD_CLASS} maxLength={32} placeholder="e.g. 2026/27" value={uploadMetadata.academicYear} onChange={(event) => setUploadMetadata({ ...uploadMetadata, academicYear: event.target.value })} />
            </label>
            <label className={LABEL_CLASS}>
              Access level
              <select className={FIELD_CLASS} value={uploadMetadata.accessLevel} onChange={(event) => setUploadMetadata({ ...uploadMetadata, accessLevel: event.target.value as AccessLevel })}>
                {ACCESS_LEVELS.map((access) => <option key={access.value} value={access.value}>{access.label}</option>)}
              </select>
            </label>
            <label className={LABEL_CLASS}>
              Tags
              <input className={FIELD_CLASS} placeholder="Separate tags with commas" value={uploadMetadata.tags} onChange={(event) => setUploadMetadata({ ...uploadMetadata, tags: event.target.value })} />
            </label>
            <label className={LABEL_CLASS}>
              Folder
              <select className={FIELD_CLASS} value={uploadMetadata.folder} onChange={(event) => setUploadMetadata({ ...uploadMetadata, folder: event.target.value })}>
                <option value="">Root folder</option>
                {folders.map((folder) => <option key={folder._id} value={folder._id}>{folder.name}</option>)}
              </select>
            </label>
          </div>
          {uploading && (
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-600">
                <span>Uploading document…</span>
                <span>{uploadProgress}%</span>
              </div>
              <div
                role="progressbar"
                aria-label="Document upload progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={uploadProgress}
                className="h-2 overflow-hidden rounded-full bg-slate-100"
              >
                <div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}
          {uploadError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{uploadError}</p>}
        </form>
      </Modal>

      <Modal
        isOpen={folderOpen}
        onClose={() => setFolderOpen(false)}
        title="Create folder"
        subtitle="Folders help organize documents and remain stored in CollegeOS."
        icon={faFolder}
        footer={
          <>
            <Button variant="outline" onClick={() => setFolderOpen(false)}>Cancel</Button>
            <Button type="submit" form="create-document-folder" isLoading={folderSaving} loadingLabel="Creating…">Create folder</Button>
          </>
        }
      >
        <form id="create-document-folder" onSubmit={(event) => void createFolder(event)} className="space-y-4">
          <label className={LABEL_CLASS}>
            Folder name
            <input autoFocus className={FIELD_CLASS} required maxLength={120} value={folderName} onChange={(event) => setFolderName(event.target.value)} />
          </label>
          <label className={LABEL_CLASS}>
            Parent folder
            <select className={FIELD_CLASS} value={folderParent} onChange={(event) => setFolderParent(event.target.value)}>
              <option value="">Root folder</option>
              {folders.map((folder) => <option key={folder._id} value={folder._id}>{folder.name}</option>)}
            </select>
          </label>
          {folderError && <p role="alert" className="text-sm text-rose-700">{folderError}</p>}
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(detailDocument)}
        onClose={() => setDetailDocument(null)}
        title={detailDocument?.title || "Document details"}
        subtitle="Document information and access summary."
        icon={faFile}
        maxWidth="2xl"
        footer={
          <>
            {detailDocument && !detailDocument.sourceType && canManageDocument(detailDocument) && (
              <Button variant="outline" onClick={() => beginEditMetadata(detailDocument)}>Edit details</Button>
            )}
            <Button variant="outline" onClick={() => setDetailDocument(null)}>Close</Button>
          </>
        }
      >
        {detailDocument && (
          <div className="space-y-5">
            {detailDocument.description && <p className="text-sm text-slate-600">{detailDocument.description}</p>}
            <dl className="grid gap-4 sm:grid-cols-2">
              {[
                ["Filename", detailDocument.fileName],
                ["Category", detailDocument.category.replaceAll("_", " ")],
                ["Department", detailDocument.department || "Not specified"],
                ["Academic year", detailDocument.academicYear || "Not specified"],
                ["Size", formatBytes(detailDocument.fileSize)],
                ["Version", `v${detailDocument.version}`],
                ["Access", accessLabel(detailDocument.accessLevel)],
                ["Status", detailDocument.approvalStatus.replaceAll("_", " ")],
                ["Created", formatDate(detailDocument.createdAt)],
                ["Last modified", formatDate(detailDocument.updatedAt)],
                ["Owner", personName(detailDocument.user) || (isOwner(detailDocument) ? user?.name : "Institutional user") || "Institutional user"],
                ["Folder", folderLabel(detailDocument.folder)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
                  <dd className="mt-1 break-words text-sm text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
            {detailDocument.tags?.length ? (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Tags</p>
                <div className="flex flex-wrap gap-2">{detailDocument.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600"><FontAwesomeIcon icon={faTag} className="mr-1.5" />{tag}</span>)}</div>
              </div>
            ) : null}
            {detailDocument.sharedWith?.length ? (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Shared with</p>
                <ul className="space-y-2">
                  {detailDocument.sharedWith.map((entry) => (
                    <li key={referenceId(entry.user)} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <span>{personName(entry.user) || (typeof entry.user === "object" && entry.user ? entry.user.email : "") || "Shared user"}</span>
                      <span className="text-xs text-slate-500">{entry.permission} · {formatDate(entry.grantedAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button icon={faEye} onClick={() => void openFile(detailDocument)}>Preview</Button>
              <Button variant="outline" icon={faDownload} onClick={() => void openFile(detailDocument, true)}>Download</Button>
              <Button variant="outline" icon={faHistory} onClick={() => void openVersions(detailDocument)}>Version history</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(editDocument)}
        onClose={() => {
          if (!actionBusy) setEditDocument(null);
        }}
        title={`Edit details · ${editDocument?.title || ""}`}
        subtitle="Update document metadata without changing its stored file."
        icon={faFile}
        footer={
          <>
            <Button variant="outline" disabled={actionBusy} onClick={() => setEditDocument(null)}>Cancel</Button>
            <Button type="submit" form="edit-document-metadata" isLoading={actionBusy} loadingLabel="Saving…">Save changes</Button>
          </>
        }
      >
        <form id="edit-document-metadata" onSubmit={(event) => void saveMetadata(event)} className="grid gap-4 sm:grid-cols-2">
          <label className={`${LABEL_CLASS} sm:col-span-2`}>
            Document title
            <input className={FIELD_CLASS} required maxLength={200} value={editMetadata.title} onChange={(event) => setEditMetadata({ ...editMetadata, title: event.target.value })} />
          </label>
          <label className={`${LABEL_CLASS} sm:col-span-2`}>
            Description
            <textarea className={FIELD_CLASS} rows={3} maxLength={2000} value={editMetadata.description} onChange={(event) => setEditMetadata({ ...editMetadata, description: event.target.value })} />
          </label>
          <label className={LABEL_CLASS}>
            Category
            <select className={FIELD_CLASS} value={editMetadata.category} onChange={(event) => setEditMetadata({ ...editMetadata, category: event.target.value })}>
              {[...new Set([...DOCUMENT_CATEGORIES, editMetadata.category])].map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>
          <label className={LABEL_CLASS}>
            Department
            <input className={FIELD_CLASS} maxLength={120} value={editMetadata.department} onChange={(event) => setEditMetadata({ ...editMetadata, department: event.target.value })} />
          </label>
          <label className={LABEL_CLASS}>
            Academic year
            <input className={FIELD_CLASS} maxLength={32} value={editMetadata.academicYear} onChange={(event) => setEditMetadata({ ...editMetadata, academicYear: event.target.value })} />
          </label>
          <label className={LABEL_CLASS}>
            Tags
            <input className={FIELD_CLASS} placeholder="Separate tags with commas" value={editMetadata.tags} onChange={(event) => setEditMetadata({ ...editMetadata, tags: event.target.value })} />
          </label>
          {editError && <p role="alert" className="sm:col-span-2 text-sm text-rose-700">{editError}</p>}
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(shareDocument)}
        onClose={() => setShareDocument(null)}
        title={`Sharing · ${shareDocument?.title || ""}`}
        subtitle="Manage who can view or download this document."
        icon={faShareAlt}
        maxWidth="2xl"
      >
        <div className="space-y-5">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <label>
              <span className="sr-only">Find a user</span>
              <input className={FIELD_CLASS} placeholder="Search by name or email" value={shareQuery} onChange={(event) => void searchUsers(event.target.value)} />
            </label>
            <select aria-label="Permission to grant" className={FIELD_CLASS} value={sharePermission} onChange={(event) => setSharePermission(event.target.value as "view" | "download")}>
              <option value="view">View</option>
              <option value="download">Download</option>
            </select>
          </div>
          {shareUsers.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {shareUsers.map((target) => (
                <li key={referenceId(target)} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{personName(target) || target.email}</span>
                    <span className="block truncate text-xs text-slate-500">{target.email}</span>
                  </span>
                  <Button size="sm" disabled={shareBusy} onClick={() => void shareWith(target)}>Grant access</Button>
                </li>
              ))}
            </ul>
          )}
          {shareDocument?.sharedWith?.length ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">People with access</h3>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {shareDocument.sharedWith.map((entry) => {
                  const sharedUserId = referenceId(entry.user);
                  return (
                    <li key={sharedUserId} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{personName(entry.user) || "Shared user"}</span>
                        <span className="block text-xs text-slate-500">{typeof entry.user === "object" ? entry.user?.email : ""} · Granted {formatDate(entry.grantedAt)}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <select aria-label={`Permission for ${personName(entry.user) || "shared user"}`} className="rounded-md border border-slate-200 px-2 py-1 text-xs" value={entry.permission} disabled={shareBusy} onChange={(event) => void changeSharedPermission(sharedUserId, event.target.value as "view" | "download")}>
                          <option value="view">View</option>
                          <option value="download">Download</option>
                        </select>
                        <Button size="xs" variant="danger" disabled={shareBusy} onClick={() => void revokeShare(sharedUserId)}>Revoke</Button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No users have been granted access directly.</p>
          )}
          {shareError && <p role="alert" className="text-sm text-rose-700">{shareError}</p>}
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(versionsDocument)}
        onClose={() => {
          setVersionsDocument(null);
          setVersionFile(null);
          setVersionNote("");
          if (versionInput.current) versionInput.current.value = "";
        }}
        title={`Version history · ${versionsDocument?.title || ""}`}
        subtitle={`Current version v${versionsDocument?.version || 1}. Restoring creates a new version and preserves this history.`}
        icon={faHistory}
        maxWidth="2xl"
      >
        <div className="space-y-5">
          {versionError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{versionError}</p>}
          {versions.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
              {actionBusy ? "Loading version history…" : "No version history is available."}
            </p>
          ) : (
            <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {[...versions].sort((a, b) => b.version - a.version).map((version) => (
                <li key={version.version} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">Version {version.version}{version.version === versionsDocument?.version ? " · Current" : ""}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{version.fileName} · {formatBytes(version.fileSize)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {version.changeNote || "No change note"} · {personName(version.uploadedBy) || "Uploader"} · {formatDate(version.uploadedAt)}
                    </p>
                  </div>
                  <span className="flex shrink-0 flex-wrap gap-1">
                    <Button
                      size="xs"
                      variant="ghost"
                      icon={faEye}
                      disabled={versionBusy}
                      onClick={() => versionsDocument && void openFile({
                        ...versionsDocument,
                        fileName: version.fileName,
                        fileUrl: version.fileUrl,
                        fileSize: version.fileSize,
                      })}
                    >
                      Preview
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      icon={faDownload}
                      disabled={versionBusy}
                      onClick={() => versionsDocument && void openFile({
                        ...versionsDocument,
                        fileName: version.fileName,
                        fileUrl: version.fileUrl,
                        fileSize: version.fileSize,
                      }, true)}
                    >
                      Download
                    </Button>
                    {version.version !== versionsDocument?.version && versionsDocument && !versionsDocument.sourceType && canManageDocument(versionsDocument) && (
                      <Button size="sm" variant="outline" icon={faRotateLeft} disabled={versionBusy} onClick={() => void restoreVersion(version.version)}>Restore as new version</Button>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {versionsDocument && !versionsDocument.sourceType && canManageDocument(versionsDocument) && !versionsDocument.archived && (
            <form onSubmit={(event) => void uploadVersion(event)} className="space-y-3 rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-800">Upload a new version</h3>
              <input ref={versionInput} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={(event) => setVersionFile(event.target.files?.[0] || null)} />
              <label className={LABEL_CLASS}>
                Change note
                <input className={FIELD_CLASS} maxLength={500} value={versionNote} onChange={(event) => setVersionNote(event.target.value)} />
              </label>
              {versionBusy && (
                <div>
                  <div className="mb-1 flex justify-between text-xs text-slate-600">
                    <span>Uploading version…</span>
                    <span>{versionProgress}%</span>
                  </div>
                  <div role="progressbar" aria-label="Version upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={versionProgress} className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{ width: `${versionProgress}%` }} />
                  </div>
                </div>
              )}
              <Button type="submit" icon={faUpload} isLoading={versionBusy} loadingLabel="Uploading…">Upload version</Button>
            </form>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(moveDocument)}
        onClose={() => setMoveDocument(null)}
        title={`Move · ${moveDocument?.title || ""}`}
        subtitle="Choose a destination. Documents can be moved back to the root folder."
        icon={faFolderOpen}
        footer={
          <>
            <Button variant="outline" onClick={() => setMoveDocument(null)}>Cancel</Button>
            <Button type="submit" form="move-document-form" isLoading={actionBusy} loadingLabel="Moving…">Move document</Button>
          </>
        }
      >
        <form id="move-document-form" onSubmit={(event) => void saveMove(event)}>
          <label className={LABEL_CLASS}>
            Destination folder
            <select className={FIELD_CLASS} value={moveFolder} onChange={(event) => setMoveFolder(event.target.value)}>
              <option value="">Root folder</option>
              {folders.map((folder) => <option key={folder._id} value={folder._id}>{folder.name}</option>)}
            </select>
          </label>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(accessDocument)}
        onClose={() => setAccessDocument(null)}
        title={`Access settings · ${accessDocument?.title || ""}`}
        subtitle="Set the access level enforced by the document API."
        icon={faLock}
        footer={
          <>
            <Button variant="outline" onClick={() => setAccessDocument(null)}>Cancel</Button>
            <Button type="submit" form="document-access-form" isLoading={actionBusy} loadingLabel="Saving…">Save access</Button>
          </>
        }
      >
        <form id="document-access-form" onSubmit={(event) => void saveAccess(event)} className="space-y-4">
          <label className={LABEL_CLASS}>
            Access level
            <select className={FIELD_CLASS} value={accessLevel} onChange={(event) => setAccessLevel(event.target.value as AccessLevel)}>
              {ACCESS_LEVELS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {accessLevel === "department" && (
            <label className={LABEL_CLASS}>
              Department
              <input className={FIELD_CLASS} required maxLength={120} list="access-department-options" value={accessDepartment} onChange={(event) => setAccessDepartment(event.target.value)} />
              <datalist id="access-department-options">{departmentOptions.map((department) => <option key={department} value={department} />)}</datalist>
            </label>
          )}
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(archiveDocument)}
        onClose={() => setArchiveDocument(null)}
        title="Archive this document?"
        subtitle="The document will leave active lists but remain stored and can be restored by an authorized user."
        icon={faArchive}
        footer={
          <>
            <Button variant="outline" onClick={() => setArchiveDocument(null)}>Cancel</Button>
            <Button variant="danger" isLoading={actionBusy} loadingLabel="Archiving…" onClick={() => void archive()}>Archive document</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">{archiveDocument?.title}</p>
      </Modal>

      <Modal
        isOpen={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.title || "Document preview"}
        subtitle={preview?.contentType || "Preview"}
        icon={faEye}
        maxWidth="4xl"
        footer={
          <>
            {preview && (
              <Button
                variant="outline"
                icon={faDownload}
                onClick={() => {
                  const link = window.document.createElement("a");
                  link.href = preview.url;
                  link.download = preview.title;
                  link.click();
                }}
              >
                Download
              </Button>
            )}
            <Button variant="outline" onClick={() => setPreview(null)}>Close</Button>
          </>
        }
      >
        {preview?.contentType.includes("pdf") ? (
          <iframe title={preview.title} src={preview.url} className="h-[65vh] w-full rounded-lg border border-slate-200" />
        ) : preview?.contentType.startsWith("image/") ? (
          <div className="flex max-h-[65vh] justify-center overflow-auto rounded-lg bg-slate-50 p-3">
            <img src={preview.url} alt={preview.title} className="h-auto max-w-full object-contain" />
          </div>
        ) : (
          <div className="rounded-lg bg-slate-50 p-6 text-center">
            <p className="text-sm text-slate-600">This file type cannot be previewed in the browser.</p>
            <p className="mt-1 text-xs text-slate-500">Use Download to open it with a compatible application.</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SmartDocumentCentreView;
