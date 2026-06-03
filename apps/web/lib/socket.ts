"use client";

import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@drawhunt/shared";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | undefined;

export function getSocket() {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000", {
      autoConnect: false,
      transports: ["websocket"],
      auth: { token: typeof window !== "undefined" ? localStorage.getItem("drawhunt.token") : undefined }
    });
  }
  return socket;
}

