import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The dashboard is served by the Hono auth server in production. In dev, proxy
// the server-side routes to the running auth server on :3000.
const proxy = {
  target: "http://localhost:3000",
  changeOrigin: false,
};

export default defineConfig({
  plugins: [react()],
  build: {
    // Compiled into the server image's ./public directory.
    outDir: "../public",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": proxy,
      "/admin/api": proxy,
      "/.well-known": proxy,
      "/health": proxy,
    },
  },
});
