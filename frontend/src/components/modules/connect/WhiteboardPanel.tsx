import React, { useCallback, useEffect, useRef, useState } from "react";
import { Socket } from "socket.io-client";
import { Button } from "../../ui/Button";
import { getConnectBoard } from "../../../services/connectApi";

type Pt = { x: number; y: number };
type Op = {
  id: string;
  kind: "stroke" | "rect" | "circle" | "line" | "text";
  tool: string;
  color: string;
  width: number;
  points: Pt[];
  text?: string;
  x?: number; y?: number; w?: number; h?: number;
};

export const WhiteboardPanel: React.FC<{
  sessionId: string;
  socket: Socket | null;
  isHost: boolean;
  canDraw: boolean;
}> = ({ sessionId, socket, isHost, canDraw }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#111827");
  const [width, setWidth] = useState(3);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [pages, setPages] = useState<Op[][]>([[]]);
  const [history, setHistory] = useState<Op[][][]>([[[]]]);
  const [histIdx, setHistIdx] = useState(0);
  const drawing = useRef(false);
  const start = useRef<Pt | null>(null);
  const current = useRef<Op | null>(null);

  const ensurePage = (p: number) => {
    setPages((prev) => {
      const next = [...prev];
      while (next.length <= p) next.push([]);
      return next;
    });
  };

  // load persisted state
  useEffect(() => {
    (async () => {
      try {
        const data: any = await getConnectBoard(sessionId);
        const b = data?.board;
        if (b?.pages?.length) {
          const ops = b.pages.map((pg: any) => (pg.strokes || []).map((s: any) => ({
            id: s.id, kind: "stroke", tool: s.tool, color: s.color, width: s.width, points: s.points || [],
          })));
          setPages(ops);
          setPage(b.currentPage || 0);
          setPageCount(ops.length || 1);
          setHistory([ops]);
          setHistIdx(0);
        }
      } catch {}
    })();
  }, [sessionId]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const ops = pages[page] || [];
    for (const op of ops) {
      if (op.kind === "stroke" || op.kind === "line") {
        ctx.globalCompositeOperation = op.tool === "eraser" ? "destination-out" : "source-over";
        ctx.strokeStyle = op.color; ctx.lineWidth = op.width; ctx.lineCap = "round";
        ctx.beginPath();
        op.points.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
        ctx.stroke();
      } else if (op.kind === "rect") {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = op.color; ctx.lineWidth = op.width;
        ctx.strokeRect(op.x || 0, op.y || 0, op.w || 0, op.h || 0);
      } else if (op.kind === "circle") {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = op.color; ctx.lineWidth = op.width;
        ctx.beginPath();
        ctx.arc(op.x || 0, op.y || 0, Math.abs(op.w || 0), 0, Math.PI * 2);
        ctx.stroke();
      } else if (op.kind === "text") {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = op.color; ctx.font = `${op.width * 4 + 8}px sans-serif`;
        ctx.fillText(op.text || "", op.x || 0, op.y || 0);
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }, [pages, page]);

  useEffect(() => { redraw(); }, [redraw]);

  // socket sync
  useEffect(() => {
    if (!socket) return;
    const onStroke = (p: any) => {
      if (p.sessionId !== sessionId) return;
      const op: Op = p.stroke;
      setPages((prev) => {
        const next = prev.map((pg, i) => (i === p.page ? [...pg, op] : pg));
        while (next.length <= p.page) next.push([]);
        if (!next[p.page]) next[p.page] = [];
        if (!next[p.page].some((o) => o.id === op.id)) next[p.page].push(op);
        return next;
      });
    };
    const onClear = (p: any) => {
      if (p.sessionId !== sessionId) return;
      setPages((prev) => {
        const next = [...prev];
        if (p.page === null) next.forEach((pg, i) => { next[i] = []; });
        else if (next[p.page]) next[p.page] = [];
        return next;
      });
    };
    const onPage = (p: any) => {
      if (p.sessionId !== sessionId) return;
      if (p.action === "add") {
        setPages((prev) => [...prev, []]);
        setPageCount((c) => c + 1);
        setPage((prev) => (p.page ?? prev));
      } else if (p.action === "set") {
        setPage(p.page);
      }
    };
    const onUndo = (p: any) => {
      if (p.sessionId !== sessionId) return;
      setPages((prev) => {
        const next = [...prev];
        if (next[p.page]) next[p.page] = next[p.page].filter((o) => o.id !== p.opId);
        return next;
      });
    };
    socket.on("connect:board:undo", onUndo);
    socket.on("connect:board:clear", onClear);
    socket.on("connect:board:page", onPage);
    return () => {
    socket.off("connect:board:stroke", onStroke);
    socket.off("connect:board:clear", onClear);
    socket.off("connect:board:page", onPage);
    socket.off("connect:board:undo", onUndo);
    };
  }, [socket, sessionId]);

  const pos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const pushHistory = (nextPages: Op[][]) => {
    setHistory((h) => {
      const trimmed = h.slice(0, histIdx + 1);
      return [...trimmed, nextPages];
    });
    setHistIdx((i) => i + 1);
  };

  const onDown = (e: React.PointerEvent) => {
    if (!canDraw) return;
    const p = pos(e);
    drawing.current = true;
    start.current = p;
    if (tool === "text") {
      const text = prompt("Text:") || "";
      if (!text) { drawing.current = false; return; }
      const op: Op = { id: `${Date.now()}-${Math.random()}`, kind: "text", tool, color, width, points: [], text, x: p.x, y: p.y };
      setPages((prev) => {
        const next = [...prev]; ensurePage(page);
        next[page] = [...(next[page] || []), op];
        pushHistory(next);
        return next;
      });
      socket?.emit("connect:board:stroke", { sessionId, page, stroke: { id: op.id, tool: op.tool, color: op.color, width: op.width, points: [], text: op.text, x: op.x, y: op.y } });
      drawing.current = false;
      return;
    }
    current.current = { id: `${Date.now()}-${Math.random()}`, kind: tool === "rect" ? "rect" : tool === "circle" ? "circle" : tool === "line" ? "line" : "stroke", tool, color: tool === "eraser" ? "#000" : color, width: tool === "eraser" ? width * 4 : width, points: [p] };
    if (tool === "rect" || tool === "circle" || tool === "line") {
      current.current.x = p.x; current.current.y = p.y; current.current.w = 0; current.current.h = 0;
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current || !current.current) return;
    const p = pos(e);
    const op = current.current;
    if (op.kind === "stroke" || op.kind === "line") {
      op.points.push(p);
    } else if (op.kind === "rect") {
      op.w = p.x - (start.current?.x || 0);
      op.h = p.y - (start.current?.y || 0);
    } else if (op.kind === "circle") {
      const dx = p.x - (start.current?.x || 0);
      const dy = p.y - (start.current?.y || 0);
      op.w = Math.hypot(dx, dy);
    }
    redraw();
    // live preview
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    // redraw base then current
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // redraw existing ops
    // (simplified: just draw current op on top by re-running redraw not current)
    // We'll rely on state not updated until up; draw current op manually:
    if (op.kind === "stroke" || op.kind === "line") {
      ctx.globalCompositeOperation = op.tool === "eraser" ? "destination-out" : "source-over";
      ctx.strokeStyle = op.color; ctx.lineWidth = op.width; ctx.lineCap = "round";
      ctx.beginPath();
      op.points.forEach((pt, i) => { if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y); });
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    }
  };
  const onUp = () => {
    if (!drawing.current || !current.current) { drawing.current = false; return; }
    drawing.current = false;
    const op = current.current;
    current.current = null;
    if (op.kind === "rect" || op.kind === "circle") {
      op.x = start.current?.x; op.y = start.current?.y;
    }
    setPages((prev) => {
      const next = prev.map((pg, i) => (i === page ? [...pg, op] : pg));
      ensurePage(page);
      if (!next[page]) next[page] = [];
      if (!next[page].some((o) => o.id === op.id)) next[page].push(op);
      pushHistory(next);
      return next;
    });
    socket?.emit("connect:board:stroke", { sessionId, page, stroke: op });
  };

  const undo = () => {
    const ops = pages[page] || [];
    if (!ops.length) return;
    const last = ops[ops.length - 1];
    setPages((prev) => {
      const next = [...prev];
      next[page] = ops.slice(0, -1);
      return next;
    });
    socket?.emit("connect:board:undo", { sessionId, page, opId: last.id });
  };
  const redo = () => {
    if (histIdx >= history.length - 1) return;
    setHistIdx((i) => i + 1);
    setPages(history[histIdx + 1]);
  };

  const clear = () => {
    if (!isHost) return;
    setPages((prev) => {
      const next = [...prev];
      next[page] = [];
      pushHistory(next);
      return next;
    });
    socket?.emit("connect:board:clear", { sessionId, page });
  };

  const addPage = () => {
    if (!isHost) return;
    setPages((prev) => [...prev, []]);
    const np = pages.length;
    setPageCount(np + 1);
    setPage(np);
    socket?.emit("connect:board:page", { sessionId, action: "add", page: np, pageCount: np + 1 });
  };
  const switchPage = (p: number) => {
    setPage(Math.max(0, Math.min(pageCount - 1, p)));
    socket?.emit("connect:board:page", { sessionId, action: "set", page: p });
  };

  const drawingPermission = canDraw;

  return (
    <div className="rounded border bg-white p-2 space-y-2">
      <div className="flex flex-wrap gap-1 items-center">
        <select value={tool} onChange={(e) => setTool(e.target.value)} className="rounded border px-1 py-0.5 text-xs">
          <option value="pen">Pen</option>
          <option value="marker">Marker</option>
          <option value="eraser">Eraser</option>
          <option value="rect">Rectangle</option>
          <option value="circle">Circle</option>
          <option value="line">Line</option>
          <option value="text">Text</option>
        </select>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} disabled={tool === "eraser"} />
        <input type="range" min={1} max={12} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
        <Button variant="secondary" onClick={undo}>Undo</Button>
        <Button variant="secondary" onClick={redo}>Redo</Button>
        {isHost && <Button variant="secondary" onClick={clear}>Clear</Button>}
        {isHost && <Button variant="secondary" onClick={addPage}>+ Page</Button>}
        <select value={page} onChange={(e) => switchPage(Number(e.target.value))} className="rounded border px-1 py-0.5 text-xs">
          {Array.from({ length: pageCount }).map((_, i) => <option key={i} value={i}>Page {i + 1}</option>)}
        </select>
      </div>
      <canvas
        ref={canvasRef}
        width={640}
        height={360}
        className="w-full border rounded bg-white touch-none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      />
      {!drawingPermission && <div className="text-xs text-slate-500">Drawing disabled by host.</div>}
    </div>
  );
};
