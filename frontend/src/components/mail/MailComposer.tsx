import React, { useEffect, useRef, useState } from "react";
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
} from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FormField } from "../ui/Input";
import { Alert } from "../ui/Alert";
import { apiRequest } from "../../services/apiClient";

export interface MailComposerProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (payload: { recipientEmail: string; subject: string; body: string; attachments: File[] }) => Promise<void>;
  initialRecipient?: string;
  initialSubject?: string;
  initialBody?: string;
}

export const MailComposer: React.FC<MailComposerProps> = ({ isOpen, onClose, onSend, initialRecipient = "", initialSubject = "", initialBody = "" }) => {
  const [recipientEmail, setRecipientEmail] = useState(initialRecipient);
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
  const [expanded, setExpanded] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [drawing, setDrawing] = useState(false);
  const [strokes, setStrokes] = useState<ImageData[]>([]);
  const [redoStack, setRedoStack] = useState<ImageData[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const signatureImageInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const signatureEditorRef = useRef<HTMLDivElement>(null);
  const [signatureColor, setSignatureColor] = useState("#000000");

  useEffect(() => {
    if (!isOpen) return;
    setRecipientEmail(initialRecipient);
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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const content = editorRef.current?.innerHTML || body;
      const img = includeHandwritten && signatureImageUrl ? `<br><img src="${signatureImageUrl}" style="max-height:60px;" />` : "";
      const separator = signature ? "<br><hr style='border:none;border-top:1px solid #cbd5e1;margin:0.5rem 0;' /><br>" : "";
      const finalBody = signature ? `${content}${separator}${signature}${img}` : (img ? `${content}${img}` : content);
      await onSend({ recipientEmail: recipientEmail.trim(), subject, body: finalBody, attachments });
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

  const execSignature = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    signatureEditorRef.current?.focus();
    setSignature(signatureEditorRef.current?.innerHTML || "");
  };

  const saveSignature = async () => {
    setUploading(true);
    setMessage("");
    try {
      const html = signature.trim();
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
    <Modal isOpen={isOpen} onClose={onClose} title="Compose College Mail" subtitle="Formal institutional correspondence" maxWidth="lg" footer={
      <>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="submit" form="mail-composer-form" icon={faPaperPlane} isLoading={busy} loadingLabel="Sending...">Send mail</Button>
      </>
    }>
      <form id="mail-composer-form" onSubmit={submit} noValidate className="space-y-5">
        {error && <Alert variant="error">{error}</Alert>}
        <FormField label="Recipient" required>
          {({ id, describedBy, invalid }) => (
            <input id={id} name="recipient" type="email" required autoComplete="off" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="name@techspire.edu.np" aria-describedby={describedBy} aria-invalid={invalid || undefined} className="cos-input" />
          )}
        </FormField>
        <FormField label="Subject" required>
          {({ id, describedBy, invalid }) => (
            <input id={id} name="subject" type="text" required maxLength={180} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" aria-describedby={describedBy} aria-invalid={invalid || undefined} className="cos-input" />
          )}
        </FormField>
        <div className="cos-input min-h-[12rem] resize-y leading-relaxed" ref={editorRef} contentEditable onInput={() => setBody(editorRef.current?.innerHTML || "")} />

        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 cursor-pointer select-none" onClick={() => setExpanded(!expanded)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); } }}>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <FontAwesomeIcon icon={faPen} className="text-[var(--color-primary)]" /> Handwritten Signature
            </h3>
            <FontAwesomeIcon icon={expanded ? faChevronUp : faChevronDown} className="text-slate-400" />
          </div>
          {expanded && (
            <div className="px-3 py-3 space-y-3">
              <p className="text-xs text-slate-500">Draw, upload, or reuse your saved handwritten signature.</p>

              <div className="border border-slate-200 rounded p-2">
                <p className="text-xs text-slate-500 mb-1">Preview</p>
                {signatureImageUrl ? (
                  <img src={signatureImageUrl} alt="Saved handwritten signature" className="max-h-24 block bg-white border border-slate-200 rounded p-1" />
                ) : (
                  <p className="text-xs text-slate-400">No handwritten signature saved.</p>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <input id="include-handwritten" type="checkbox" checked={includeHandwritten} onChange={(e) => setIncludeHandwritten(e.target.checked)} className="mt-0.5" />
                  <label htmlFor="include-handwritten" className="text-sm text-slate-700 cursor-pointer">Include handwritten signature in outgoing mail</label>
                </div>
              </div>

              <div className="border border-slate-200 rounded p-2">
                <p className="text-xs text-slate-500 mb-2">Draw your signature</p>
                <canvas ref={canvasRef} width={400} height={150} className="border border-slate-300 rounded bg-white w-full" style={{ touchAction: "none" }}
                  onPointerDown={startDraw} onPointerMove={draw} onPointerUp={endDraw} onPointerLeave={endDraw} />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="text-xs text-slate-600">Stroke</label>
                  <input type="range" min={1} max={6} value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} className="w-20" />
                  <button type="button" onClick={clearCanvas} disabled={strokes.length === 0} className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed">Clear</button>
                  <button type="button" onClick={undo} disabled={strokes.length === 0} className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed">
                    <FontAwesomeIcon icon={faUndo} className="w-3 h-3" /> Undo
                  </button>
                  <button type="button" onClick={redo} disabled={redoStack.length === 0} className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed">
                    <FontAwesomeIcon icon={faRedo} className="w-3 h-3" /> Redo
                  </button>
                </div>
              </div>

              <div className="border border-dashed border-slate-300 rounded p-3 bg-slate-50/50">
                <p className="text-xs text-slate-500 mb-2">Or upload an image of your signature</p>
                <button type="button" onClick={() => signatureImageInputRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-2 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1">
                  <FontAwesomeIcon icon={faUpload} className="w-3 h-3" />
                  {uploading ? "Uploading..." : "Upload Signature Image"}
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
                  <button type="button" onClick={clearHandwritten} className="mt-2 rounded bg-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">Clear Signature</button>
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

        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <FontAwesomeIcon icon={faImage} className="text-[var(--color-primary)]" /> Email Signature
            </h3>
          </div>
          <div className="px-3 py-3 space-y-2">
            <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
              <button type="button" onClick={() => execSignature("bold")} className="rounded px-2 py-1 text-xs hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]">B</button>
              <button type="button" onClick={() => execSignature("italic")} className="rounded px-2 py-1 text-xs hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]">I</button>
              <button type="button" onClick={() => execSignature("underline")} className="rounded px-2 py-1 text-xs hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]">U</button>
              <input type="color" value={signatureColor} onChange={(e) => { setSignatureColor(e.target.value); execSignature("foreColor", e.target.value); }} className="h-6 w-6 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]" title="Text color" />
            </div>
            <div ref={signatureEditorRef} contentEditable className="min-h-[6rem] max-h-[12rem] resize-y border border-slate-300 rounded p-2 leading-relaxed overflow-y-auto" onInput={() => setSignature(signatureEditorRef.current?.innerHTML || "")} dangerouslySetInnerHTML={{ __html: signature }} />
            <div className="flex gap-2">
              <Button onClick={saveSignature} isLoading={uploading} className="text-xs">Save Signature</Button>
              <Button variant="secondary" onClick={clearSignature} disabled={signature === ""} className="text-xs">Clear Signature</Button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20 focus-visible:ring-offset-1 active:scale-[0.98] transition">
            <FontAwesomeIcon icon={faPaperclip} className="w-3 h-3" /> Attach files
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        </div>
        {attachments.length > 0 && (
          <ul className="space-y-1 text-sm">
            {attachments.map((file, index) => (
              <li key={index} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2">
                <span className="truncate">{file.name} ({Math.round(file.size / 1024)} KB)</span>
                <button type="button" onClick={() => removeAttachment(index)} className="text-rose-600 hover:text-rose-800"><FontAwesomeIcon icon={faTimes} className="w-3 h-3" /> Remove</button>
              </li>
            ))}
          </ul>
        )}
        {message && <p className="text-xs text-slate-500">{message}</p>}
      </form>
    </Modal>
  );
};

export default MailComposer;
