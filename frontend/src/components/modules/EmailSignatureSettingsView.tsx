import React, { useEffect, useRef, useState } from "react";
import { apiRequest } from "../../services/apiClient";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";

export const EmailSignatureSettingsView: React.FC = () => {
  const [signature, setSignature] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [handwrittenUrl, setHandwrittenUrl] = useState<string | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [drawing, setDrawing] = useState(false);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [strokes, setStrokes] = useState<ImageData[]>([]);
  const [redoStack, setRedoStack] = useState<ImageData[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiRequest<{ signature: string | null }>("/users/me/signature");
        const sig = data.signature || "";
        setSignature(sig);
        if (editorRef.current) editorRef.current.innerHTML = sig;
        try {
          const prof = await apiRequest<{ profile: { signature_image_url?: string | null } }>("/profile/me");
          setHandwrittenUrl(prof.profile?.signature_image_url || null);
        } catch {}
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const exec = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const html = editorRef.current?.innerHTML || signature;
      await apiRequest("/users/me/signature", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signature: html.trim() === "" ? null : html }) });
      setSignature(html);
      setMessage("Saved");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete signature?")) return;
    setSaving(true);
    try {
      await apiRequest("/users/me/signature", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signature: null }) });
      setSignature("");
      if (editorRef.current) editorRef.current.innerHTML = "";
      setMessage("Deleted");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setSaving(false);
    }
  };

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.beginPath();
    const rect = canvasRef.current!.getBoundingClientRect();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setDrawing(true);
  };
  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };
  const endDraw = () => {
    if (!drawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx && canvasRef.current) {
      setStrokes((prev) => [...prev, ctx.getImageData(0, 0, canvasRef.current!.width, canvasRef.current!.height)]);
      setRedoStack([]);
    }
    setDrawing(false);
  };
  const clearCanvas = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      setStrokes([]);
      setRedoStack([]);
    }
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
  const uploadSignatureImage = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const data = await apiRequest<{ imageUrl: string }>("/users/me/signature/image", {
      method: "POST",
      body: form,
    });
    if (data.imageUrl) setHandwrittenUrl(data.imageUrl);
  };

  const saveDrawing = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    const file = new File([blob], "signature.png", { type: "image/png" });
    setUploading(true);
    try {
      await uploadSignatureImage(file);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold mb-2">Email Signature</h1>
      <p className="text-sm text-slate-500 mb-4">Create your professional institutional email signature.</p>
      {message && <Alert variant="info">{message}</Alert>}
      {loading ? <p>Loading...</p> : (
        <>
          <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2 mb-2">
            <button type="button" onClick={() => exec("bold")} className="rounded px-2 py-1 text-sm hover:bg-slate-100">B</button>
            <button type="button" onClick={() => exec("italic")} className="rounded px-2 py-1 text-sm hover:bg-slate-100">I</button>
            <button type="button" onClick={() => exec("underline")} className="rounded px-2 py-1 text-sm hover:bg-slate-100">U</button>
            <button type="button" onClick={() => exec("insertUnorderedList")} className="rounded px-2 py-1 text-sm hover:bg-slate-100">•</button>
            <button type="button" onClick={() => exec("insertOrderedList")} className="rounded px-2 py-1 text-sm hover:bg-slate-100">1.</button>
            <button type="button" onClick={() => { const url = window.prompt("URL"); if (url) exec("createLink", url); }} className="rounded px-2 py-1 text-sm hover:bg-slate-100">Link</button>
            <input type="color" onChange={(e) => exec("foreColor", e.target.value)} className="h-8 w-8" title="Text color" />
            <input type="color" onChange={(e) => exec("hiliteColor", e.target.value)} className="h-8 w-8" title="Highlight color" />
            <select onChange={(e) => exec("fontSize", e.target.value)} className="border border-slate-300 rounded px-1 text-sm">
              <option value="3">Size</option>
              <option value="1">Small</option>
              <option value="3">Normal</option>
              <option value="5">Large</option>
            </select>
            <button type="button" onClick={() => exec("justifyLeft")} className="rounded px-2 py-1 text-sm hover:bg-slate-100">L</button>
            <button type="button" onClick={() => exec("justifyCenter")} className="rounded px-2 py-1 text-sm hover:bg-slate-100">C</button>
            <button type="button" onClick={() => exec("justifyRight")} className="rounded px-2 py-1 text-sm hover:bg-slate-100">R</button>
            <button type="button" onClick={() => exec("removeFormat")} className="rounded px-2 py-1 text-sm hover:bg-slate-100">Clear</button>
            <button type="button" onClick={() => exec("undo")} className="rounded px-2 py-1 text-sm hover:bg-slate-100">Undo</button>
            <button type="button" onClick={() => exec("redo")} className="rounded px-2 py-1 text-sm hover:bg-slate-100">Redo</button>
          </div>
          <div ref={editorRef} contentEditable className="min-h-[8rem] border border-slate-300 rounded p-2 leading-relaxed" onInput={() => setSignature(editorRef.current?.innerHTML || "")} />
          <div className="mt-2 border border-slate-200 rounded p-3 bg-slate-50">
            <p className="text-xs text-slate-500 mb-1">Preview</p>
            <div className="text-sm" dangerouslySetInnerHTML={{ __html: signature || "<span class='text-slate-400'>No signature</span>" }} />
            {handwrittenUrl && <img src={handwrittenUrl} alt="signature" className="mt-2 max-h-24" />}
          </div>
          <div className="mt-4 border border-slate-200 rounded p-3">
            <p className="text-sm font-semibold mb-2">Handwritten Signature</p>
            {handwrittenUrl ? (
              <img src={handwrittenUrl} alt="signature" className="max-h-24 border border-slate-200 rounded bg-white p-2" />
            ) : (
              <p className="text-xs text-slate-400">No handwritten signature uploaded.</p>
            )}
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                {uploading ? "Uploading..." : "Upload Signature Image"}
              </button>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading(true);
                try {
                  await uploadSignatureImage(file);
                } finally {
                  setUploading(false);
                }
              }} />
            </div>
          </div>
          <div className="mt-4 border border-slate-200 rounded p-3">
            <p className="text-sm font-semibold mb-2">Draw Your Signature</p>
            <canvas ref={canvasRef} width={400} height={150} className="border border-slate-300 rounded bg-white w-full" style={{ touchAction: "none" }}
              onPointerDown={startDraw} onPointerMove={draw} onPointerUp={endDraw} onPointerLeave={endDraw} />
            <div className="mt-2 flex items-center gap-2">
              <label className="text-xs">Stroke</label>
              <input type="range" min={1} max={6} value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} />
              <button type="button" onClick={clearCanvas} className="rounded bg-slate-200 px-2 py-1 text-xs">Clear</button>
              <button type="button" onClick={undo} className="rounded bg-slate-200 px-2 py-1 text-xs">Undo</button>
              <button type="button" onClick={redo} className="rounded bg-slate-200 px-2 py-1 text-xs">Redo</button>
              <button type="button" onClick={saveDrawing} className="rounded bg-blue-600 px-2 py-1 text-xs text-white">Save Signature</button>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={save} isLoading={saving}>Save Changes</Button>
            <Button variant="secondary" onClick={() => { setSignature(""); if (editorRef.current) editorRef.current.innerHTML = ""; }}>Cancel</Button>
            <Button variant="secondary" onClick={remove}>Delete Signature</Button>
          </div>
        </>
      )}
    </div>
  );
};

export default EmailSignatureSettingsView;
