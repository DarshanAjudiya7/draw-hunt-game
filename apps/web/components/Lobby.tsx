"use client";

import { motion } from "framer-motion";
import { Copy, Crown, LogIn, Play, Users } from "lucide-react";
import type { GameMode } from "@drawhunt/shared";
import { getSocket } from "@/lib/socket";
import { useGameStore } from "@/store/gameStore";

const modes: Array<{ id: GameMode; label: string }> = [
  { id: "collaborative", label: "Collaborative" },
  { id: "guess", label: "Guess" },
  { id: "ai-challenge", label: "AI Challenge" },
  { id: "drawing-hunt", label: "Hunt" },
  { id: "team-battle", label: "Team Battle" }
];

export function Lobby() {
  const { room, self, mode, setMode, setRoom, setSelf, setToken } = useGameStore();

  const create = () => {
    const username = (document.getElementById("username") as HTMLInputElement | null)?.value || "Guest";
    const socket = getSocket();
    if (!socket.connected) socket.connect();
    socket.emit("createRoom", { username, mode, token: localStorage.getItem("drawhunt.token") ?? undefined }, (ack) => {
      if (ack.ok && ack.data) {
        setToken(ack.data.token);
        setSelf(ack.data.player);
        setRoom(ack.data.room);
      }
    });
  };

  const join = () => {
    const username = (document.getElementById("username") as HTMLInputElement | null)?.value || "Guest";
    const roomId = (document.getElementById("roomId") as HTMLInputElement | null)?.value || "";
    const socket = getSocket();
    if (!socket.connected) socket.connect();
    socket.emit("joinRoom", { roomId, username, token: localStorage.getItem("drawhunt.token") ?? undefined }, (ack) => {
      if (ack.ok && ack.data) {
        setToken(ack.data.token);
        setSelf(ack.data.player);
        setRoom(ack.data.room);
      }
    });
  };

  const start = () => {
    if (room) getSocket().emit("startGame", { roomId: room.roomId });
  };

  if (!room) {
    return (
      <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="mx-auto grid w-full max-w-5xl gap-5 px-4 py-6 md:grid-cols-[1fr_0.85fr]">
        <div className="min-h-[520px] rounded-lg border border-white/10 bg-[url('https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=1400&q=80')] bg-cover bg-center p-6 shadow-glass">
          <div className="flex h-full flex-col justify-end">
            <h1 className="text-5xl font-black tracking-normal text-white md:text-7xl">DrawHunt</h1>
            <p className="mt-3 max-w-xl text-base text-white/85">Real-time drawing battles, AI prompts, team canvases, and touch-first play.</p>
          </div>
        </div>
        <div className="glass rounded-lg p-5">
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-white/60">
            <Users size={16} /> Room Setup
          </div>
          <input id="username" className="mt-5 w-full rounded-md border border-white/10 bg-white/10 px-4 py-3 outline-none" placeholder="Nickname" maxLength={24} />
          <input id="roomId" className="mt-3 w-full rounded-md border border-white/10 bg-white/10 px-4 py-3 uppercase outline-none" placeholder="Room code" maxLength={6} />
          <div className="mt-4 grid grid-cols-2 gap-2">
            {modes.map((item) => (
              <button key={item.id} onClick={() => setMode(item.id)} className={`rounded-md border px-3 py-2 text-sm ${mode === item.id ? "border-aurora bg-aurora/25" : "border-white/10 bg-white/5"}`}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button onClick={create} className="flex items-center justify-center gap-2 rounded-md bg-aurora px-4 py-3 font-bold text-ink">
              <Play size={18} /> Create
            </button>
            <button onClick={join} className="flex items-center justify-center gap-2 rounded-md bg-white px-4 py-3 font-bold text-ink">
              <LogIn size={18} /> Join
            </button>
          </div>
        </div>
      </motion.section>
    );
  }

  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-white/50">Room Code</div>
          <div className="mt-1 flex items-center gap-2 text-3xl font-black">
            {room.roomId}
            <button title="Copy invite" onClick={() => navigator.clipboard.writeText(`${location.origin}?room=${room.roomId}`)} className="grid h-9 w-9 place-items-center rounded-md border border-white/10 bg-white/5">
              <Copy size={17} />
            </button>
          </div>
        </div>
        {self?.host || room.hostId === self?.id ? (
          <button onClick={start} className="flex items-center gap-2 rounded-md bg-aurora px-5 py-3 font-bold text-ink">
            <Play size={18} /> Start
          </button>
        ) : null}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {room.players.map((player) => (
          <div key={player.id} className="rounded-md border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: player.color }} />
              <span className="truncate font-semibold">{player.username}</span>
              {player.host ? <Crown className="text-aurora" size={14} /> : null}
            </div>
            <div className="mt-2 text-xs text-white/50">{player.score} pts</div>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
