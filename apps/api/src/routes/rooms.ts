import { Router } from "express";
import { isDatabaseAvailable } from "../config/db.js";
import { RoomModel } from "../models/Room.js";

export const roomRouter = Router();

roomRouter.get("/:roomId", async (req, res) => {
  if (!isDatabaseAvailable()) {
    res.status(503).json({ error: "Room REST lookup requires MongoDB. Active development rooms are available through Socket.io." });
    return;
  }
  const room = await RoomModel.findOne({ roomId: req.params.roomId.toUpperCase(), status: { $ne: "closed" } }).lean();
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  res.json(room);
});
