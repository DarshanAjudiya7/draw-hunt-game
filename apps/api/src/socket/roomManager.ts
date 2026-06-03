import type { Server, Socket } from "socket.io";
import type {
  CanvasState,
  ChatMessage,
  ClientToServerEvents,
  Difficulty,
  GameMode,
  Player,
  RoomState,
  ServerToClientEvents,
  StrokePacket
} from "@drawhunt/shared";
import { MAX_PLAYERS, PLAYER_COLORS, generateRoomId, normalizeRoomCode, sanitizeNickname } from "@drawhunt/shared";
import { RoomModel } from "../models/Room.js";
import { UserModel } from "../models/User.js";
import { MatchModel } from "../models/Match.js";
import { signToken, verifyToken } from "../middleware/auth.js";
import { generateChallenge } from "../services/challengeService.js";
import { isDatabaseAvailable } from "../config/db.js";

type IOServer = Server<ClientToServerEvents, ServerToClientEvents>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

interface RuntimeRoom {
  state: RoomState;
  secretWord?: string;
  guessed: Set<string>;
  socketsByPlayer: Map<string, string>;
  disconnectTimers: Map<string, NodeJS.Timeout>;
  strokes: StrokePacket[];
  undone: StrokePacket[];
  timer?: NodeJS.Timeout;
}

const rooms = new Map<string, RuntimeRoom>();
const socketPlayers = new Map<string, { roomId: string; playerId: string }>();
const chatBuckets = new Map<string, { count: number; resetAt: number }>();

function log(message: string, meta?: Record<string, unknown>) {
  console.log(`[room] ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`);
}

function publicCanvas(room: RuntimeRoom): CanvasState {
  return {
    strokes: room.strokes,
    snapshot: room.state.canvasSnapshot,
    strokeCount: room.strokes.length
  };
}

function publicRoom(room: RuntimeRoom): RoomState {
  return {
    ...room.state,
    players: room.state.players.map((player) => ({ ...player, host: player.id === room.state.hostId })),
    strokeCount: room.strokes.length
  };
}

function maskWord(secret?: string, reveal = 0) {
  if (!secret) return "";
  const clean = secret.trim();
  let revealed = 0;
  return clean
    .split("")
    .map((char) => {
      if (char === " ") return " ";
      if (revealed < reveal) {
        revealed += 1;
        return char;
      }
      return "_";
    })
    .join(" ");
}

function normalizeGuess(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();
}

function isCorrectGuess(message: string, secret: string) {
  return normalizeGuess(message) === normalizeGuess(secret);
}

function getAnswerFromPrompt(prompt: string) {
  return prompt
    .replace(/^draw\s+/i, "")
    .replace(/[.!?]+$/g, "")
    .trim()
    .slice(0, 60);
}

function validateRoomCode(input: string) {
  const roomId = normalizeRoomCode(input);
  if (roomId.length < 6 || roomId.length > 8) return undefined;
  return roomId;
}

async function persistRoom(room: RuntimeRoom) {
  if (!isDatabaseAvailable()) return;
  await RoomModel.findOneAndUpdate(
    { roomId: room.state.roomId },
    {
      roomId: room.state.roomId,
      players: room.state.players.map((player) => ({ ...player, userId: player.id })),
      host: room.state.hostId,
      status: room.state.status,
      mode: room.state.mode,
      rounds: room.state.rounds,
      currentRound: room.state.currentRound,
      canvasSnapshot: room.state.canvasSnapshot,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 4)
    },
    { upsert: true }
  );
}

function emitRoom(io: IOServer, room: RuntimeRoom) {
  io.to(room.state.roomId).emit("roomUpdated", publicRoom(room));
}

async function createUserIfNeeded(socket: IOSocket, token: string | undefined, username: string, avatar: string) {
  const existing = verifyToken(token);
  if (existing) {
    socket.data.userId = existing.sub;
    socket.data.username = existing.username;
    return { token: token!, userId: existing.sub, username: existing.username };
  }

  const clean = sanitizeNickname(username);
  if (!isDatabaseAvailable()) {
    const userId = crypto.randomUUID();
    const newToken = signToken({ sub: userId, username: clean, guest: true });
    socket.data.userId = userId;
    socket.data.username = clean;
    return { token: newToken, userId, username: clean };
  }

  const user = await UserModel.create({ username: clean, avatar, guest: true });
  const newToken = signToken({ sub: user.id, username: clean, guest: true });
  socket.data.userId = user.id;
  socket.data.username = clean;
  return { token: newToken, userId: user.id, username: clean };
}

