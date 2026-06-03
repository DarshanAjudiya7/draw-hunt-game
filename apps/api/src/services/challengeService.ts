import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Challenge, Difficulty, GameMode } from "@drawhunt/shared";
import { env } from "../config/env.js";

const fallbackPrompts: Record<Difficulty, string[]> = {
  easy: ["Draw a sleepy moon", "Draw a beach umbrella", "Draw a smiling robot"],
  medium: ["Draw a pirate cafe", "Draw a rocket-powered bicycle", "Draw a haunted library"],
  hard: ["Draw a city inside a snow globe", "Draw a dragon eating pizza", "Draw a time-traveling gardener"],
  expert: ["Draw a cyberpunk elephant orchestra", "Draw a futuristic city during a candy storm", "Draw a courtroom on Mars"]
};

function fallbackChallenge(mode: GameMode, difficulty: Difficulty): Challenge {
  const list = fallbackPrompts[difficulty];
  const prompt = list[Math.floor(Math.random() * list.length)];
  return {
    id: crypto.randomUUID(),
    prompt,
    difficulty,
    hints: prompt.split(" ").filter((word) => word.length > 3).slice(0, 3),
    hiddenObjects:
      mode === "drawing-hunt"
        ? [
            { id: "star", label: "Star", x: 0.24, y: 0.3, radius: 0.06 },
            { id: "key", label: "Key", x: 0.7, y: 0.62, radius: 0.05 }
          ]
        : undefined
  };
}

export async function generateChallenge(mode: GameMode, difficulty: Difficulty): Promise<Challenge> {
  if (!env.GEMINI_API_KEY) return fallbackChallenge(mode, difficulty);

  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const result = await model.generateContent(
    `Generate one premium DrawHunt ${mode} prompt at ${difficulty} difficulty. Return strict JSON with prompt:string, hints:string[].`
  );
  const text = result.response.text().replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(text) as { prompt: string; hints?: string[] };
    return {
      id: crypto.randomUUID(),
      prompt: parsed.prompt.slice(0, 120),
      difficulty,
      hints: (parsed.hints ?? []).slice(0, 5)
    };
  } catch {
    return fallbackChallenge(mode, difficulty);
  }
}

