"use client";

import { useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Timer, Trophy, Wifi, WifiOff } from "lucide-react";
import { CanvasBoard } from "./CanvasBoard";
import { ChatPanel } from "./ChatPanel";
import { Lobby } from "./Lobby";
import { Toolbar } from "./Toolbar";
import { getSocket } from "@/lib/socket";
import { useGameStore } from "@/store/gameStore";

export function GameShell() {
  const socket = useMemo(() => getSocket(), []);
  const { room, connected, setConnected, setRoom, addChat } = useGameStore();

  useEffect(() => {
    socket.connect();
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("roomUpdated", setRoom);
    socket.on("chatMessage", addChat);
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
    return () => {
      socket.off();
      socket.disconnect();
    };
  }, [addChat, setConnected, setRoom, socket]);

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
          <span className="flex items-center gap-1">{connected ? <Wifi size={16} className="text-aurora" /> : <WifiOff size={16} className="text-ember" />}</span>
        </div>
      </div>
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
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

