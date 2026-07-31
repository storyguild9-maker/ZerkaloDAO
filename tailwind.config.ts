import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#070A0B",
        graphite: "#101716",
        gold: "#D8AE5E",
        moss: "#183326",
        mist: "#D7E0DC",
        water: "#2A6F73"
      },
      boxShadow: {
        glow: "0 0 70px rgba(216, 174, 94, 0.18)"
      }
    }
  },
  plugins: []
};

export default config;
