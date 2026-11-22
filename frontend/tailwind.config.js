/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#0A2A4F", 50: "#EEF4FB", 100: "#C9D8EA", 700: "#164A82", 800: "#0D335E", 900: "#0A2A4F" },
        teal: { DEFAULT: "#12A39F", 50: "#E7F8F6", 100: "#C8EEEC", 500: "#12A39F", 600: "#0E8C89", 700: "#0B7471" },
        brand: { DEFAULT: "#2F7BEA", 50: "#EAF2FD", 100: "#D3E4FB", 500: "#2F7BEA", 600: "#1F64CF", 700: "#1A52A8" },
        mint: { DEFAULT: "#DDF6F1", 50: "#F0FBF8", 100: "#DDF6F1", 300: "#9EE3D6" },
        ink: "#13253F",
        muted: "#60708A",
        line: "#E2EAF3",
        canvas: "#F3F8FC",
      },
      fontFamily: { sans: ["Poppins", "Inter", "Segoe UI", "system-ui", "-apple-system", "Roboto", "Arial", "sans-serif"] },
      boxShadow: {
        card: "0 1px 3px rgba(16,42,79,0.04), 0 8px 24px rgba(16,42,79,0.06)",
        glow: "0 0 0 12px rgba(47,123,234,0.08), 0 0 0 26px rgba(47,123,234,0.05), 0 18px 50px rgba(47,123,234,0.35)",
      },
      backgroundImage: {
        "hero-soft": "linear-gradient(120deg, #E8F3FE 0%, #E3F7F4 60%, #EEF9F6 100%)",
        "brand-grad": "linear-gradient(135deg, #2F7BEA 0%, #12A39F 100%)",
        "orb": "radial-gradient(circle at 35% 30%, #5AA8FF 0%, #2F7BEA 45%, #1C5BC4 100%)",
      },
      keyframes: {
        pulseRing: { "0%": { transform: "scale(1)", opacity: "0.55" }, "100%": { transform: "scale(1.9)", opacity: "0" } },
        bar: { "0%,100%": { transform: "scaleY(0.35)" }, "50%": { transform: "scaleY(1)" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
      },
      animation: { pulseRing: "pulseRing 1.6s ease-out infinite", bar: "bar 1s ease-in-out infinite", float: "float 4s ease-in-out infinite" },
    },
  },
  plugins: [],
};
