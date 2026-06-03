"use client";

import { create } from "zustand";
import type { CanvasState, ChatMessage, GameMode, Player, RoomState, StrokePacket, Tool } from "@drawhunt/shared";

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
  error?: string;
  latency?: number;
  typingUsers: Record<string, string>;
  setRoom: (room?: RoomState) => void;
  setSelf: (player?: Player) => void;
  setCanvasState: (state: CanvasState) => void;
  setToken: (token: string) => void;
  setConnected: (connected: boolean) => void;
  setTool: (tool: Tool) => void;
  setColor: (color: string) => void;
  setSize: (size: number) => void;
  addStroke: (stroke: StrokePacket) => void;
  undoStroke: (strokeId: string) => void;
  redoStroke: (stroke: StrokePacket) => void;
  clearStrokes: () => void;
  addChat: (message: ChatMessage) => void;
  setMode: (mode: GameMode) => void;
  setError: (error?: string) => void;
  setLatency: (latency?: number) => void;
  setTyping: (playerId: string, username: string, typing: boolean) => void;
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
  typingUsers: {},
  setRoom: (room) =>
    set({
      room,
      self: room?.players.find((player) => player.id === get().self?.id) ?? get().self
    }),
  setSelf: (player) => set({ self: player, color: player?.color ?? get().color }),
  setCanvasState: (state) => set({ strokes: state.strokes, undone: [] }),
  setToken: (token) => {
    localStorage.setItem("drawhunt.token", token);
    set({ token });
  },
  setConnected: (connected) => set({ connected }),
  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setSize: (size) => set({ size }),
  addStroke: (stroke) => set({ strokes: [...get().strokes.filter((item) => item.strokeId !== stroke.strokeId), stroke] }),
  undoStroke: (strokeId) => {
    const stroke = get().strokes.find((item) => item.strokeId === strokeId);
    set({
      strokes: get().strokes.filter((item) => item.strokeId !== strokeId),
      undone: stroke ? [...get().undone.filter((item) => item.strokeId !== strokeId), stroke] : get().undone
    });
  },
  redoStroke: (stroke) =>
    set({
      strokes: [...get().strokes.filter((item) => item.strokeId !== stroke.strokeId), stroke],
      undone: get().undone.filter((item) => item.strokeId !== stroke.strokeId)
    }),
  clearStrokes: () => set({ strokes: [], undone: [] }),
  addChat: (message) => set({ chat: [...get().chat.slice(-30), message] }),
  setMode: (mode) => set({ mode }),
  setError: (error) => set({ error }),
  setLatency: (latency) => set({ latency }),
  setTyping: (playerId, username, typing) => {
    const next = { ...get().typingUsers };
    if (typing) next[playerId] = username;
    else delete next[playerId];
    set({ typingUsers: next });
  }
}));
