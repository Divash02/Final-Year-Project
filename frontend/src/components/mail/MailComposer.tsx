import React, { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPaperPlane,
  faPaperclip,
  faChevronUp,
  faChevronDown,
  faTrash,
  faUndo,
  faRedo,
  faImage,
  faTimes,
  faUpload,
  faPen,
  faBold,
  faItalic,
  faUnderline,
  faPalette,
  faEnvelope,
} from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FormField } from "../ui/Input";
import { Alert } from "../ui/Alert";
import { apiRequest, resolveAssetUrl } from "../../services/apiClient";

type RecipientContact = {
  id?: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  department?: string | null;
  designation?: string | null;
  role?: string;
  source: "directory" | "manual";
};

type RecipientBucket = "to" | "cc" | "bcc";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const initialsFor = (name: string, email: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1
    ? `${words[0][0]}${words[words.length - 1][0]}`
    : words[0]?.slice(0, 2) || email.slice(0, 2)
  ).toUpperCase();
};

const RecipientField: React.FC<{
  id: string;
  label: string;
  placeholder: string;
  contacts: RecipientContact[];
  onAdd: (contact: RecipientContact) => boolean;
  onRemove: (email: string) => void;
}> = ({ id, label, placeholder, contacts, onAdd, onRemove }) => {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<RecipientContact[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [inputError, setInputError] = useState("");

  useEffect(() => {
    const search = query.trim();
    if (search.length < 2) {
      setSuggestions([]);
      setLoading(false);
      setSearchError("");
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    setOpen(true);
    setSearchError("");
    setLoading(true);
    const timer = window.setTimeout(() => {
      void apiRequest<{ suggestions: RecipientContact[] }>(
        `/mail/recipients/suggest?q=${encodeURIComponent(search)}`,
        { signal: controller.signal },
      )
        .then((result) => {
          setSuggestions(result.suggestions);
          setActiveIndex(-1);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setSuggestions([]);
          setSearchError(
            error instanceof Error
              ? error.message
              : "Could not search CollegeOS contacts. Try again.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const addManualAddress = () => {
    const email = query.trim().replace(/,$/, "").toLowerCase();
    if (!email) return false;
    if (!EMAIL_PATTERN.test(email)) {
      setInputError("Enter a valid email address.");
      return false;
    }
    const registered = suggestions.find(
      (contact) => contact.email.toLowerCase() === email,
    );
    const added = onAdd(
      registered || { name: email, email, source: "manual" },
    );
    if (!added) {
      setInputError("This recipient is already included.");
      return false;
    }
    setQuery("");
    setSuggestions([]);
    setInputError("");
    setOpen(false);
    return true;
  };

  const selectContact = (contact: RecipientContact) => {
    if (!onAdd(contact)) {
      setInputError("This recipient is already included.");
      return;
    }
    setQuery("");
    setSuggestions([]);
    setInputError("");
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setActiveIndex((index) =>
        index <= 0 ? suggestions.length - 1 : index - 1,
      );
    } else if (event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      if (open && activeIndex >= 0 && suggestions[activeIndex]) {
        selectContact(suggestions[activeIndex]);
      } else {
        addManualAddress();
      }
    }
  };

  return (
    <div>
      <div
        className="relative flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 focus-within:border-[var(--color-mail-primary)] focus-within:ring-2 focus-within:ring-[var(--color-mail-primary)]/20"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setOpen(false);
          }
        }}
      >
        {contacts.map((contact) => (
          <span
            key={contact.email}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-surface-muted px-2.5 py-1 text-xs text-slate-700 dark:text-dark-text-secondary"
          >
            <span className="max-w-[16rem] truncate">
              {contact.source === "directory" && contact.name !== contact.email
                ? `${contact.name} · `
                : ""}
              {contact.email}
            </span>
            {contact.source === "manual" && (
              <span className="shrink-0 rounded bg-slate-200 dark:bg-dark-border px-1.5 text-[10px] text-slate-600 dark:text-dark-text-muted">
                Manual
              </span>
            )}
            <button
              type="button"
              onClick={() => onRemove(contact.email)}
              aria-label={`Remove ${contact.email} from ${label}`}
              className="ml-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-500 dark:text-dark-text-muted hover:bg-slate-200 dark:hover:bg-dark-border hover:text-slate-800 dark:hover:text-dark-text-primary"
            >
              <FontAwesomeIcon icon={faTimes} className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <input
          id={id}
          name={id}
          type="text"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setInputError("");
          }}
          onFocus={() => {
            if (query.trim().length >= 2) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={contacts.length ? "Add another recipient" : placeholder}
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-suggestions`}
          aria-activedescendant={
            activeIndex >= 0 ? `${id}-suggestion-${activeIndex}` : undefined
          }
          className="min-w-[12rem] flex-1 border-0 bg-transparent py-1 text-sm text-slate-900 dark:text-dark-text-primary outline-none placeholder:text-slate-400 dark:placeholder:text-dark-text-muted"
        />
        {open && query.trim().length >= 2 && (
          <div
            id={`${id}-suggestions`}
            role="listbox"
            aria-label={`${label} contact suggestions`}
            className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-lg"
          >
            {loading ? (
              <div className="px-3 py-4 text-center text-sm text-slate-500 dark:text-dark-text-muted" role="status">
                Searching CollegeOS contacts…
              </div>
            ) : searchError ? (
              <div className="px-3 py-4 text-center text-sm text-rose-600 dark:text-rose-400" role="status">
                {searchError}
              </div>
            ) : suggestions.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-slate-500 dark:text-dark-text-muted" role="status">
                No matching registered contacts. You can still add a valid email address by pressing Enter.
              </div>
            ) : (
              suggestions.map((contact, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  id={`${id}-suggestion-${index}`}
                  key={contact.id || contact.email}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectContact(contact)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition ${
                    index === activeIndex
                      ? "bg-[var(--color-mail-primary-soft)]"
                      : "hover:bg-slate-50 dark:hover:bg-dark-surface-muted"
                  }`}
                >
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 dark:bg-dark-surface-muted text-sm font-semibold text-blue-800 dark:text-dark-primary">
                    {initialsFor(contact.name, contact.email)}
                    {contact.avatarUrl && (
                      <img
                        src={resolveAssetUrl(contact.avatarUrl)}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900 dark:text-dark-text-primary">
                      {contact.name}
                    </span>
                    <span className="block truncate text-xs text-slate-600 dark:text-dark-text-muted">
                      {contact.email}
                    </span>
                    {(contact.department || contact.designation || contact.role) && (
                      <span className="block truncate text-[11px] text-slate-500 dark:text-dark-text-muted">
                        {[contact.department, contact.designation || contact.role]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                    CollegeOS
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {(inputError || (query.trim().length > 0 && query.trim().length < 2)) && (
        <p className="mt-1 text-xs text-rose-600 dark:text-rose-400" role="status">
          {inputError || "Type at least 2 characters to search contacts."}
        </p>
      )}
      {!inputError && (
        <p className="mt-1 text-xs text-slate-500 dark:text-dark-text-muted">
          Type a name or email, then press Enter to add a manual address.
        </p>
      )}
    </div>
  );
};

export interface MailComposerProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (payload: {
    recipientEmail: string;
    recipientEmails: string[];
    ccEmails: string[];
    bccEmails: string[];
    subject: string;
    body: string;
    attachments: File[];
  }) => Promise<void>;
  initialRecipient?: string;
  initialSubject?: string;
  initialBody?: string;
}

export const MailComposer: React.FC<MailComposerProps> = ({
  isOpen,
  onClose,
  onSend,
  initialRecipient = "",
  initialSubject = "",
  initialBody = "",
}) => {
  const [toRecipients, setToRecipients] = useState<RecipientContact[]>([]);
  const [ccRecipients, setCcRecipients] = useState<RecipientContact[]>([]);
  const [bccRecipients, setBccRecipients] = useState<RecipientContact[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [signature, setSignature] = useState("");
  const [signatureImageUrl, setSignatureImageUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [includeHandwritten, setIncludeHandwritten] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [drawing, setDrawing] = useState(false);
  const [strokes, setStrokes] = useState<ImageData[]>([]);
  const [redoStack, setRedoStack] = useState<ImageData[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const signatureImageInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const signatureEditorRef = useRef<HTMLDivElement>(null);
  const signatureRangeRef = useRef<Range | null>(null);
  const [signatureColor, setSignatureColor] = useState("#000000");
  const [signatureFormats, setSignatureFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
  });

  const updateSignatureFormats = useCallback(() => {
    const editor = signatureEditorRef.current;
    const selection = window.getSelection();
    if (
      !editor ||
      !selection?.anchorNode ||
      !editor.contains(selection.anchorNode)
    ) {
      setSignatureFormats({ bold: false, italic: false, underline: false });
      return;
    }

    if (selection.rangeCount > 0) {
      signatureRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
    setSignatureFormats({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setToRecipients(
      initialRecipient
        ? [{ name: initialRecipient, email: initialRecipient, source: "manual" }]
        : [],
    );
    setCcRecipients([]);
    setBccRecipients([]);
    setShowCc(false);
    setShowBcc(false);
    setSubject(initialSubject);
    setAttachments([]);
    setError("");
    setMessage("");
    let cancelled = false;
    (async () => {
      try {
        const data = await apiRequest<{ signature: string | null }>("/users/me/signature");
        const prof = await apiRequest<{ profile: { signature_image_url?: string | null } }>("/profile/me").catch(() => ({ profile: { signature_image_url: null } }));
        if (cancelled) return;
        const sig = data.signature || "";
        const imgUrl = prof.profile?.signature_image_url || null;
        setSignature(sig);
        setSignatureImageUrl(imgUrl);
        if (signatureEditorRef.current) {
          signatureEditorRef.current.innerHTML = sig;
          signatureRangeRef.current = null;
        }
        if (editorRef.current) {
          const base = initialBody || "";
          const imgHtml = imgUrl ? `<br><img src="${imgUrl}" style="max-height:60px;" />` : "";
          editorRef.current.innerHTML = base || (sig ? `${sig}${imgHtml}` : (imgUrl ? imgHtml : ""));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load signature");
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, initialRecipient, initialSubject, initialBody]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("selectionchange", updateSignatureFormats);
    return () =>
      document.removeEventListener("selectionchange", updateSignatureFormats);
  }, [isOpen, updateSignatureFormats]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!toRecipients.length) {
      setError("Add at least one recipient in the To field.");
      return;
    }
    const allRecipients = [...toRecipients, ...ccRecipients, ...bccRecipients];
    if (allRecipients.some(({ email }) => !EMAIL_PATTERN.test(email))) {
      setError("Enter a valid email address for each recipient.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const content = editorRef.current?.innerHTML || body;
      const img = includeHandwritten && signatureImageUrl ? `<br><img src="${signatureImageUrl}" style="max-height:60px;" />` : "";
      const separator = signature ? "<br><hr style='border:none;border-top:1px solid #cbd5e1;margin:0.5rem 0;' /><br>" : "";
      const finalBody = signature ? `${content}${separator}${signature}${img}` : (img ? `${content}${img}` : content);
      await onSend({
        recipientEmail: toRecipients[0].email,
        recipientEmails: toRecipients.map(({ email }) => email),
        ccEmails: ccRecipients.map(({ email }) => email),
        bccEmails: bccRecipients.map(({ email }) => email),
        subject,
        body: finalBody,
        attachments,
      });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not send this mail.");
    } finally {
      setBusy(false);
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    setAttachments((prev) => [...prev, ...Array.from(files)]);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(e);
    if (!point) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.strokeStyle = signatureColor;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    setDrawing(true);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const point = getCanvasPoint(e);
    if (!point) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const endDraw = () => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    setStrokes((prev) => [...prev, ctx.getImageData(0, 0, canvas.width, canvas.height)]);
    setRedoStack([]);
    setDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setStrokes([]);
    setRedoStack([]);
  };

  const undo = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || strokes.length === 0 || !canvasRef.current) return;
    const newStrokes = strokes.slice(0, -1);
    setRedoStack((r) => [...r, strokes[strokes.length - 1]]);
    setStrokes(newStrokes);
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    if (newStrokes.length > 0) ctx.putImageData(newStrokes[newStrokes.length - 1], 0, 0);
  };

  const redo = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || redoStack.length === 0 || !canvasRef.current) return;
    const img = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setStrokes((s) => [...s, img]);
    ctx.putImageData(img, 0, 0);
  };

  const saveDrawing = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    const file = new File([blob], "signature.png", { type: "image/png" });
    const form = new FormData();
    form.append("file", file);
    setUploading(true);
    try {
      const res = await apiRequest<{ imageUrl: string }>("/users/me/signature/image", { method: "POST", body: form });
      setSignatureImageUrl(res.imageUrl);
      setMessage("Handwritten signature saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to save handwritten signature.");
    } finally {
      setUploading(false);
    }
  };

  const clearHandwritten = async () => {
    if (!window.confirm("Remove your saved handwritten signature?")) return;
    setUploading(true);
    try {
      await apiRequest("/users/me/signature/image", { method: "DELETE" });
      setSignatureImageUrl(null);
      setMessage("Handwritten signature removed.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to remove handwritten signature.");
    } finally {
      setUploading(false);
    }
  };

  const addRecipient = (
    bucket: RecipientBucket,
    contact: RecipientContact,
  ) => {
    const email = contact.email.trim().toLowerCase();
    const duplicate = [...toRecipients, ...ccRecipients, ...bccRecipients].some(
      (recipient) => recipient.email.toLowerCase() === email,
    );
    if (duplicate) return false;
    const normalized = { ...contact, email };
    if (bucket === "to") setToRecipients((current) => [...current, normalized]);
    if (bucket === "cc") setCcRecipients((current) => [...current, normalized]);
    if (bucket === "bcc") setBccRecipients((current) => [...current, normalized]);
    return true;
  };

  const removeRecipient = (bucket: RecipientBucket, email: string) => {
    const remove = (current: RecipientContact[]) =>
      current.filter(
        (contact) => contact.email.toLowerCase() !== email.toLowerCase(),
      );
    if (bucket === "to") setToRecipients(remove);
    if (bucket === "cc") setCcRecipients(remove);
    if (bucket === "bcc") setBccRecipients(remove);
  };

  const execSignature = (cmd: string, value?: string) => {
    const editor = signatureEditorRef.current;
    const selection = window.getSelection();
    const savedRange = signatureRangeRef.current;
    if (
      editor &&
      savedRange &&
      editor.contains(savedRange.commonAncestorContainer) &&
      selection
    ) {
      editor.focus();
      selection.removeAllRanges();
      selection.addRange(savedRange);
    }
    document.execCommand(cmd, false, value);
    if (editor) setSignature(editor.innerHTML);
    updateSignatureFormats();
  };

  const saveSignature = async () => {
    setUploading(true);
    setMessage("");
    try {
      const html = (signatureEditorRef.current?.innerHTML || signature).trim();
      setSignature(html);
      await apiRequest("/users/me/signature", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: html === "" ? null : html }),
      });
      setMessage("Email signature saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to save email signature.");
    } finally {
      setUploading(false);
    }
  };

  const clearSignature = async () => {
    if (!window.confirm("Remove your email signature?")) return;
    setUploading(true);
    setSignature("");
    if (signatureEditorRef.current) {
      signatureEditorRef.current.innerHTML = "";
      signatureRangeRef.current = null;
    }
    setSignatureFormats({ bold: false, italic: false, underline: false });
    try {
      await apiRequest("/users/me/signature", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: null }),
      });
      setMessage("Email signature removed.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to remove email signature.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Compose College Mail"
      icon={faEnvelope}
      maxWidth="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="mail-composer-form"
            icon={faPaperPlane}
            isLoading={busy}
            loadingLabel="Sending..."
          >
            Send mail
          </Button>
        </>
      }
    >
      <form id="mail-composer-form" onSubmit={submit} noValidate className="space-y-5">
        {error && <Alert variant="error">{error}</Alert>}
        <FormField label="To" required>
          {({ id }) => (
            <RecipientField
              id={id}
              label="To"
              placeholder="Search name or email"
              contacts={toRecipients}
              onAdd={(contact) => addRecipient("to", contact)}
              onRemove={(email) => removeRecipient("to", email)}
            />
          )}
        </FormField>
        <div className="-mt-3 flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => setShowCc((visible) => !visible)}
            aria-expanded={showCc}
            className="font-medium text-[var(--color-mail-primary)] hover:underline hover:text-[var(--color-mail-primary-strong)] transition"
          >
            {showCc ? "Hide Cc" : "Add Cc"}
          </button>
          <button
            type="button"
            onClick={() => setShowBcc((visible) => !visible)}
            aria-expanded={showBcc}
            className="font-medium text-[var(--color-mail-primary)] hover:underline hover:text-[var(--color-mail-primary-strong)] transition"
          >
            {showBcc ? "Hide Bcc" : "Add Bcc"}
          </button>
        </div>
        {showCc && (
          <FormField label="Cc">
            {({ id }) => (
              <RecipientField
                id={id}
                label="Cc"
                placeholder="Search name or email"
                contacts={ccRecipients}
                onAdd={(contact) => addRecipient("cc", contact)}
                onRemove={(email) => removeRecipient("cc", email)}
              />
            )}
          </FormField>
        )}
        {showBcc && (
          <FormField label="Bcc">
            {({ id }) => (
              <RecipientField
                id={id}
                label="Bcc"
                placeholder="Search name or email"
                contacts={bccRecipients}
                onAdd={(contact) => addRecipient("bcc", contact)}
                onRemove={(email) => removeRecipient("bcc", email)}
              />
            )}
          </FormField>
        )}
        <FormField label="Subject" required>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              name="subject"
              type="text"
              required
              maxLength={180}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className="cos-input"
            />
          )}
        </FormField>
        <div className="cos-input min-h-[20rem] resize-y leading-relaxed mail-composer-editor dark:bg-dark-surface dark:text-dark-text-primary" ref={editorRef} contentEditable onInput={() => setBody(editorRef.current?.innerHTML || "")} data-placeholder="Write your message here…" />

        <div className="border border-slate-200 dark:border-dark-border rounded-xl overflow-hidden">
          <div
            className="flex items-center justify-between border-b border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-surface-muted px-3 py-2 cursor-pointer select-none"
            onClick={() => setExpanded(!expanded)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setExpanded(!expanded);
              }
            }}
          >
            <h3 className="text-sm font-semibold text-[var(--color-mail-text-primary)] flex items-center gap-2">
              <FontAwesomeIcon icon={faPen} className="text-[var(--color-mail-primary)]" /> Handwritten Signature
            </h3>
            <FontAwesomeIcon
              icon={expanded ? faChevronUp : faChevronDown}
              className="text-slate-400 dark:text-dark-text-muted"
            />
          </div>
          {expanded && (
            <div className="px-3 py-3 space-y-3">
              <p className="text-xs text-slate-500 dark:text-dark-text-muted">
                Draw, upload, or reuse your saved handwritten signature.
              </p>

              <div className="border border-slate-200 dark:border-dark-border rounded-lg p-2">
                <p className="text-xs text-slate-500 dark:text-dark-text-muted mb-1">Preview</p>
                {signatureImageUrl ? (
                  <img src={signatureImageUrl} alt="Saved handwritten signature" className="max-h-24 block bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border rounded p-1" />
                ) : (
                  <p className="text-xs text-slate-400 dark:text-dark-text-muted">No handwritten signature saved.</p>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <input id="include-handwritten" type="checkbox" checked={includeHandwritten} onChange={(e) => setIncludeHandwritten(e.target.checked)} className="mt-0.5" />
                  <label htmlFor="include-handwritten" className="text-sm text-slate-700 dark:text-dark-text-secondary cursor-pointer">Include handwritten signature in outgoing mail</label>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-dark-border rounded-lg p-2">
                <p className="text-xs text-slate-500 dark:text-dark-text-muted mb-2">Draw your signature</p>
                <canvas ref={canvasRef} width={400} height={150} className="border border-slate-300 dark:border-dark-border rounded bg-white dark:bg-dark-surface w-full" style={{ touchAction: "none" }}
                  onPointerDown={startDraw} onPointerMove={draw} onPointerUp={endDraw} onPointerLeave={endDraw} />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="text-xs text-slate-600 dark:text-dark-text-muted">Stroke</label>
                  <input type="range" min={1} max={6} value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} className="w-20" />
                  <button type="button" onClick={clearCanvas} disabled={strokes.length === 0} className="rounded bg-slate-200 dark:bg-dark-border px-2 py-1 text-xs text-slate-600 dark:text-dark-text-muted hover:bg-slate-300 dark:hover:bg-dark-border disabled:opacity-50 disabled:cursor-not-allowed">Clear</button>
                  <button type="button" onClick={undo} disabled={strokes.length === 0} className="rounded bg-slate-200 dark:bg-dark-border px-2 py-1 text-xs text-slate-600 dark:text-dark-text-muted hover:bg-slate-300 dark:hover:bg-dark-border disabled:opacity-50 disabled:cursor-not-allowed">
                    <FontAwesomeIcon icon={faUndo} className="w-3 h-3" /> Undo
                  </button>
                  <button type="button" onClick={redo} disabled={redoStack.length === 0} className="rounded bg-slate-200 dark:bg-dark-border px-2 py-1 text-xs text-slate-600 dark:text-dark-text-muted hover:bg-slate-300 dark:hover:bg-dark-border disabled:opacity-50 disabled:cursor-not-allowed">
                    <FontAwesomeIcon icon={faRedo} className="w-3 h-3" /> Redo
                  </button>
                </div>
              </div>

              <div className="border border-dashed border-slate-300 dark:border-dark-border rounded-lg p-3 bg-slate-50/50 dark:bg-dark-surface-muted/50">
                <p className="text-xs text-slate-500 dark:text-dark-text-muted mb-2">Or upload an image of your signature</p>
                <button type="button" onClick={() => signatureImageInputRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-2 rounded bg-[var(--color-mail-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-mail-primary-strong)] disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-mail-primary)]/20 focus-visible:ring-offset-1">
                  <FontAwesomeIcon icon={faUpload} className="w-3 h-3" />
                  {uploading ? "Uploading…" : "Upload Signature Image"}
                </button>
                <input ref={signatureImageInputRef} type="file" accept="image/png,image/jpeg,image/jpg" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  try {
                    const form = new FormData();
                    form.append("file", file);
                    const res = await apiRequest<{ imageUrl: string }>("/users/me/signature/image", { method: "POST", body: form });
                    setSignatureImageUrl(res.imageUrl);
                    setMessage("Handwritten signature saved.");
                  } catch (err) {
                    setMessage(err instanceof Error ? err.message : "Failed to upload signature image.");
                  } finally {
                    setUploading(false);
                  }
                }} />
                {signatureImageUrl && (
                  <button type="button" onClick={clearHandwritten} className="mt-2 rounded bg-slate-200 dark:bg-dark-border px-2 py-1 text-xs text-slate-600 dark:text-dark-text-muted hover:bg-slate-300 dark:hover:bg-dark-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dark-border">
                    Clear Signature
                  </button>
                )}
              </div>

              <div className="flex justify-end">
                <Button onClick={saveDrawing} isLoading={uploading} disabled={uploading || strokes.length === 0} className="text-xs">
                  Save Handwritten Signature
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="border border-slate-200 dark:border-dark-border rounded-xl overflow-hidden">
          <div className="border-b border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-surface-muted px-3 py-2">
            <h3 className="text-sm font-semibold text-[var(--color-mail-text-primary)] flex items-center gap-2">
              <FontAwesomeIcon icon={faImage} className="text-[var(--color-mail-primary)]" /> Email Signature
            </h3>
          </div>
          <div className="px-3 py-3 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 dark:border-dark-border pb-2">
              <button
                type="button"
                title="Bold"
                aria-label="Bold"
                aria-pressed={signatureFormats.bold}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => execSignature("bold")}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-mail-primary)] ${
                  signatureFormats.bold
                    ? "bg-[var(--color-mail-primary)] text-white shadow-sm"
                    : "bg-slate-100 dark:bg-dark-border text-slate-700 dark:text-dark-text-secondary hover:bg-slate-200 dark:hover:bg-dark-border"
                }`}
              >
                <FontAwesomeIcon icon={faBold} aria-hidden="true" />
              </button>
              <button
                type="button"
                title="Italic"
                aria-label="Italic"
                aria-pressed={signatureFormats.italic}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => execSignature("italic")}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-mail-primary)] ${
                  signatureFormats.italic
                    ? "bg-[var(--color-mail-primary)] text-white shadow-sm"
                    : "bg-slate-100 dark:bg-dark-border text-slate-700 dark:text-dark-text-secondary hover:bg-slate-200 dark:hover:bg-dark-border"
                }`}
              >
                <FontAwesomeIcon icon={faItalic} aria-hidden="true" />
              </button>
              <button
                type="button"
                title="Underline"
                aria-label="Underline"
                aria-pressed={signatureFormats.underline}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => execSignature("underline")}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-mail-primary)] ${
                  signatureFormats.underline
                    ? "bg-[var(--color-mail-primary)] text-white shadow-sm"
                    : "bg-slate-100 dark:bg-dark-border text-slate-700 dark:text-dark-text-secondary hover:bg-slate-200 dark:hover:bg-dark-border"
                }`}
              >
                <FontAwesomeIcon icon={faUnderline} aria-hidden="true" />
              </button>
              <input type="color" value={signatureColor} onChange={(e) => { setSignatureColor(e.target.value); execSignature("foreColor", e.target.value); }} className="h-6 w-6 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-mail-primary)]" title="Text color" />
            </div>
            <div
              ref={signatureEditorRef}
              contentEditable
              dir="ltr"
              role="textbox"
              aria-label="Email signature"
              aria-multiline="true"
              spellCheck
              className="min-h-[6rem] max-h-[12rem] resize-y overflow-y-auto rounded-lg border border-slate-300 dark:border-dark-border p-2 text-left leading-relaxed [direction:ltr] bg-white dark:bg-dark-surface text-slate-900 dark:text-dark-text-primary"
              onInput={() => {
                setSignature(signatureEditorRef.current?.innerHTML || "");
                updateSignatureFormats();
              }}
              onKeyUp={updateSignatureFormats}
              onMouseUp={updateSignatureFormats}
              onFocus={updateSignatureFormats}
            />
            <div className="flex gap-2">
              <Button onClick={saveSignature} isLoading={uploading} className="text-xs">Save Signature</Button>
              <Button variant="secondary" onClick={clearSignature} disabled={signature === ""} className="text-xs">Clear Signature</Button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-mail-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-mail-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-mail-primary)]/20 focus-visible:ring-offset-1 active:scale-[0.98] transition">
            <FontAwesomeIcon icon={faPaperclip} className="w-3 h-3" /> Attach files
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        </div>
        {attachments.length > 0 && (
          <ul className="space-y-1 text-sm">
            {attachments.map((file, index) => (
              <li key={index} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-dark-border px-3 py-2 bg-white dark:bg-dark-surface">
                <span className="truncate text-slate-700 dark:text-dark-text-secondary">{file.name} ({Math.round(file.size / 1024)} KB)</span>
                <button type="button" onClick={() => removeAttachment(index)} className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300"><FontAwesomeIcon icon={faTimes} className="w-3 h-3" /> Remove</button>
              </li>
            ))}
          </ul>
        )}
        {message && <p className="text-xs text-slate-500 dark:text-dark-text-muted">{message}</p>}
      </form>
    </Modal>
  );
};

export default MailComposer;
