import type { Server, Socket } from "socket.io";
import type {
  ChatMessage,
  ClientToServerEvents,
  Difficulty,
  GameMode,
  Player,
  RoomState,
  ServerToClientEvents,
  StrokePacket
} from "@drawhunt/shared";
import { MAX_PLAYERS, PLAYER_COLORS, generateRoomId, sanitizeNickname } from "@drawhunt/shared";
import { RoomModel } from "../models/Room.js";
import { UserModel } from "../models/User.js";
import { MatchModel } from "../models/Match.js";
import { signToken, verifyToken } from "../middleware/auth.js";
import { generateChallenge } from "../services/challengeService.js";
import { isDatabaseAvailable } from "../config/db.js";

type IOServer = Server<ClientToServerEvents, ServerToClientEvents>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const rooms = new Map<string, RoomState>();
const socketPlayers = new Map<string, { roomId: string; playerId: string }>();
const strokeHistory = new Map<string, StrokePacket[]>();
const redoHistory = new Map<string, StrokePacket[]>();
const timers = new Map<string, NodeJS.Timeout>();
const chatBuckets = new Map<string, { count: number; resetAt: number }>();

function publicPlayer(player: Player) {
  return player;
}

function makePlayer(socket: IOSocket, username: string, avatar: string, host: boolean, index: number): Player {
  return {
    id: socket.data.userId,
    username: sanitizeNickname(username),
    avatar,
    color: PLAYER_COLORS[index % PLAYER_COLORS.length],
    score: 0,
    ready: host,
    host,
    team: index % 2 === 0 ? "aurora" : "ember"
  };
}

async function persistRoom(room: RoomState) {
  if (!isDatabaseAvailable()) return;
  await RoomModel.findOneAndUpdate(
    { roomId: room.roomId },
    {
      roomId: room.roomId,
      players: room.players.map((player) => ({ ...player, userId: player.id })),
      host: room.hostId,
      status: room.status,
      mode: room.mode,
      rounds: room.rounds,
      currentRound: room.currentRound,
      canvasSnapshot: room.canvasSnapshot,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 4)
    },
    { upsert: true }
  );
}

function emitRoom(io: IOServer, room: RoomState) {
  io.to(room.roomId).emit("roomUpdated", room);
}

async function createUserIfNeeded(socket: IOSocket, token: string | undefined, username: string, avatar: string) {
  const existing = verifyToken(token);
  if (existing) {
    socket.data.userId = existing.sub;
    socket.data.username = existing.username;
    return { token: token!, userId: existing.sub };
  }
  const clean = sanitizeNickname(username);
  if (!isDatabaseAvailable()) {
    const userId = crypto.randomUUID();
    const newToken = signToken({ sub: userId, username: clean, guest: true });
    socket.data.userId = userId;
    socket.data.username = clean;
    return { token: newToken, userId };
  }
  const user = await UserModel.create({ username: clean, avatar, guest: true });
  const newToken = signToken({ sub: user.id, username: clean, guest: true });
  socket.data.userId = user.id;
  socket.data.username = clean;
  return { token: newToken, userId: user.id };
}

function assertHost(socket: IOSocket, room: RoomState) {
  return socket.data.userId === room.hostId;
}

function clearRoomTimer(roomId: string) {
  const timer = timers.get(roomId);
  if (timer) clearInterval(timer);
  timers.delete(roomId);
}

