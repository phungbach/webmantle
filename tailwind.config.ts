import type { Config } from "tailwindcss";

// Tailwind only styles the CMS admin and core chrome. Theme packages ship their own CSS.
// Colours and radii follow the "CMS quản trị" Figma file (Foundations page).
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#EDF1FD",
          100: "#DCE4FB",
          600: "#3B5BDB",
          700: "#2F4AB8",
        },
        success: { 50: "#E6F6EF", 600: "#12805C" },
        warning: { 50: "#FEF3E2", 600: "#B45309" },
        danger: { 50: "#FDECEC", 600: "#C62828" },
        ink: { DEFAULT: "#0F172A", 2: "#475569", 3: "#7B8798" },
        line: { DEFAULT: "#E2E5EB", strong: "#CBD1DB" },
        // Chart palette from the "Full Charts" Figma component set.
        chart: {
          navy: "#03045E",
          blue: "#0077B6",
          cyan: "#00B4D8",
          sky: "#90E0EF",
          mist: "#ADE8F4",
          haze: "#E4F8FF",
          track: "#E9E9E9",
        },
        canvas: "#F6F7F9",
        subtle: "#EEF0F4",
      },
      fontFamily: {
        // Admin only, so the default sans stack (used by preflight) stays unchanged for public pages.
        admin: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
      },
      borderRadius: {
        card: "12px",
        control: "8px",
      },
    },
  },
  plugins: [],
};

export default config;
