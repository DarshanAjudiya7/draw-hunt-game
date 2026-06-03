import { Router } from "express";
import { z } from "zod";
import type { Difficulty, GameMode } from "@drawhunt/shared";
import { generateChallenge } from "../services/challengeService.js";

export const challengeRouter = Router();

challengeRouter.post("/generate", async (req, res) => {
  const body = z
    .object({
      mode: z.enum(["collaborative", "guess", "ai-challenge", "drawing-hunt", "team-battle"]).default("ai-challenge"),
      difficulty: z.enum(["easy", "medium", "hard", "expert"]).default("medium")
    })
    .parse(req.body);
  res.json(await generateChallenge(body.mode as GameMode, body.difficulty as Difficulty));
});

