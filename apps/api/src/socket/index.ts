import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import type { Server } from "http";
import { Server as SocketServer } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@drawhunt/shared";
import { env } from "../config/env.js";
import { verifyToken } from "../middleware/auth.js";
import { registerRoomHandlers } from "./roomManager.js";

export async function createRealtimeServer(server: Server) {
  const io = new SocketServer<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
    maxHttpBufferSize: 1e6,
    pingTimeout: 20_000
  });

  if (env.REDIS_URL) {
    const pubClient = createClient({ url: env.REDIS_URL });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log("[socket] redis adapter enabled");
  }

  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    const user = verifyToken(token);
    if (user) {
      socket.data.userId = user.sub;
      socket.data.username = user.username;
    }
    next();
  });

  io.on("connection", (socket) => registerRoomHandlers(io, socket));
  return io;
}

