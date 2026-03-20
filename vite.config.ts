import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defaults, parsePort } from "./globals";

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  server: {
    port: parsePort(process.env.WEB_PORT, defaults.ports.web),
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: `http://localhost:${parsePort(process.env.API_PORT, defaults.ports.api)}`,
        changeOrigin: true,
      },
    },
  },
});
