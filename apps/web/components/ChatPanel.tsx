"use client";

import { Send } from "lucide-react";
import { getSocket } from "@/lib/socket";
import { useGameStore } from "@/store/gameStore";

export function ChatPanel() {
  const { room, chat } = useGameStore();

  const send = (formData: FormData) => {
    const message = String(formData.get("message") ?? "");
    if (!room || !message.trim()) return;
    getSocket().emit("chatMessage", { roomId: room.roomId, message });
    const input = document.getElementById("chat-input") as HTMLInputElement | null;
    if (input) input.value = "";
  };

  return (
    <aside className="glass flex min-h-[240px] flex-col rounded-lg p-3 lg:w-80">
      <div className="text-sm font-bold">Live Guessing</div>
      <div className="mt-3 flex flex-1 flex-col gap-2 overflow-y-auto text-sm">
        {chat.map((item) => (
          <div key={item.id} className={item.system ? "text-aurora" : "text-white/85"}>
            <span className="font-semibold">{item.system ? "" : `${item.username}: `}</span>
            {item.message}
          </div>
        ))}
      </div>
      <form action={send} className="mt-3 flex gap-2">
        <input id="chat-input" name="message" className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/10 px-3 py-2 outline-none" placeholder="Guess or chat" />
        <button className="grid h-10 w-10 place-items-center rounded-md bg-white text-ink" title="Send">
          <Send size={17} />
        </button>
      </form>
    </aside>
  );
}