function makePlayer(userId: string, username: string, avatar: string, host: boolean, index: number): Player {
  return {
    id: userId,
    username: sanitizeNickname(username),
    avatar,
    color: PLAYER_COLORS[index % PLAYER_COLORS.length],
    score: 0,
    ready: host,
    host,
    connected: true,
    lastSeen: Date.now(),
    correctGuess: false,
    team: index % 2 === 0 ? "aurora" : "ember"
  };
}

function attachSocket(socket: IOSocket, room: RuntimeRoom, player: Player) {
  const oldSocketId = room.socketsByPlayer.get(player.id);
  if (oldSocketId && oldSocketId !== socket.id) socketPlayers.delete(oldSocketId);
  const pendingRemoval = room.disconnectTimers.get(player.id);
  if (pendingRemoval) clearTimeout(pendingRemoval);
  room.disconnectTimers.delete(player.id);
  room.socketsByPlayer.set(player.id, socket.id);
  socketPlayers.set(socket.id, { roomId: room.state.roomId, playerId: player.id });
  player.connected = true;
  player.lastSeen = Date.now();
}

function migrateHost(room: RuntimeRoom) {
  const current = room.state.players.find((player) => player.id === room.state.hostId && player.connected);
  if (current) return;
  const next = room.state.players.find((player) => player.connected) ?? room.state.players[0];
  if (!next) return;
  room.state.hostId = next.id;
  room.state.players = room.state.players.map((player) => ({ ...player, host: player.id === next.id }));
  log("host migrated", { roomId: room.state.roomId, hostId: next.id });
}

function cleanupRoom(io: IOServer, roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.state.players.length > 0) return;
  if (room.timer) clearInterval(room.timer);
  rooms.delete(roomId);
  log("room cleaned", { roomId });
  io.in(roomId).socketsLeave(roomId);
}

function schedulePlayerRemoval(io: IOServer, room: RuntimeRoom, playerId: string) {
  const timer = setTimeout(async () => {
    room.disconnectTimers.delete(playerId);
    room.socketsByPlayer.delete(playerId);
    room.state.players = room.state.players.filter((player) => player.id !== playerId);
    migrateHost(room);
    await persistRoom(room);
    emitRoom(io, room);
    cleanupRoom(io, room.state.roomId);
  }, 30_000);
  room.disconnectTimers.set(playerId, timer);
}

function assertHost(socket: IOSocket, room: RuntimeRoom) {
  return socket.data.userId === room.state.hostId;
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
  return bucket.count <= 10;
}

function clearRoomTimer(room: RuntimeRoom) {
  if (room.timer) clearInterval(room.timer);
  room.timer = undefined;
}

async function finishRound(io: IOServer, room: RuntimeRoom) {
  clearRoomTimer(room);
  room.state.status = "results";
  const mvp = [...room.state.players].sort((a, b) => b.score - a.score)[0];
  if (isDatabaseAvailable()) {
    await MatchModel.create({
      roomId: room.state.roomId,
      mode: room.state.mode,
      participants: room.state.players.map((player) => player.id),
      winner: mvp?.id,
      scores: Object.fromEntries(room.state.players.map((player) => [player.id, player.score])),
      drawings: [{ round: room.state.currentRound, prompt: room.state.challenge?.prompt, snapshot: room.state.canvasSnapshot, replay: room.strokes }]
    });
  }
  io.to(room.state.roomId).emit("gameFinished", { room: publicRoom(room), mvp });
  emitRoom(io, room);
}

