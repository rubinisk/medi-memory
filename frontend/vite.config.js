import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dev server proxies /api to the FastAPI backend, so the browser never needs API keys.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: { "/api": { target: process.env.VITE_BACKEND_URL || "http://127.0.0.1:8000", changeOrigin: true } },
  },
  build: {
    rollupOptions: { output: { manualChunks: { react: ["react", "react-dom", "react-router-dom"], charts: ["recharts"] } } },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    css: false,
  },
});