async function startTimer(io: IOServer, room: RoomState) {
  clearRoomTimer(room.roomId);
  let countdown = 3;
  room.status = "countdown";
  emitRoom(io, room);
  const count = setInterval(async () => {
    io.to(room.roomId).emit("gameCountdown", { seconds: countdown });
    countdown -= 1;
    if (countdown < 0) {
      clearInterval(count);
      room.status = "drawing";
      room.currentRound += 1;
      room.timer = 90;
      room.challenge = await generateChallenge(room.mode, "medium" satisfies Difficulty);
      io.to(room.roomId).emit("challengeUpdate", room.challenge);
      emitRoom(io, room);
      const gameTimer = setInterval(async () => {
        room.timer -= 1;
        io.to(room.roomId).emit("timerUpdate", { timer: room.timer });
        if (room.timer <= 0) {
          clearInterval(gameTimer);
          room.status = "results";
          const mvp = [...room.players].sort((a, b) => b.score - a.score)[0];
          if (isDatabaseAvailable()) {
            await MatchModel.create({
              roomId: room.roomId,
              mode: room.mode,
              participants: room.players.map((player) => player.id),
              winner: mvp?.id,
              scores: Object.fromEntries(room.players.map((player) => [player.id, player.score])),
              drawings: [{ round: room.currentRound, prompt: room.challenge?.prompt, snapshot: room.canvasSnapshot, replay: strokeHistory.get(room.roomId) ?? [] }]
            });
          }
          io.to(room.roomId).emit("gameFinished", { room, mvp });
          emitRoom(io, room);
        }
      }, 1000);
      timers.set(room.roomId, gameTimer);
    }
  }, 1000);
  timers.set(room.roomId, count);
}

function scoreGuess(room: RoomState, playerId: string, text: string) {
  if (room.mode !== "guess" || !room.challenge) return false;
  const normalized = text.toLowerCase().replace(/[^\w ]/g, "").trim();
  const answer = room.challenge.prompt.toLowerCase().replace(/[^\w ]/g, "").trim();
  if (normalized !== answer) return false;
  const player = room.players.find((item) => item.id === playerId);
  if (player) player.score += Math.max(10, room.timer);
  return true;
}

function allowChat(socketId: string) {
  const now = Date.now();
  const bucket = chatBuckets.get(socketId) ?? { count: 0, resetAt: now + 10_000 };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + 10_000;
  }
  bucket.count += 1;
  chatBuckets.set(socketId, bucket);
  return bucket.count <= 8;
}

