"use client";

import { useEffect, useRef } from "react";
import { Send } from "lucide-react";
import { getSocket } from "@/lib/socket";
import { useGameStore } from "@/store/gameStore";

export function ChatPanel() {
  const { room, chat, typingUsers } = useGameStore();
  const listRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length]);

  const send = (formData: FormData) => {
    const message = String(formData.get("message") ?? "");
    if (!room || !message.trim()) return;
    getSocket().emit("chatMessage", { roomId: room.roomId, message });
    const input = document.getElementById("chat-input") as HTMLInputElement | null;
    if (input) input.value = "";
    if (room) getSocket().emit("typing", { roomId: room.roomId, typing: false });
  };

  const markTyping = () => {
    if (!room) return;
    getSocket().emit("typing", { roomId: room.roomId, typing: true });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => getSocket().emit("typing", { roomId: room.roomId, typing: false }), 900);
  };

  const typingNames = Object.values(typingUsers);

  return (
    <aside className="glass flex min-h-[240px] flex-col rounded-lg p-3 lg:w-80">
      <div className="text-sm font-bold">Live Guessing</div>
      <div ref={listRef} className="mt-3 flex flex-1 flex-col gap-2 overflow-y-auto text-sm">
        {chat.map((item) => (
          <div key={item.id} className={`rounded-md px-2 py-1 ${item.correct ? "bg-aurora/20 text-aurora" : item.system ? "text-aurora" : "bg-white/5 text-white/85"}`}>
            <div className="flex items-center gap-2">
              {item.avatar ? <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-xs">{item.avatar.slice(0, 1).toUpperCase()}</span> : null}
              <span className="min-w-0 flex-1 truncate font-semibold">{item.system ? "System" : item.username}</span>
              <time className="text-[10px] text-white/45">{new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
            </div>
            <div className="mt-1">{item.correct ? "Correct Guess" : item.message}</div>
          </div>
        ))}
      </div>
      {typingNames.length ? <div className="mt-2 min-h-4 text-xs text-white/50">{typingNames.join(", ")} typing...</div> : <div className="mt-2 min-h-4" />}
      <form action={send} className="mt-3 flex gap-2">
        <input id="chat-input" name="message" onChange={markTyping} className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/10 px-3 py-2 outline-none" placeholder="Guess or chat" />
        <button className="grid h-10 w-10 place-items-center rounded-md bg-white text-ink" title="Send">
          <Send size={17} />
        </button>
      </form>
    </aside>
  );
}