async function startTimer(io: IOServer, room: RuntimeRoom) {
  clearRoomTimer(room);
  let countdown = 3;
  room.state.status = "countdown";
  emitRoom(io, room);

  room.timer = setInterval(async () => {
    io.to(room.state.roomId).emit("gameCountdown", { seconds: countdown });
    countdown -= 1;
    if (countdown >= 0) return;

    clearRoomTimer(room);
    room.state.status = "drawing";
    room.state.currentRound += 1;
    room.state.timer = 90;
    room.guessed.clear();
    room.state.players = room.state.players.map((player) => ({ ...player, correctGuess: false }));

    const drawerIndex = (room.state.currentRound - 1) % Math.max(room.state.players.length, 1);
    room.state.drawerId = room.state.mode === "guess" ? room.state.players[drawerIndex]?.id : undefined;

    const generated = await generateChallenge(room.state.mode, "medium" satisfies Difficulty);
    room.secretWord = room.state.mode === "guess" ? getAnswerFromPrompt(generated.prompt) : undefined;
    room.state.challenge =
      room.state.mode === "guess"
        ? { ...generated, prompt: "Draw the secret word", hints: generated.hints, maskedWord: maskWord(room.secretWord) }
        : generated;

    room.strokes = [];
    room.undone = [];
    room.state.canvasSnapshot = undefined;
    io.to(room.state.roomId).emit("canvasState", publicCanvas(room));
    io.to(room.state.roomId).emit("challengeUpdate", room.state.challenge);
    emitRoom(io, room);

    room.timer = setInterval(async () => {
      room.state.timer -= 1;
      io.to(room.state.roomId).emit("timerUpdate", { timer: room.state.timer });
      if (room.state.timer <= 0) await finishRound(io, room);
    }, 1000);
  }, 1000);
}

function addScore(room: RuntimeRoom, playerId: string, points: number) {
  const player = room.state.players.find((item) => item.id === playerId);
  if (!player) return;
  player.score += points;
}

function publicCorrectMessage(room: RuntimeRoom, player: Player): ChatMessage {
  return {
    id: crypto.randomUUID(),
    roomId: room.state.roomId,
    playerId: player.id,
    username: player.username,
    avatar: player.avatar,
    message: `${player.username} guessed correctly`,
    system: true,
    correct: true,
    createdAt: Date.now()
  };
}

