"use client";

import { useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, Timer, Trophy, Wifi, WifiOff } from "lucide-react";
import { CanvasBoard } from "./CanvasBoard";
import { ChatPanel } from "./ChatPanel";
import { Lobby } from "./Lobby";
import { Toolbar } from "./Toolbar";
import { getSocket } from "@/lib/socket";
import { useGameStore } from "@/store/gameStore";

export function GameShell() {
  const socket = useMemo(() => getSocket(), []);
  const { room, connected, error, latency, setCanvasState, setConnected, setError, setLatency, setRoom, setSelf, addChat, setTyping } = useGameStore();

  useEffect(() => {
    socket.connect();
    socket.on("connect", () => {
      setConnected(true);
      setError(undefined);
      const currentRoom = useGameStore.getState().room;
      const token = localStorage.getItem("drawhunt.token") ?? undefined;
      if (currentRoom && token) {
        socket.emit("reconnectRoom", { roomId: currentRoom.roomId, token }, (ack) => {
          if (ack.ok && ack.data) {
            setRoom(ack.data.room);
            setSelf(ack.data.player);
            setCanvasState(ack.data.canvas);
          }
        });
      }
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("roomUpdated", setRoom);
    socket.on("canvasState", setCanvasState);
    socket.on("chatMessage", addChat);
    socket.on("typing", ({ playerId, username, typing }) => setTyping(playerId, username, typing));
    socket.on("errorMessage", ({ message }) => setError(message));
    socket.on("timerUpdate", ({ timer }) => {
      const current = useGameStore.getState().room;
      if (current) setRoom({ ...current, timer });
    });
    socket.on("challengeUpdate", (challenge) => {
      const current = useGameStore.getState().room;
      if (current) setRoom({ ...current, challenge });
    });
    socket.on("scoreUpdate", ({ players }) => {
      const current = useGameStore.getState().room;
      if (current) setRoom({ ...current, players });
    });
    const interval = setInterval(() => {
      const sentAt = Date.now();
      socket.emit("pingCheck", { sentAt }, (ack) => setLatency(Date.now() - ack.sentAt));
    }, 3000);
    return () => {
      clearInterval(interval);
      socket.off();
      socket.disconnect();
    };
  }, [addChat, setCanvasState, setConnected, setError, setLatency, setRoom, setSelf, setTyping, socket]);

  return (
    <main className="min-h-screen px-3 py-3 md:px-6">
      <div className="mx-auto flex max-w-7xl items-center justify-between py-2">
        <div className="text-lg font-black">DrawHunt</div>
        <div className="flex items-center gap-3 text-sm">
          {room ? (
            <span className="flex items-center gap-1">
              <Timer size={16} /> {room.timer}s
            </span>
          ) : null}
          <span className="hidden items-center gap-1 rounded-md bg-white/10 px-2 py-1 sm:flex">
            <Activity size={14} /> {latency ?? "--"}ms
          </span>
          <span className="flex items-center gap-1">{connected ? <Wifi size={16} className="text-aurora" /> : <WifiOff size={16} className="text-ember" />}</span>
        </div>
      </div>
      {error ? <div className="mx-auto mb-2 max-w-7xl rounded-md border border-ember/40 bg-ember/15 px-3 py-2 text-sm text-white">{error}</div> : null}
      <AnimatePresence mode="wait">
        {!room || room.status === "lobby" ? (
          <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto max-w-7xl">
            <Lobby />
          </motion.div>
        ) : (
          <motion.div key="game" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="mx-auto flex max-w-7xl flex-col gap-3">
            <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-lg p-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/50">{room.mode}</div>
                <div className="font-bold">{room.challenge?.prompt ?? "Get ready"}</div>
                {room.challenge?.maskedWord ? <div className="mt-1 font-mono text-sm tracking-[0.25em] text-aurora">{room.challenge.maskedWord}</div> : null}
              </div>
              <div className="flex items-center gap-2">
                <Trophy size={18} className="text-aurora" />
                {room.players
                  .slice()
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 3)
                  .map((player) => (
                    <span key={player.id} className="rounded-md bg-white/10 px-2 py-1 text-sm">
                      {player.username} {player.score}
                    </span>
                  ))}
              </div>
            </div>
            <Toolbar />
            <div className="flex min-h-[calc(100vh-190px)] flex-col gap-3 lg:flex-row">
              <CanvasBoard />
              <ChatPanel />
            </div>
            <div className="glass flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 text-xs text-white/60">
              <span>Room {room.roomId}</span>
              <span>{room.players.filter((player) => player.connected).length}/{room.players.length} connected</span>
              <span>{connected ? "socket online" : "socket reconnecting"}</span>
              <span>{latency ?? "--"}ms ping</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
