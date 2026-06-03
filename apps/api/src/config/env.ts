import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CLIENT_ORIGIN: z.string().default("http://localhost:3000"),
  MONGODB_URI: z.string().default("mongodb://127.0.0.1:27017/drawhunt"),
  JWT_SECRET: z.string().min(16).default("development-secret-change-me"),
  GEMINI_API_KEY: z.string().optional(),
  REDIS_URL: z.string().optional(),
  ALLOW_MEMORY_DB: z.coerce.boolean().default(true)
});

export const env = schema.parse(process.env);
