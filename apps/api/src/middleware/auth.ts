import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface AuthPayload {
  sub: string;
  username: string;
  guest?: boolean;
}

export function signToken(payload: AuthPayload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: payload.guest ? "7d" : "30d" });
}

export function verifyToken(token?: string): AuthPayload | undefined {
  if (!token) return undefined;
  try {
    return jwt.verify(token, env.JWT_SECRET) as AuthPayload;
  } catch {
    return undefined;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.locals.user = user;
  next();
}

