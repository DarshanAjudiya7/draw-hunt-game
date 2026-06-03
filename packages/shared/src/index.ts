export type GameMode =
  | "collaborative"
  | "guess"
  | "ai-challenge"
  | "drawing-hunt"
  | "team-battle";

export type Difficulty = "easy" | "medium" | "hard" | "expert";
export type RoomStatus = "lobby" | "countdown" | "drawing" | "results" | "closed";
export type Tool = "pencil" | "brush" | "eraser" | "fill" | "line" | "rect" | "ellipse";

export interface Player {
  id: string;
  username: string;
  avatar: string;
  color: string;
  score: number;
  ready: boolean;
  host: boolean;
  team?: "aurora" | "ember";
}

export interface Challenge {
  id: string;
  prompt: string;
  difficulty: Difficulty;
  hints: string[];
  hiddenObjects?: Array<{ id: string; label: string; x: number; y: number; radius: number }>;
}

export interface RoomState {
  roomId: string;
  hostId: string;
  status: RoomStatus;
  mode: GameMode;
  rounds: number;
  currentRound: number;
  timer: number;
  challenge?: Challenge;
  players: Player[];
  canvasSnapshot?: string;
}

export interface DrawPoint {
  x: number;
  y: number;
  p?: number;
  t?: number;
}

export interface StrokePacket {
  strokeId: string;
  playerId: string;
  tool: Tool;
  color: string;
  size: number;
  points: DrawPoint[];
  ts: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  playerId: string;
  username: string;
  message: string;
  system?: boolean;
  createdAt: number;
}

export interface ClientToServerEvents {
  createRoom: (
    payload: { username: string; avatar?: string; mode?: GameMode; token?: string },
    ack: (response: SocketAck<{ room: RoomState; player: Player; token: string }>) => void
  ) => void;
  joinRoom: (
    payload: { roomId: string; username: string; avatar?: string; token?: string },
    ack: (response: SocketAck<{ room: RoomState; player: Player; token: string }>) => void
  ) => void;
  leaveRoom: (payload: { roomId: string }) => void;
  playerReady: (payload: { roomId: string; ready: boolean }) => void;
  startGame: (payload: { roomId: string }) => void;
  endGame: (payload: { roomId: string }) => void;
  kickPlayer: (payload: { roomId: string; playerId: string }) => void;
  updateRoomSettings: (payload: { roomId: string; mode?: GameMode; rounds?: number }) => void;
  drawStart: (payload: { roomId: string; stroke: StrokePacket }) => void;
  drawMove: (payload: { roomId: string; stroke: StrokePacket }) => void;
  drawEnd: (payload: { roomId: string; stroke: StrokePacket; snapshot?: string }) => void;
  clearCanvas: (payload: { roomId: string }) => void;
  undoStroke: (payload: { roomId: string; strokeId: string }) => void;
  redoStroke: (payload: { roomId: string; stroke: StrokePacket }) => void;
  chatMessage: (payload: { roomId: string; message: string }) => void;
  huntTap: (payload: { roomId: string; objectId: string; x: number; y: number }) => void;
}

export interface ServerToClientEvents {
  roomUpdated: (room: RoomState) => void;
  playerJoined: (player: Player) => void;
  playerLeft: (payload: { playerId: string }) => void;
  gameCountdown: (payload: { seconds: number }) => void;
  timerUpdate: (payload: { timer: number }) => void;
  challengeUpdate: (challenge: Challenge) => void;
  scoreUpdate: (payload: { players: Player[] }) => void;
  gameFinished: (payload: { room: RoomState; mvp?: Player }) => void;
  drawStart: (stroke: StrokePacket) => void;
  drawMove: (stroke: StrokePacket) => void;
  drawEnd: (stroke: StrokePacket) => void;
  clearCanvas: () => void;
  undoStroke: (payload: { strokeId: string }) => void;
  redoStroke: (stroke: StrokePacket) => void;
  chatMessage: (message: ChatMessage) => void;
  errorMessage: (payload: { message: string }) => void;
}

export interface SocketAck<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export const MAX_PLAYERS = 10;
export const MIN_PLAYERS = 2;

export const PLAYER_COLORS = [
  "#42d392",
  "#fb7185",
  "#60a5fa",
  "#fbbf24",
  "#c084fc",
  "#2dd4bf",
  "#f97316",
  "#f472b6",
  "#a3e635",
  "#38bdf8"
];

export function sanitizeNickname(value: string) {
  return value.replace(/[^\w .-]/g, "").trim().slice(0, 24) || "Guest";
}

export function generateRoomId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}
