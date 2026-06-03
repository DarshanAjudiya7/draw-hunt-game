"use client";

import { create } from "zustand";
import type { ChatMessage, GameMode, Player, RoomState, StrokePacket, Tool } from "@drawhunt/shared";

interface GameState {
  room?: RoomState;
  self?: Player;
  token?: string;
  connected: boolean;
  tool: Tool;
  color: string;
  size: number;
  strokes: StrokePacket[];
  undone: StrokePacket[];
  chat: ChatMessage[];
  mode: GameMode;
  setRoom: (room?: RoomState) => void;
  setSelf: (player?: Player) => void;
  setToken: (token: string) => void;
  setConnected: (connected: boolean) => void;
  setTool: (tool: Tool) => void;
  setColor: (color: string) => void;
  setSize: (size: number) => void;
  addStroke: (stroke: StrokePacket) => void;
  removeStroke: (strokeId: string) => void;
  clearStrokes: () => void;
  addChat: (message: ChatMessage) => void;
  setMode: (mode: GameMode) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  connected: false,
  tool: "brush",
  color: "#42d392",
  size: 6,
  strokes: [],
  undone: [],
  chat: [],
  mode: "collaborative",
  setRoom: (room) =>
    set({
      room,
      self: room?.players.find((player) => player.id === get().self?.id) ?? get().self
    }),
  setSelf: (player) => set({ self: player, color: player?.color ?? get().color }),
  setToken: (token) => {
    localStorage.setItem("drawhunt.token", token);
    set({ token });
  },
  setConnected: (connected) => set({ connected }),
  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setSize: (size) => set({ size }),
  addStroke: (stroke) => set({ strokes: [...get().strokes.filter((item) => item.strokeId !== stroke.strokeId), stroke] }),
  removeStroke: (strokeId) => set({ strokes: get().strokes.filter((stroke) => stroke.strokeId !== strokeId) }),
  clearStrokes: () => set({ strokes: [], undone: [] }),
  addChat: (message) => set({ chat: [...get().chat.slice(-30), message] }),
  setMode: (mode) => set({ mode })
}));
