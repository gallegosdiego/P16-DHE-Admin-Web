import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: "#D1007F",
        delivered: "#12a85f",
        route: "#1f86ff",
        pending: "#ff8616",
        issue: "#e72256",
      },
      fontFamily: {
        sans: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
      },
    },
  },
};

export default config;
