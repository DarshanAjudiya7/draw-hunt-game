import mongoose from "mongoose";
import { env } from "./env.js";

let databaseAvailable = false;

export function isDatabaseAvailable() {
  return databaseAvailable && mongoose.connection.readyState === 1;
}

export async function connectDatabase() {
  mongoose.set("strictQuery", true);
  try {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 2500 });
    databaseAvailable = true;
    console.log("[db] connected");
  } catch (error) {
    databaseAvailable = false;
    if (env.NODE_ENV === "production" || !env.ALLOW_MEMORY_DB) {
      throw error;
    }
    console.warn("[db] MongoDB unavailable; running development server with in-memory room state only.");
  }
}
