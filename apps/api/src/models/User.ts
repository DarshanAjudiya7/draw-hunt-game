import mongoose, { Schema } from "mongoose";

const achievementSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    unlockedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    username: { type: String, required: true, trim: true, maxlength: 24, index: true },
    avatar: { type: String, required: true },
    passwordHash: { type: String },
    guest: { type: Boolean, default: false },
    score: { type: Number, default: 0 },
    achievements: { type: [achievementSchema], default: [] }
  },
  { timestamps: true }
);

export const UserModel = mongoose.model("User", userSchema);