export function registerRoomHandlers(io: IOServer, socket: IOSocket) {
  log("socket connected", { socketId: socket.id });

  socket.on("createRoom", async (payload, ack) => {
    try {
      const auth = await createUserIfNeeded(socket, payload.token, payload.username, payload.avatar ?? "nova");
      let roomId = generateRoomId();
      while (rooms.has(roomId)) roomId = generateRoomId();

      const player = makePlayer(auth.userId, auth.username, payload.avatar ?? "nova", true, 0);
      const runtime: RuntimeRoom = {
        state: {
          roomId,
          hostId: auth.userId,
          status: "lobby",
          mode: payload.mode ?? "collaborative",
          rounds: 3,
          currentRound: 0,
          timer: 90,
          players: [player],
          strokeCount: 0
        },
        guessed: new Set(),
        socketsByPlayer: new Map(),
        disconnectTimers: new Map(),
        strokes: [],
        undone: []
      };

      rooms.set(roomId, runtime);
      attachSocket(socket, runtime, player);
      await socket.join(roomId);
      await persistRoom(runtime);
      log("room created", { roomId, hostId: player.id });
      ack({ ok: true, data: { room: publicRoom(runtime), player, token: auth.token } });
    } catch (error) {
      console.error("[room] create failed", error);
      ack({ ok: false, error: "Could not create room" });
    }
  });

  socket.on("joinRoom", async (payload, ack) => {
    try {
      const roomId = validateRoomCode(payload.roomId);
      if (!roomId) return ack({ ok: false, error: "Invalid room code" });

      const room = rooms.get(roomId);
      if (!room || room.state.status === "closed") return ack({ ok: false, error: "Room not found" });
      if (room.state.status !== "lobby") return ack({ ok: false, error: "Game already started" });

      const auth = await createUserIfNeeded(socket, payload.token, payload.username, payload.avatar ?? "orbit");
      let player = room.state.players.find((item) => item.id === auth.userId);
      if (!player && room.state.players.length >= MAX_PLAYERS) return ack({ ok: false, error: "Room full" });

      if (!player) {
        player = makePlayer(auth.userId, auth.username, payload.avatar ?? "orbit", false, room.state.players.length);
        room.state.players.push(player);
      }

      attachSocket(socket, room, player);
      await socket.join(roomId);
      await persistRoom(room);
      emitRoom(io, room);
      socket.emit("canvasState", publicCanvas(room));
      log("room joined", { roomId, playerId: player.id });
      ack({ ok: true, data: { room: publicRoom(room), player, token: auth.token, canvas: publicCanvas(room) } });
    } catch (error) {
      console.error("[room] join failed", error);
      ack({ ok: false, error: "Could not join room" });
    }
  });

  socket.on("reconnectRoom", async ({ roomId: rawRoomId, token }, ack) => {
    const roomId = validateRoomCode(rawRoomId);
    const auth = verifyToken(token);
    if (!roomId || !auth) return ack({ ok: false, error: "Invalid reconnect request" });
    const room = rooms.get(roomId);
    const player = room?.state.players.find((item) => item.id === auth.sub);
    if (!room || !player) return ack({ ok: false, error: "Room not found" });
    socket.data.userId = auth.sub;
    socket.data.username = auth.username;
    attachSocket(socket, room, player);
    await socket.join(roomId);
    emitRoom(io, room);
    socket.emit("canvasState", publicCanvas(room));
    log("player reconnected", { roomId, playerId: player.id });
    ack({ ok: true, data: { room: publicRoom(room), player, canvas: publicCanvas(room) } });
  });

  socket.on("leaveRoom", async ({ roomId }) => {
    const room = rooms.get(roomId);
    const session = socketPlayers.get(socket.id);
    if (!room || !session) return;
    room.state.players = room.state.players.filter((player) => player.id !== session.playerId);
    room.socketsByPlayer.delete(session.playerId);
    socketPlayers.delete(socket.id);
    await socket.leave(roomId);
    migrateHost(room);
    await persistRoom(room);
    emitRoom(io, room);
    cleanupRoom(io, roomId);
  });

  socket.on("playerReady", ({ roomId, ready }) => {
    const room = rooms.get(roomId);
    const player = room?.state.players.find((item) => item.id === socket.data.userId);
    if (!room || !player) return;
    player.ready = ready;
    emitRoom(io, room);
  });

  socket.on("updateRoomSettings", ({ roomId, mode, rounds }) => {
    const room = rooms.get(roomId);
    if (!room || !assertHost(socket, room) || room.state.status !== "lobby") return;
    if (mode) room.state.mode = mode;
    if (rounds) room.state.rounds = Math.min(10, Math.max(1, rounds));
    emitRoom(io, room);
  });

  socket.on("startGame", async ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !assertHost(socket, room)) return;
    log("game starting", { roomId, mode: room.state.mode });
    await startTimer(io, room);
  });

  socket.on("endGame", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !assertHost(socket, room)) return;
    room.state.status = "closed";
    clearRoomTimer(room);
    io.to(roomId).emit("gameFinished", { room: publicRoom(room) });
    emitRoom(io, room);
  });

  socket.on("kickPlayer", ({ roomId, playerId }) => {
    const room = rooms.get(roomId);
    if (!room || !assertHost(socket, room)) return;
    room.state.players = room.state.players.filter((player) => player.id !== playerId);
    room.socketsByPlayer.delete(playerId);
    migrateHost(room);
    emitRoom(io, room);
  });

  socket.on("drawStart", ({ roomId, stroke }) => {
    const room = rooms.get(roomId);
    if (!room || !socketPlayers.has(socket.id)) return;
    socket.to(roomId).emit("drawStart", stroke);
  });

  socket.on("drawMove", ({ roomId, stroke }) => {
    const room = rooms.get(roomId);
    if (!room || !socketPlayers.has(socket.id)) return;
    socket.to(roomId).emit("drawMove", stroke);
  });

  socket.on("drawEnd", ({ roomId, stroke, snapshot }) => {
    const room = rooms.get(roomId);
    if (!room || room.strokes.some((item) => item.strokeId === stroke.strokeId)) return;
    room.strokes.push(stroke);
    room.undone = [];
    room.state.canvasSnapshot = snapshot ?? room.state.canvasSnapshot;
    room.state.strokeCount = room.strokes.length;
    socket.to(roomId).emit("drawEnd", stroke);
    log("stroke saved", { roomId, strokeId: stroke.strokeId, points: stroke.points.length });
  });

  socket.on("clearCanvas", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.undone = [...room.strokes];
    room.strokes = [];
    room.state.canvasSnapshot = undefined;
    room.state.strokeCount = 0;
    io.to(roomId).emit("clearCanvas");
    log("canvas cleared", { roomId });
  });

  socket.on("undoStroke", ({ roomId, strokeId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const index = room.strokes.findIndex((stroke) => stroke.strokeId === strokeId && stroke.playerId === socket.data.userId);
    if (index < 0) return;
    const [stroke] = room.strokes.splice(index, 1);
    room.undone.push(stroke);
    room.state.strokeCount = room.strokes.length;
    io.to(roomId).emit("undoStroke", { strokeId });
  });

  socket.on("redoStroke", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    let index = -1;
    for (let cursor = room.undone.length - 1; cursor >= 0; cursor -= 1) {
      if (room.undone[cursor]?.playerId === socket.data.userId) {
        index = cursor;
        break;
      }
    }
    if (index < 0) return;
    const [stroke] = room.undone.splice(index, 1);
    room.strokes.push(stroke);
    room.state.strokeCount = room.strokes.length;
    io.to(roomId).emit("redoStroke", stroke);
  });

  socket.on("chatMessage", ({ roomId, message }) => {
    if (!allowChat(socket.id)) return socket.emit("errorMessage", { message: "Slow down a little." });
    const room = rooms.get(roomId);
    const player = room?.state.players.find((item) => item.id === socket.data.userId);
    if (!room || !player) return;
    const clean = message.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 160);
    if (!clean) return;

    if (room.state.mode === "guess" && room.state.status === "drawing" && room.secretWord) {
      if (player.id === room.state.drawerId) {
        socket.emit("errorMessage", { message: "The drawing player cannot guess." });
        return;
      }
      if (room.guessed.has(player.id)) {
        socket.emit("errorMessage", { message: "You already guessed correctly." });
        return;
      }
      if (isCorrectGuess(clean, room.secretWord)) {
        room.guessed.add(player.id);
        player.correctGuess = true;
        addScore(room, player.id, Math.max(20, 50 + room.state.timer));
        room.state.challenge = {
          ...(room.state.challenge ?? { id: crypto.randomUUID(), prompt: "Draw the secret word", difficulty: "medium", hints: [] }),
          maskedWord: maskWord(room.secretWord, Math.min(room.guessed.size, normalizeGuess(room.secretWord).replace(/ /g, "").length))
        };
        io.to(roomId).emit("chatMessage", publicCorrectMessage(room, player));
        io.to(roomId).emit("scoreUpdate", { players: publicRoom(room).players });
        io.to(roomId).emit("challengeUpdate", room.state.challenge);
        emitRoom(io, room);
        log("correct guess", { roomId, playerId: player.id });
        return;
      }
    }

    const chat: ChatMessage = {
      id: crypto.randomUUID(),
      roomId,
      playerId: player.id,
      username: player.username,
      avatar: player.avatar,
      message: clean,
      createdAt: Date.now()
    };
    io.to(roomId).emit("chatMessage", chat);
    log("chat", { roomId, playerId: player.id });
  });

  socket.on("typing", ({ roomId, typing }) => {
    const room = rooms.get(roomId);
    const player = room?.state.players.find((item) => item.id === socket.data.userId);
    if (!room || !player) return;
    socket.to(roomId).emit("typing", { playerId: player.id, username: player.username, typing });
  });

  socket.on("pingCheck", ({ sentAt }, ack) => {
    ack({ sentAt, serverAt: Date.now() });
  });

  socket.on("huntTap", ({ roomId, objectId, x, y }) => {
    const room = rooms.get(roomId);
    const player = room?.state.players.find((item) => item.id === socket.data.userId);
    const target = room?.state.challenge?.hiddenObjects?.find((item) => item.id === objectId);
    if (!room || !player || !target) return;
    const distance = Math.hypot(target.x - x, target.y - y);
    if (distance <= target.radius) {
      player.score += Math.round(100 + room.state.timer * 2);
      io.to(roomId).emit("scoreUpdate", { players: publicRoom(room).players });
    }
  });

  socket.on("disconnect", () => {
    const session = socketPlayers.get(socket.id);
    log("socket disconnected", { socketId: socket.id, session });
    if (!session) return;
    socketPlayers.delete(socket.id);
    const room = rooms.get(session.roomId);
    const player = room?.state.players.find((item) => item.id === session.playerId);
    if (!room || !player) return;
    player.connected = false;
    player.lastSeen = Date.now();
    room.socketsByPlayer.delete(player.id);
    migrateHost(room);
    emitRoom(io, room);
    schedulePlayerRemoval(io, room, player.id);
  });
}
