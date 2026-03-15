import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es2022",
    },
  },
  build: {
    target: "es2022",
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    // In Docker/WSL the server binds to 0.0.0.0, but the browser connects from
    // localhost. Without explicit hmr config, the HMR WebSocket tries to connect
    // to the container's internal hostname and fails.
    hmr: {
      host: "localhost",
      port: 5173,
    },
    watch: {
      usePolling: true,
    },
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL ?? "http://localhost:8000",
        changeOrigin: true,
        // Rewrite Location header in 3xx redirects so the browser sees the
        // proxy host (localhost:5173) instead of the upstream Docker hostname
        // (e.g. api:8000) which the browser can't resolve.
        autoRewrite: true,
      },
      "/ws": {
        target: process.env.VITE_WS_URL ?? "ws://localhost:8000",
        ws: true,
      },
      "/ai": {
        target: process.env.VITE_AI_URL ?? "http://localhost:8001",
        changeOrigin: true,
        autoRewrite: true,
      },
    },
  },
});
