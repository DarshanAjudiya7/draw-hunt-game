import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./store/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101319",
        mist: "#f5f7fb",
        aurora: "#42d392",
        ember: "#fb7185",
        ocean: "#38bdf8"
      },
      boxShadow: {
        glass: "0 18px 60px rgba(16, 19, 25, 0.18)"
      }
    }
  },
  plugins: []
};

export default config;

