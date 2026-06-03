import type { DrawPoint, StrokePacket } from "@drawhunt/shared";

export function setupCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
  canvas.width = Math.floor(rect.width * ratio);
  canvas.height = Math.floor(rect.height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.scale(ratio, ratio);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  return ctx;
}

export function normalizePoint(event: PointerEvent | React.PointerEvent, canvas: HTMLCanvasElement): DrawPoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Number(((event.clientX - rect.left) / rect.width).toFixed(4)),
    y: Number(((event.clientY - rect.top) / rect.height).toFixed(4)),
    p: "pressure" in event ? Number((event.pressure || 0.5).toFixed(2)) : 0.5,
    t: Date.now()
  };
}

export function drawStroke(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, stroke: StrokePacket) {
  const { width, height } = canvas.getBoundingClientRect();
  const points = stroke.points;
  if (points.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.size;

  const first = points[0];
  ctx.beginPath();
  ctx.moveTo(first.x * width, first.y * height);
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const current = points[index];
    const midX = ((prev.x + current.x) / 2) * width;
    const midY = ((prev.y + current.y) / 2) * height;
    ctx.quadraticCurveTo(prev.x * width, prev.y * height, midX, midY);
  }
  if (points.length === 1) ctx.arc(first.x * width, first.y * height, stroke.size / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function redraw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, strokes: StrokePacket[]) {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  for (const stroke of strokes) drawStroke(ctx, canvas, stroke);
}

