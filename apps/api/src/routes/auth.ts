import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { sanitizeNickname } from "@drawhunt/shared";
import { UserModel } from "../models/User.js";
import { authLimiter } from "../middleware/security.js";
import { signToken } from "../middleware/auth.js";
import { isDatabaseAvailable } from "../config/db.js";

export const authRouter = Router();

authRouter.post("/guest", authLimiter, async (req, res) => {
  const username = sanitizeNickname(String(req.body.username ?? "Guest"));
  if (!isDatabaseAvailable()) {
    const id = crypto.randomUUID();
    const avatar = req.body.avatar ?? "spark";
    const token = signToken({ sub: id, username, guest: true });
    res.status(201).json({ token, user: { id, username, avatar, score: 0 } });
    return;
  }
  const user = await UserModel.create({ username, avatar: req.body.avatar ?? "spark", guest: true });
  const token = signToken({ sub: user.id, username, guest: true });
  res.status(201).json({ token, user: { id: user.id, username, avatar: user.avatar, score: user.score } });
});

authRouter.post("/register", authLimiter, async (req, res) => {
  if (!isDatabaseAvailable()) {
    res.status(503).json({ error: "Account registration requires MongoDB. Use guest mode or configure MONGODB_URI." });
    return;
  }
  const body = z.object({ username: z.string(), password: z.string().min(8), avatar: z.string().default("nova") }).parse(req.body);
  const username = sanitizeNickname(body.username);
  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await UserModel.create({ username, avatar: body.avatar, passwordHash });
  res.status(201).json({ token: signToken({ sub: user.id, username }), user: { id: user.id, username, avatar: user.avatar } });
});
