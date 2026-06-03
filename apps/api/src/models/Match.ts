import mongoose, { Schema } from "mongoose";

const matchSchema = new Schema(
  {
    roomId: { type: String, required: true, index: true },
    mode: { type: String, required: true },
    participants: [{ type: Schema.Types.ObjectId, ref: "User" }],
    winner: { type: Schema.Types.ObjectId, ref: "User" },
    scores: { type: Map, of: Number, default: {} },
    drawings: [
      {
        round: Number,
        prompt: String,
        snapshot: String,
        replay: Schema.Types.Mixed
      }
    ]
  },
  { timestamps: true }
);

export const MatchModel = mongoose.model("Match", matchSchema);