export function registerRoomHandlers(io: IOServer, socket: IOSocket) {
  socket.on("createRoom", async (payload, ack) => {
    const auth = await createUserIfNeeded(socket, payload.token, payload.username, payload.avatar ?? "nova");
    let roomId = generateRoomId();
    while (rooms.has(roomId)) roomId = generateRoomId();
    const player = makePlayer(socket, payload.username, payload.avatar ?? "nova", true, 0);
    const room: RoomState = {
      roomId,
      hostId: auth.userId,
      status: "lobby",
      mode: payload.mode ?? "collaborative",
      rounds: 3,
      currentRound: 0,
      timer: 90,
      players: [publicPlayer(player)]
    };
    rooms.set(roomId, room);
    strokeHistory.set(roomId, []);
    socketPlayers.set(socket.id, { roomId, playerId: player.id });
    await socket.join(roomId);
    await persistRoom(room);
    ack({ ok: true, data: { room, player, token: auth.token } });
  });

  socket.on("joinRoom", async (payload, ack) => {
    const roomId = payload.roomId.toUpperCase();
    const room = rooms.get(roomId);
    if (!room || room.status === "closed") return ack({ ok: false, error: "Room not found" });
    if (room.players.length >= MAX_PLAYERS) return ack({ ok: false, error: "Room is full" });
    const auth = await createUserIfNeeded(socket, payload.token, payload.username, payload.avatar ?? "orbit");
    const existing = room.players.find((player) => player.id === auth.userId);
    const player = existing ?? makePlayer(socket, payload.username, payload.avatar ?? "orbit", false, room.players.length);
    if (!existing) room.players.push(player);
    socketPlayers.set(socket.id, { roomId, playerId: player.id });
    await socket.join(roomId);
    await persistRoom(room);
    socket.to(roomId).emit("playerJoined", player);
    emitRoom(io, room);
    ack({ ok: true, data: { room, player, token: auth.token } });
  });

  socket.on("playerReady", ({ roomId, ready }) => {
    const room = rooms.get(roomId);
    const player = room?.players.find((item) => item.id === socket.data.userId);
    if (!room || !player) return;
    player.ready = ready;
    emitRoom(io, room);
  });

  socket.on("updateRoomSettings", ({ roomId, mode, rounds }) => {
    const room = rooms.get(roomId);
    if (!room || !assertHost(socket, room) || room.status !== "lobby") return;
    if (mode) room.mode = mode;
    if (rounds) room.rounds = Math.min(10, Math.max(1, rounds));
    emitRoom(io, room);
  });

  socket.on("startGame", async ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !assertHost(socket, room)) return;
    await startTimer(io, room);
  });

  socket.on("endGame", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !assertHost(socket, room)) return;
    room.status = "closed";
    clearRoomTimer(roomId);
    io.to(roomId).emit("gameFinished", { room });
    emitRoom(io, room);
  });

  socket.on("kickPlayer", ({ roomId, playerId }) => {
    const room = rooms.get(roomId);
    if (!room || !assertHost(socket, room)) return;
    room.players = room.players.filter((player) => player.id !== playerId);
    emitRoom(io, room);
  });

  socket.on("drawStart", ({ roomId, stroke }) => socket.to(roomId).emit("drawStart", stroke));
  socket.on("drawMove", ({ roomId, stroke }) => socket.to(roomId).emit("drawMove", stroke));
  socket.on("drawEnd", ({ roomId, stroke, snapshot }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    strokeHistory.get(roomId)?.push(stroke);
    redoHistory.set(roomId, []);
    room.canvasSnapshot = snapshot ?? room.canvasSnapshot;
    socket.to(roomId).emit("drawEnd", stroke);
  });
  socket.on("clearCanvas", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    strokeHistory.set(roomId, []);
    room.canvasSnapshot = undefined;
    io.to(roomId).emit("clearCanvas");
  });
  socket.on("undoStroke", ({ roomId, strokeId }) => {
    const history = strokeHistory.get(roomId) ?? [];
    const index = history.findIndex((stroke) => stroke.strokeId === strokeId);
    if (index >= 0) {
      const [stroke] = history.splice(index, 1);
      redoHistory.set(roomId, [...(redoHistory.get(roomId) ?? []), stroke]);
      io.to(roomId).emit("undoStroke", { strokeId });
    }
  });
  socket.on("redoStroke", ({ roomId, stroke }) => {
    strokeHistory.get(roomId)?.push(stroke);
    io.to(roomId).emit("redoStroke", stroke);
  });

  socket.on("chatMessage", ({ roomId, message }) => {
    if (!allowChat(socket.id)) return socket.emit("errorMessage", { message: "Slow down a little." });
    const room = rooms.get(roomId);
    const player = room?.players.find((item) => item.id === socket.data.userId);
    if (!room || !player) return;
    const clean = message.replace(/[<>]/g, "").trim().slice(0, 160);
    if (!clean) return;
    const guessed = scoreGuess(room, player.id, clean);
    const chat: ChatMessage = {
      id: crypto.randomUUID(),
      roomId,
      playerId: player.id,
      username: player.username,
      message: guessed ? `${player.username} guessed it!` : clean,
      system: guessed,
      createdAt: Date.now()
    };
    io.to(roomId).emit("chatMessage", chat);
    if (guessed) io.to(roomId).emit("scoreUpdate", { players: room.players });
  });

  socket.on("huntTap", ({ roomId, objectId, x, y }) => {
    const room = rooms.get(roomId);
    const player = room?.players.find((item) => item.id === socket.data.userId);
    const target = room?.challenge?.hiddenObjects?.find((item) => item.id === objectId);
    if (!room || !player || !target) return;
    const distance = Math.hypot(target.x - x, target.y - y);
    if (distance <= target.radius) {
      player.score += Math.round(100 + room.timer * 2);
      io.to(roomId).emit("scoreUpdate", { players: room.players });
    }
  });

  socket.on("disconnect", () => {
    const session = socketPlayers.get(socket.id);
    if (!session) return;
    socketPlayers.delete(socket.id);
    const room = rooms.get(session.roomId);
    if (!room) return;
    socket.to(session.roomId).emit("playerLeft", { playerId: session.playerId });
  });
}
