"use client";

import { Brush, Circle, Eraser, Highlighter, Minus, PaintBucket, Pencil, Redo2, RotateCcw, Square, Trash2, Undo2 } from "lucide-react";
import type { Tool } from "@drawhunt/shared";
import { useGameStore } from "@/store/gameStore";
import { getSocket } from "@/lib/socket";

const tools: Array<{ id: Tool; icon: React.ComponentType<{ size?: number }>; label: string }> = [
  { id: "pencil", icon: Pencil, label: "Pencil" },
  { id: "brush", icon: Brush, label: "Brush" },
  { id: "highlighter", icon: Highlighter, label: "Highlighter" },
  { id: "eraser", icon: Eraser, label: "Eraser" },
  { id: "fill", icon: PaintBucket, label: "Fill" },
  { id: "line", icon: Minus, label: "Line" },
  { id: "rect", icon: Square, label: "Rectangle" },
  { id: "ellipse", icon: Circle, label: "Ellipse" }
];

export function Toolbar() {
  const { room, self, tool, color, size, strokes, setTool, setColor, setSize } = useGameStore();

  const undo = () => {
    const stroke = strokes.filter((item) => item.playerId === self?.id).at(-1);
    if (!room || !stroke) return;
    getSocket().emit("undoStroke", { roomId: room.roomId, strokeId: stroke.strokeId });
  };

  const redo = () => {
    if (!room) return;
    getSocket().emit("redoStroke", { roomId: room.roomId });
  };

  return (
    <div className="glass flex w-full items-center gap-2 overflow-x-auto rounded-lg p-2">
      {tools.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-md border ${tool === item.id ? "border-aurora bg-white/20" : "border-white/10 bg-white/5"}`}
            title={item.label}
            onClick={() => setTool(item.id)}
          >
            <Icon size={18} />
          </button>
        );
      })}
      <input className="h-10 w-10 shrink-0 rounded-md border border-white/10 bg-transparent" type="color" value={color} onChange={(event) => setColor(event.target.value)} />
      <input className="w-24 shrink-0 accent-aurora" type="range" min={2} max={32} value={size} onChange={(event) => setSize(Number(event.target.value))} />
      <button className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 bg-white/5" title="Undo" onClick={undo}>
        <Undo2 size={18} />
      </button>
      <button className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 bg-white/5" title="Redo" onClick={redo}>
        <Redo2 size={18} />
      </button>
      <button
        className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 bg-white/5"
        title="Clear"
        onClick={() => {
          if (!room) return;
          if (!window.confirm("Clear the canvas for everyone in this room?")) return;
          getSocket().emit("clearCanvas", { roomId: room.roomId });
        }}
      >
        <Trash2 size={18} />
      </button>
      <button className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 bg-white/5" title="Reset view">
        <RotateCcw size={18} />
      </button>
    </div>
  );
}
