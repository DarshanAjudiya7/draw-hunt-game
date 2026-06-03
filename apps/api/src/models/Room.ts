import mongoose, { Schema } from "mongoose";

const roomPlayerSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    socketId: String,
    username: String,
    avatar: String,
    color: String,
    score: { type: Number, default: 0 },
    ready: { type: Boolean, default: false },
    host: { type: Boolean, default: false },
    team: { type: String, enum: ["aurora", "ember"] }
  },
  { _id: false }
);

const roomSchema = new Schema(
  {
    roomId: { type: String, required: true, unique: true, index: true },
    players: { type: [roomPlayerSchema], default: [] },
    host: { type: Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ["lobby", "countdown", "drawing", "results", "closed"], default: "lobby" },
    mode: { type: String, default: "collaborative" },
    rounds: { type: Number, default: 3 },
    currentRound: { type: Number, default: 0 },
    canvasSnapshot: String,
    expiresAt: { type: Date, index: { expires: 0 } }
  },
  { timestamps: true }
);

export const RoomModel = mongoose.model("Room", roomSchema);

