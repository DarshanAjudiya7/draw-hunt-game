"use client";

import { useEffect, useMemo, useRef } from "react";
import type { StrokePacket } from "@drawhunt/shared";
import { drawStroke, normalizePoint, preventTouchGesture, redraw, setupCanvas } from "@/lib/canvas";
import { getSocket } from "@/lib/socket";
import { useGameStore } from "@/store/gameStore";

export function CanvasBoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | undefined>(undefined);
  const activeStroke = useRef<StrokePacket | undefined>(undefined);
  const frameQueue = useRef<StrokePacket[]>([]);
  const { room, self, tool, color, size, strokes, addStroke, undoStroke, redoStroke, clearStrokes } = useGameStore();
  const socket = useMemo(() => getSocket(), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ctxRef.current = setupCanvas(canvas);
    redraw(ctxRef.current, canvas, strokes);
    const resize = () => {
      ctxRef.current = setupCanvas(canvas);
      redraw(ctxRef.current, canvas, useGameStore.getState().strokes);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    redraw(ctx, canvas, strokes);
  }, [strokes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    let raf = 0;
    const pump = () => {
      const queue = frameQueue.current.splice(0);
      for (const stroke of queue) drawStroke(ctx, canvas, stroke);
      raf = requestAnimationFrame(pump);
    };
    raf = requestAnimationFrame(pump);

    socket.on("drawStart", (stroke) => frameQueue.current.push(stroke));
    socket.on("drawMove", (stroke) => frameQueue.current.push(stroke));
    socket.on("drawEnd", (stroke) => addStroke(stroke));
    socket.on("undoStroke", ({ strokeId }) => undoStroke(strokeId));
    socket.on("redoStroke", (stroke) => redoStroke(stroke));
    socket.on("clearCanvas", clearStrokes);
    return () => {
      cancelAnimationFrame(raf);
      socket.off("drawStart");
      socket.off("drawMove");
      socket.off("drawEnd");
      socket.off("undoStroke");
      socket.off("redoStroke");
      socket.off("clearCanvas");
    };
  }, [addStroke, clearStrokes, redoStroke, undoStroke, socket]);

  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !room || !self) return;
    canvas.setPointerCapture(event.pointerId);
    const stroke: StrokePacket = {
      strokeId: crypto.randomUUID(),
      playerId: self.id,
      tool,
      color: tool === "eraser" ? "#000000" : color,
      size,
      opacity: tool === "highlighter" ? 0.35 : 1,
      points: [normalizePoint(event, canvas)],
      ts: Date.now()
    };
    activeStroke.current = stroke;
    socket.emit("drawStart", { roomId: room.roomId, stroke });
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const stroke = activeStroke.current;
    if (!canvas || !ctx || !room || !stroke) return;
    if (event.pointerType === "touch" && !event.isPrimary) return;
    stroke.points.push(normalizePoint(event, canvas));
    const batched = { ...stroke, points: stroke.points.slice(-3) };
    drawStroke(ctx, canvas, batched);
    socket.volatile.emit("drawMove", { roomId: room.roomId, stroke: batched });
  };

  const end = () => {
    const canvas = canvasRef.current;
    const stroke = activeStroke.current;
    if (!canvas || !room || !stroke) return;
    activeStroke.current = undefined;
    addStroke(stroke);
    socket.emit("drawEnd", { roomId: room.roomId, stroke, snapshot: canvas.toDataURL("image/webp", 0.72) });
  };

  return (
    <div className="canvas-shell relative min-h-[360px] flex-1 overflow-hidden rounded-lg border border-white/15 bg-white shadow-glass">
      <canvas
        ref={canvasRef}
        className="h-full min-h-[360px] w-full cursor-crosshair"
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onTouchStart={preventTouchGesture}
        onTouchMove={preventTouchGesture}
        onTouchEnd={preventTouchGesture}
      />
      {room?.challenge ? (
        <div className="pointer-events-none absolute left-3 top-3 max-w-[80%] rounded-md bg-ink/75 px-3 py-2 text-xs text-white shadow-lg">
          {room.challenge.prompt}
        </div>
      ) : null}
    </div>
  );
}
