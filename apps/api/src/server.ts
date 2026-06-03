import http from "http";
import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { connectDatabase } from "./config/db.js";
import { apiLimiter } from "./middleware/security.js";
import { authRouter } from "./routes/auth.js";
import { challengeRouter } from "./routes/challenges.js";
import { roomRouter } from "./routes/rooms.js";
import { createRealtimeServer } from "./socket/index.js";

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(apiLimiter);

app.get("/health", (_req, res) => res.json({ ok: true, service: "drawhunt-api" }));
app.use("/auth", authRouter);
app.use("/challenges", challengeRouter);
app.use("/rooms", roomRouter);

const server = http.createServer(app);

await connectDatabase();
await createRealtimeServer(server);

server.listen(env.PORT, () => {
  console.log(`[api] listening on ${env.PORT}`);
});
