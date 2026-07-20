import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// The dev server proxies /api to the backend so the browser makes same-origin
// calls in development. In production the built assets are served by nginx,
// which proxies /api to the backend container (see nginx.conf).
//
// loadEnv() reads the .env file (process.env alone does NOT include .env
// values), so VITE_PORT and VITE_API_PROXY in .env take effect here.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      port: Number(env.VITE_PORT) || 5173,
      strictPort: false, // if the port is taken, Vite picks the next free one
      proxy: {
        "/api": {
          target: env.VITE_API_PROXY || "http://localhost:8000",
          changeOrigin: true,
        },
      },
    },
  };
});
